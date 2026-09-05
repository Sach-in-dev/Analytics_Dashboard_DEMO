"""Audience ROAS Action — Meta Ads adset-level performance pipeline.

Pipeline:
  1. Fetch adset-level insights from Meta Marketing API (spend, clicks, impressions, conversions, revenue)
  2. Calculate derived metrics (ROAS, CTR, CPC, conversion_rate)
  3. Upsert into audience_roas_metrics (analytics DB)

Recomputes the last 31 days on each run.
"""

import logging
import httpx
from datetime import datetime, timezone, date, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.config import get_settings

logger = logging.getLogger(__name__)


async def _fetch_meta_adset_insights(
    start_date: date, end_date: date
) -> list[dict]:
    """Fetch daily adset-level insights from Meta Marketing API.

    Returns list of dicts: {adset_id, adset_name, campaign_name, date, spend,
                            impressions, clicks, conversions, revenue}
    """
    settings = get_settings()
    access_token = settings.META_ADS_ACCESS_TOKEN
    account_id = settings.META_ADS_ACCOUNT_ID

    if not access_token or not account_id:
        logger.warning("[AUDIENCE_ROAS] META_ADS_ACCESS_TOKEN or META_ADS_ACCOUNT_ID not set, skipping")
        return []

    url = f"https://graph.facebook.com/v21.0/{account_id}/insights"
    all_data: list[dict] = []

    params = {
        "access_token": access_token,
        "fields": "adset_id,adset_name,campaign_name,spend,impressions,clicks,actions,action_values",
        "time_range": f'{{"since":"{start_date.isoformat()}","until":"{end_date.isoformat()}"}}',
        "time_increment": 1,
        "level": "adset",
        "limit": 500,
    }

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            current_start = start_date
            while current_start <= end_date:
                current_end = min(current_start + timedelta(days=14), end_date)
                
                params["time_range"] = f'{{"since":"{current_start.isoformat()}","until":"{current_end.isoformat()}"}}'
                url = f"https://graph.facebook.com/v21.0/{account_id}/insights"
                
                while url:
                    resp = await client.get(url, params=params)
                    resp.raise_for_status()
                    result = resp.json()

                    for row in result.get("data", []):
                        spend = float(row.get("spend", 0))
                        impressions = int(row.get("impressions", 0))
                        clicks = int(row.get("clicks", 0))

                        # Extract purchase conversions and revenue from actions/action_values
                        conversions = 0
                        revenue = 0.0
                        for action in row.get("actions", []):
                            if action.get("action_type") == "purchase":
                                conversions = int(action.get("value", 0))
                                break
                        for av in row.get("action_values", []):
                            if av.get("action_type") == "purchase":
                                revenue = float(av.get("value", 0))
                                break

                        row_date_str = row.get("date_start", "")
                        try:
                            row_date = datetime.strptime(row_date_str, "%Y-%m-%d").date()
                        except ValueError:
                            continue

                        all_data.append({
                            "adset_id": row.get("adset_id", "unknown"),
                            "adset_name": row.get("adset_name", "Unknown Audience"),
                            "campaign_name": row.get("campaign_name", "Unknown Campaign"),
                            "date": row_date,
                            "spend": spend,
                            "impressions": impressions,
                            "clicks": clicks,
                            "conversions": conversions,
                            "revenue": revenue,
                        })

                    # Handle pagination within chunk (if it still happens)
                    paging = result.get("paging", {})
                    next_url = paging.get("next")
                    if next_url and "v25.0" not in next_url:
                        url = next_url
                        params = {}
                    else:
                        url = None
                
                current_start = current_end + timedelta(days=1)

        logger.info(f"[AUDIENCE_ROAS] Fetched {len(all_data)} adset-day rows from Meta API")

    except httpx.HTTPStatusError as e:
        logger.error(f"[AUDIENCE_ROAS] Meta API HTTP error {e.response.status_code}: {e.response.text[:500]}")
    except httpx.RequestError as e:
        logger.error(f"[AUDIENCE_ROAS] Meta API request error: {e}")
    except Exception as e:
        logger.error(f"[AUDIENCE_ROAS] Meta API unexpected error: {e}")

    return all_data


async def process_audience_roas(prod_db: AsyncSession, analytics_db: AsyncSession, start_dt: date = None, end_dt: date = None):
    """Full Audience ROAS pipeline: Meta Ads adset insights → audience_roas_metrics.

    Fetches adset-level data from Meta Marketing API, computes ROAS/CTR/CPC/conversion_rate,
    and upserts into analytics DB.
    """
    logger.info("[AUDIENCE_ROAS] Starting audience ROAS processing")

    if start_dt and end_dt:
        start_date = start_dt
        end_date = end_dt
    else:
        today = date.today()
        start_date = today - timedelta(days=31)
        end_date = today - timedelta(days=1)

    # ── Step 1: Fetch adset-level data from Meta API ──
    meta_data = await _fetch_meta_adset_insights(start_date, end_date)

    if not meta_data:
        logger.warning("[AUDIENCE_ROAS] No adset data fetched from Meta API")
        return

    # ── Step 2: Aggregate by (date, adset_id) ──
    aggregated: dict[tuple, dict] = {}

    for row in meta_data:
        key = (row["date"], row["adset_id"])
        if key not in aggregated:
            aggregated[key] = {
                "adset_name": row["adset_name"],
                "campaign_name": row["campaign_name"],
                "spend": 0.0,
                "impressions": 0,
                "clicks": 0,
                "conversions": 0,
                "revenue": 0.0,
            }
        agg = aggregated[key]
        agg["spend"] += row["spend"]
        agg["impressions"] += row["impressions"]
        agg["clicks"] += row["clicks"]
        agg["conversions"] += row["conversions"]
        agg["revenue"] += row["revenue"]
        # Keep latest non-default names
        if row["adset_name"] != "Unknown Audience":
            agg["adset_name"] = row["adset_name"]
        if row["campaign_name"] != "Unknown Campaign":
            agg["campaign_name"] = row["campaign_name"]

    logger.info(f"[AUDIENCE_ROAS] Aggregated into {len(aggregated)} adset-day combos")

    # ── Step 3: Compute derived metrics and upsert ──
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    upsert_count = 0

    for (row_date, adset_id), row_data in aggregated.items():
        spend = round(row_data["spend"], 2)
        revenue = round(row_data["revenue"], 2)
        clicks = row_data["clicks"]
        impressions = row_data["impressions"]
        conversions = row_data["conversions"]

        # Derived metrics with division-by-zero protection
        roas = round(revenue / spend, 2) if spend > 0 else 0.0
        ctr = round((clicks / impressions) * 100, 2) if impressions > 0 else 0.0
        cpc = round(spend / clicks, 2) if clicks > 0 else 0.0
        conversion_rate = round((conversions / clicks) * 100, 2) if clicks > 0 else 0.0

        await analytics_db.execute(
            text("""
                INSERT INTO audience_roas_metrics
                    (id, date, adset_id, adset_name, campaign_name,
                     spend, impressions, clicks, conversions, revenue,
                     roas, ctr, cpc, conversion_rate,
                     "createdAt", "updatedAt")
                VALUES
                    (gen_random_uuid()::text, :date, :adset_id, :adset_name,
                     :campaign_name, :spend, :impressions, :clicks, :conversions,
                     :revenue, :roas, :ctr, :cpc, :conversion_rate,
                     :now, :now)
                ON CONFLICT (date, adset_id) DO UPDATE SET
                    adset_name = EXCLUDED.adset_name,
                    campaign_name = EXCLUDED.campaign_name,
                    spend = EXCLUDED.spend,
                    impressions = EXCLUDED.impressions,
                    clicks = EXCLUDED.clicks,
                    conversions = EXCLUDED.conversions,
                    revenue = EXCLUDED.revenue,
                    roas = EXCLUDED.roas,
                    ctr = EXCLUDED.ctr,
                    cpc = EXCLUDED.cpc,
                    conversion_rate = EXCLUDED.conversion_rate,
                    "updatedAt" = EXCLUDED."updatedAt"
            """),
            {
                "date": row_date,
                "adset_id": adset_id,
                "adset_name": row_data["adset_name"],
                "campaign_name": row_data["campaign_name"],
                "spend": spend,
                "impressions": impressions,
                "clicks": clicks,
                "conversions": conversions,
                "revenue": revenue,
                "roas": roas,
                "ctr": ctr,
                "cpc": cpc,
                "conversion_rate": conversion_rate,
                "now": now,
            },
        )
        upsert_count += 1

    await analytics_db.commit()

    total_spend = sum(r["spend"] for r in aggregated.values())
    total_revenue = sum(r["revenue"] for r in aggregated.values())
    unique_adsets = len(set(k[1] for k in aggregated.keys()))

    logger.info(
        f"[AUDIENCE_ROAS] Completed: {upsert_count} rows upserted, "
        f"{unique_adsets} unique audiences, ₹{total_spend:,.0f} total spend, "
        f"₹{total_revenue:,.0f} total revenue"
    )
