"""Creative Performance Action — Orders-first hybrid attribution.

Pipeline:
  1. Fetch paid/delivered orders from prod DB (SOURCE OF TRUTH)
  2. Parse referral URL for utm_content → creative_id mapping
  3. Aggregate orders + revenue by (date, creative_id)
  4. Fetch ad-level insights from Meta Marketing API (spend, clicks, impressions, conversions)
  5. Match Meta ads with order creatives; spend-weighted fallback for unmapped orders
  6. Compute derived metrics (ROAS, CTR, CPC, revenue_diff, flag)
  7. Upsert into creative_performance_metrics (analytics DB)

Recomputes the last 31 days on each run to capture late data changes.
"""

import logging
import httpx
from datetime import datetime, timezone, date, timedelta
from urllib.parse import urlparse, parse_qs
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.config import get_settings

logger = logging.getLogger(__name__)


async def _fetch_meta_ad_insights(
    start_date: date, end_date: date
) -> list[dict]:
    """Fetch daily ad-level insights from Meta Marketing API.

    Returns list of dicts: {ad_id, ad_name, campaign_name, date, spend,
                            impressions, clicks, meta_revenue}
    """
    settings = get_settings()
    access_token = settings.META_ADS_ACCESS_TOKEN
    account_id = settings.META_ADS_ACCOUNT_ID

    if not access_token or not account_id:
        logger.warning("[CREATIVE_PERF] META_ADS_ACCESS_TOKEN or META_ADS_ACCOUNT_ID not set, skipping Meta API")
        return []

    url = f"https://graph.facebook.com/v21.0/{account_id}/insights"
    all_data: list[dict] = []

    params = {
        "access_token": access_token,
        "fields": "ad_id,ad_name,campaign_name,spend,impressions,clicks,actions",
        "time_range": f'{{"since":"{start_date.isoformat()}","until":"{end_date.isoformat()}"}}',
        "time_increment": 1,  # Daily breakdown
        "level": "ad",
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

                        # Extract purchase revenue from actions array
                        meta_revenue = 0.0
                        for action in row.get("actions", []):
                            if action.get("action_type") == "purchase":
                                meta_revenue = float(action.get("value", 0))
                                break

                        row_date_str = row.get("date_start", "")
                        try:
                            row_date = datetime.strptime(row_date_str, "%Y-%m-%d").date()
                        except ValueError:
                            continue

                        all_data.append({
                            "ad_id": row.get("ad_id", "unknown"),
                            "ad_name": row.get("ad_name", "Unknown Ad"),
                            "campaign_name": row.get("campaign_name", "Unknown Campaign"),
                            "date": row_date,
                            "spend": spend,
                            "impressions": impressions,
                            "clicks": clicks,
                            "meta_revenue": meta_revenue,
                        })

                    # Handle pagination within the chunk (if it still happens)
                    paging = result.get("paging", {})
                    next_url = paging.get("next")
                    
                    if next_url and "v25.0" not in next_url:
                        url = next_url
                        params = {}  # next_url includes all params
                    else:
                        url = None
                
                current_start = current_end + timedelta(days=1)

        logger.info(f"[CREATIVE_PERF] Fetched {len(all_data)} ad-day rows from Meta API")

    except httpx.HTTPStatusError as e:
        logger.error(f"[CREATIVE_PERF] Meta API HTTP error {e.response.status_code}: {e.response.text[:500]}")
    except httpx.RequestError as e:
        logger.error(f"[CREATIVE_PERF] Meta API request error: {e}")
    except Exception as e:
        logger.error(f"[CREATIVE_PERF] Meta API unexpected error: {e}")

    return all_data


def _parse_utm_content(referral: str | None) -> str:
    """Extract utm_content from a referral URL. Returns 'none' if absent."""
    if not referral:
        return "none"
    try:
        parsed = urlparse(referral)
        params = parse_qs(parsed.query)
        values = params.get("utm_content", [])
        if values and values[0].strip():
            return values[0].strip().lower()
    except Exception:
        pass
    return "none"


def _parse_utm_campaign(referral: str | None) -> str:
    """Extract utm_campaign from a referral URL. Returns 'none' if absent."""
    if not referral:
        return "none"
    try:
        parsed = urlparse(referral)
        params = parse_qs(parsed.query)
        values = params.get("utm_campaign", [])
        if values and values[0].strip():
            return values[0].strip().lower()
    except Exception:
        pass
    return "none"


async def process_creative_performance(prod_db: AsyncSession, analytics_db: AsyncSession, start_dt: date = None, end_dt: date = None):
    """Full Creative Performance pipeline: orders (truth) + Meta Ads → creative_performance_metrics.

    Uses orders-first attribution: actual revenue from prod DB is the source of truth.
    Meta Ads data provides creative-level mapping, spend, impressions, clicks.
    Spend-weighted fallback for orders without utm_content.
    """
    logger.info("[CREATIVE_PERF] Starting creative performance processing")

    if start_dt and end_dt:
        start_date = start_dt
        end_date = end_dt
    else:
        today = date.today()
        start_date = today - timedelta(days=31)
        end_date = today - timedelta(days=1)

    # ── Step 1: Fetch paid/delivered orders with referral URL ──
    orders_result = await prod_db.execute(
        text("""
            SELECT
                id,
                email,
                total,
                referral,
                COALESCE(paid_at, created_at)::date AS order_date
            FROM "order"
            WHERE (paid_at IS NOT NULL OR status IN ('COMPLETED', 'DELIVERED'))
              AND COALESCE(paid_at, created_at)::date >= :start_date
              AND COALESCE(paid_at, created_at)::date <= :end_date
        """),
        {"start_date": start_date, "end_date": end_date},
    )
    orders = orders_result.all()
    logger.info(f"[CREATIVE_PERF] Fetched {len(orders)} orders from prod DB")

    # ── Step 2: Parse utm_content and aggregate by (date, creative_id) ──
    # Aggregation: date → creative_id → {orders, revenue, campaign}
    creative_orders: dict[tuple, dict] = {}  # (date, creative_id) → {orders, revenue, campaign}
    daily_unmapped_orders: dict[date, dict] = {}  # date → {orders, revenue}

    for order in orders:
        order_id, email, total, referral, order_date = order
        revenue = float(total or 0)
        creative_id = _parse_utm_content(referral)
        campaign = _parse_utm_campaign(referral)

        if creative_id == "none":
            # No utm_content — will use spend-weighted attribution
            if order_date not in daily_unmapped_orders:
                daily_unmapped_orders[order_date] = {"orders": 0, "revenue": 0.0}
            daily_unmapped_orders[order_date]["orders"] += 1
            daily_unmapped_orders[order_date]["revenue"] += revenue
        else:
            key = (order_date, creative_id)
            if key not in creative_orders:
                creative_orders[key] = {"orders": 0, "revenue": 0.0, "campaign": campaign}
            creative_orders[key]["orders"] += 1
            creative_orders[key]["revenue"] += revenue
            # Keep the non-none campaign if available
            if campaign != "none" and creative_orders[key]["campaign"] == "none":
                creative_orders[key]["campaign"] = campaign

    mapped_count = sum(v["orders"] for v in creative_orders.values())
    unmapped_count = sum(v["orders"] for v in daily_unmapped_orders.values())
    logger.info(f"[CREATIVE_PERF] Orders mapped: {mapped_count}, unmapped: {unmapped_count}")

    # ── Step 3: Fetch Meta Ads ad-level data ──
    meta_data = await _fetch_meta_ad_insights(start_date, end_date)

    # Build meta lookup: (date, ad_id) → {ad_name, campaign_name, spend, impressions, clicks, meta_revenue}
    meta_map: dict[tuple, dict] = {}
    daily_total_spend: dict[date, float] = {}
    ad_names: dict[str, str] = {}  # ad_id → ad_name
    ad_campaigns: dict[str, str] = {}  # ad_id → campaign_name

    for row in meta_data:
        key = (row["date"], row["ad_id"])
        if key not in meta_map:
            meta_map[key] = {
                "ad_name": row["ad_name"],
                "campaign_name": row["campaign_name"],
                "spend": 0.0,
                "impressions": 0,
                "clicks": 0,
                "meta_revenue": 0.0,
            }
        meta_map[key]["spend"] += row["spend"]
        meta_map[key]["impressions"] += row["impressions"]
        meta_map[key]["clicks"] += row["clicks"]
        meta_map[key]["meta_revenue"] += row["meta_revenue"]
        ad_names[row["ad_id"]] = row["ad_name"]
        ad_campaigns[row["ad_id"]] = row["campaign_name"]
        daily_total_spend[row["date"]] = daily_total_spend.get(row["date"], 0.0) + row["spend"]

    if not meta_map:
        logger.warning("[CREATIVE_PERF] No Meta ad-level data found. Processing with orders-only data.")

    # ── Step 4: Build merged creative rows ──
    # Final structure: (date, creative_id) → full metrics dict
    final_rows: dict[tuple, dict] = {}

    # 4a. Start with all Meta ads — even those with no direct order match
    for (row_date, ad_id), meta_info in meta_map.items():
        key = (row_date, ad_id)
        final_rows[key] = {
            "creative_id": ad_id,
            "creative_name": meta_info["ad_name"],
            "campaign_name": meta_info["campaign_name"],
            "orders": 0,
            "revenue_actual": 0.0,
            "spend": meta_info["spend"],
            "clicks": meta_info["clicks"],
            "impressions": meta_info["impressions"],
            "meta_revenue": meta_info["meta_revenue"],
        }

    # 4b. Match orders with direct utm_content → ad mapping
    for (order_date, creative_id), order_data in creative_orders.items():
        # Try to find matching Meta ad by creative_id (could be ad_id or ad_name fragment)
        matched_meta_key = None

        # Direct match: creative_id == ad_id
        if (order_date, creative_id) in final_rows:
            matched_meta_key = (order_date, creative_id)
        else:
            # Try matching creative_id against ad_name (case-insensitive substring)
            for (rd, aid), meta_info in meta_map.items():
                if rd == order_date and (
                    creative_id == aid or
                    creative_id in meta_info["ad_name"].lower() or
                    meta_info["ad_name"].lower() in creative_id
                ):
                    matched_meta_key = (rd, aid)
                    break

        if matched_meta_key and matched_meta_key in final_rows:
            # Merge order data into existing Meta row
            final_rows[matched_meta_key]["orders"] += order_data["orders"]
            final_rows[matched_meta_key]["revenue_actual"] += order_data["revenue"]
            if order_data["campaign"] != "none":
                final_rows[matched_meta_key]["campaign_name"] = order_data["campaign"]
        else:
            # No Meta match — create orders-only row
            key = (order_date, creative_id)
            if key not in final_rows:
                final_rows[key] = {
                    "creative_id": creative_id,
                    "creative_name": creative_id,  # Use utm_content as name
                    "campaign_name": order_data["campaign"],
                    "orders": 0,
                    "revenue_actual": 0.0,
                    "spend": 0.0,
                    "clicks": 0,
                    "impressions": 0,
                    "meta_revenue": 0.0,
                }
            final_rows[key]["orders"] += order_data["orders"]
            final_rows[key]["revenue_actual"] += order_data["revenue"]

    # 4c. Spend-weighted attribution for unmapped orders
    for unmapped_date, unmapped_data in daily_unmapped_orders.items():
        day_total_spend = daily_total_spend.get(unmapped_date, 0.0)
        if day_total_spend <= 0:
            continue  # Can't attribute without spend data

        # Distribute unmapped orders across Meta ads proportional to spend
        for (rd, aid), meta_info in meta_map.items():
            if rd != unmapped_date:
                continue
            spend_share = meta_info["spend"] / day_total_spend if day_total_spend > 0 else 0
            key = (rd, aid)
            if key in final_rows:
                final_rows[key]["orders"] += round(unmapped_data["orders"] * spend_share)
                final_rows[key]["revenue_actual"] += round(unmapped_data["revenue"] * spend_share, 2)

    # ── Step 5: Compute derived metrics and upsert ──
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    upsert_count = 0

    for (row_date, creative_id), row_data in final_rows.items():
        spend = round(row_data["spend"], 2)
        revenue_actual = round(row_data["revenue_actual"], 2)
        clicks = row_data["clicks"]
        impressions = row_data["impressions"]
        meta_revenue = round(row_data["meta_revenue"], 2)

        # Derived metrics
        roas = round(revenue_actual / spend, 2) if spend > 0 else 0.0
        ctr = round((clicks / impressions) * 100, 2) if impressions > 0 else 0.0
        cpc = round(spend / clicks, 2) if clicks > 0 else 0.0

        # Revenue difference: how much Meta over-reports vs actual
        if revenue_actual > 0:
            revenue_diff = round(((meta_revenue - revenue_actual) / revenue_actual) * 100, 2)
        else:
            revenue_diff = 0.0

        # Flag if Meta over-reporting by >20%
        flag = "Meta Over-reporting" if revenue_diff > 20 else None

        await analytics_db.execute(
            text("""
                INSERT INTO creative_performance_metrics
                    (id, date, creative_id, creative_name, campaign_name,
                     orders, revenue_actual, spend, clicks, impressions,
                     roas, ctr, cpc, meta_revenue, revenue_diff, flag,
                     "createdAt", "updatedAt")
                VALUES
                    (gen_random_uuid()::text, :date, :creative_id, :creative_name,
                     :campaign_name, :orders, :revenue_actual, :spend, :clicks,
                     :impressions, :roas, :ctr, :cpc, :meta_revenue,
                     :revenue_diff, :flag, :now, :now)
                ON CONFLICT (date, creative_id) DO UPDATE SET
                    creative_name = EXCLUDED.creative_name,
                    campaign_name = EXCLUDED.campaign_name,
                    orders = EXCLUDED.orders,
                    revenue_actual = EXCLUDED.revenue_actual,
                    spend = EXCLUDED.spend,
                    clicks = EXCLUDED.clicks,
                    impressions = EXCLUDED.impressions,
                    roas = EXCLUDED.roas,
                    ctr = EXCLUDED.ctr,
                    cpc = EXCLUDED.cpc,
                    meta_revenue = EXCLUDED.meta_revenue,
                    revenue_diff = EXCLUDED.revenue_diff,
                    flag = EXCLUDED.flag,
                    "updatedAt" = EXCLUDED."updatedAt"
            """),
            {
                "date": row_date,
                "creative_id": creative_id,
                "creative_name": row_data["creative_name"],
                "campaign_name": row_data["campaign_name"],
                "orders": row_data["orders"],
                "revenue_actual": revenue_actual,
                "spend": spend,
                "clicks": clicks,
                "impressions": impressions,
                "roas": roas,
                "ctr": ctr,
                "cpc": cpc,
                "meta_revenue": meta_revenue,
                "revenue_diff": revenue_diff,
                "flag": flag,
                "now": now,
            },
        )
        upsert_count += 1

    await analytics_db.commit()

    total_spend = sum(r["spend"] for r in final_rows.values())
    total_revenue = sum(r["revenue_actual"] for r in final_rows.values())
    total_orders = sum(r["orders"] for r in final_rows.values())
    flagged = sum(1 for r in final_rows.values() if r.get("meta_revenue", 0) > 0 and
                  r.get("revenue_actual", 0) > 0 and
                  ((r["meta_revenue"] - r["revenue_actual"]) / r["revenue_actual"] * 100) > 20)

    logger.info(
        f"[CREATIVE_PERF] Completed: {upsert_count} rows upserted, "
        f"{len(ad_names)} Meta ads, ₹{total_spend:,.0f} total spend, "
        f"₹{total_revenue:,.0f} actual revenue, {total_orders} orders, "
        f"{flagged} over-reporting flags"
    )
