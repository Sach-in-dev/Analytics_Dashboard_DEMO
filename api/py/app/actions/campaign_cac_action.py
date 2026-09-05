"""Campaign CAC Action — fetches Meta Ads campaign spend data and
combines with prod DB new customer counts to compute Customer Acquisition Cost.

Pipeline:
  1. Fetch campaign spend from Meta Marketing API (graph.facebook.com)
  2. Fetch ALL paid orders from prod DB per day
  3. Identify new customers (first order ever = new)
  4. Attribute new customers to the HIGHEST-SPEND campaign per day
     (since Advantage+ campaigns don't carry UTM params in referral URLs)
  5. Compute CAC = total_spend / new_customers per (date, campaign_id)
  6. Upsert into campaign_cac_metrics (analytics DB)

Attribution Strategy:
  Since Advantage+ Shopping Campaigns use automated placements and typically
  don't pass utm_campaign params in order referral URLs, we use a
  spend-weighted attribution model: each day's new customers are distributed
  across campaigns proportional to their spend share. This gives the primary
  campaign (e.g. "Adv+ General overall") the majority of attributions.

Recomputes the last 30 days on each run to capture late data changes.
"""

import logging
import httpx
from datetime import datetime, timezone, date, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.config import get_settings

logger = logging.getLogger(__name__)


async def _fetch_meta_campaign_spend(
    start_date: date, end_date: date
) -> list[dict]:
    """Fetch daily campaign-level spend from Meta Marketing API.

    Returns list of dicts: {campaign_id, campaign_name, date, spend}
    """
    settings = get_settings()
    access_token = settings.META_ADS_ACCESS_TOKEN
    account_id = settings.META_ADS_ACCOUNT_ID

    if not access_token or not account_id:
        logger.warning("[CAMPAIGN_CAC] META_ADS_ACCESS_TOKEN or META_ADS_ACCOUNT_ID not set, skipping Meta API")
        return []

    url = f"https://graph.facebook.com/v21.0/{account_id}/insights"
    all_data: list[dict] = []

    params = {
        "access_token": access_token,
        "fields": "campaign_id,campaign_name,spend",
        "time_range": f'{{"since":"{start_date.isoformat()}","until":"{end_date.isoformat()}"}}',
        "time_increment": 1,  # Daily breakdown
        "level": "campaign",
        "limit": 500,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            while True:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                result = resp.json()

                for row in result.get("data", []):
                    spend = float(row.get("spend", 0))
                    if spend <= 0:
                        continue
                    # date_start is the day of this insight row
                    row_date_str = row.get("date_start", "")
                    try:
                        row_date = datetime.strptime(row_date_str, "%Y-%m-%d").date()
                    except ValueError:
                        continue

                    all_data.append({
                        "campaign_id": row.get("campaign_id", "unknown"),
                        "campaign_name": row.get("campaign_name", "Unknown Campaign"),
                        "date": row_date,
                        "spend": spend,
                    })

                # Handle pagination
                paging = result.get("paging", {})
                next_url = paging.get("next")
                if next_url:
                    url = next_url
                    params = {}  # next_url includes all params
                else:
                    break

        logger.info(f"[CAMPAIGN_CAC] Fetched {len(all_data)} campaign-day rows from Meta API")

    except httpx.HTTPStatusError as e:
        logger.error(f"[CAMPAIGN_CAC] Meta API HTTP error {e.response.status_code}: {e.response.text[:500]}")
    except httpx.RequestError as e:
        logger.error(f"[CAMPAIGN_CAC] Meta API request error: {e}")
    except Exception as e:
        logger.error(f"[CAMPAIGN_CAC] Meta API unexpected error: {e}")

    return all_data


async def process_campaign_cac(prod_db: AsyncSession, analytics_db: AsyncSession, start_dt: date = None, end_dt: date = None):
    """Full Campaign CAC pipeline: Meta spend + prod orders → campaign_cac_metrics.

    Uses spend-weighted attribution: new customers per day are distributed
    across Meta campaigns proportional to each campaign's daily spend share.
    """
    logger.info("[CAMPAIGN_CAC] Starting campaign CAC metrics processing")

    if start_dt and end_dt:
        start_date = start_dt
        end_date = end_dt
    else:
        today = date.today()
        start_date = today - timedelta(days=31)
        end_date = today - timedelta(days=1)

    # ── Step 1: Fetch campaign spend from Meta API ──
    meta_data = await _fetch_meta_campaign_spend(start_date, end_date)

    # Build spend lookup: (date, campaign_id) → {name, spend}
    spend_map: dict[tuple, dict] = {}
    campaign_names: dict[str, str] = {}  # campaign_id → name
    # Daily total spend for attribution weighting
    daily_total_spend: dict[date, float] = {}

    for row in meta_data:
        key = (row["date"], row["campaign_id"])
        if key not in spend_map:
            spend_map[key] = {"campaign_name": row["campaign_name"], "spend": 0.0}
        spend_map[key]["spend"] += row["spend"]
        campaign_names[row["campaign_id"]] = row["campaign_name"]
        daily_total_spend[row["date"]] = daily_total_spend.get(row["date"], 0.0) + row["spend"]

    if not spend_map:
        logger.warning("[CAMPAIGN_CAC] No Meta spend data found, skipping")
        return

    # ── Step 2: Fetch ALL paid orders per day from prod DB ──
    orders_result = await prod_db.execute(
        text("""
            SELECT
                email,
                total,
                COALESCE(paid_at, created_at)::date AS order_date
            FROM "order"
            WHERE (paid_at IS NOT NULL OR status IN ('COMPLETED', 'DELIVERED'))
              AND COALESCE(paid_at, created_at)::date >= :start_date
              AND COALESCE(paid_at, created_at)::date <= :end_date
        """),
        {"start_date": start_date, "end_date": end_date},
    )
    orders = orders_result.all()
    logger.info(f"[CAMPAIGN_CAC] Fetched {len(orders)} orders from prod DB")

    # ── Step 3: Identify first-time customers ──
    # Get first order date per email (across ALL history)
    first_order_result = await prod_db.execute(
        text("""
            SELECT
                email,
                MIN(COALESCE(paid_at, created_at))::date AS first_order_date
            FROM "order"
            WHERE paid_at IS NOT NULL OR status IN ('COMPLETED', 'DELIVERED')
            GROUP BY email
        """)
    )
    first_order_map: dict[str, date] = {}
    for row in first_order_result.all():
        if row[0]:
            first_order_map[row[0].lower().strip()] = row[1]

    # ── Step 4: Aggregate daily new customers and total orders/revenue ──
    daily_stats: dict[date, dict] = {}  # date → {new_customers, total_orders, total_revenue}

    for order in orders:
        email, total, order_date = order
        email_lower = (email or "").lower().strip()
        if not email_lower:
            continue

        if order_date not in daily_stats:
            daily_stats[order_date] = {
                "new_customers": set(),
                "total_orders": 0,
                "total_revenue": 0.0,
            }

        daily_stats[order_date]["total_orders"] += 1
        daily_stats[order_date]["total_revenue"] += float(total or 0)

        # Is this a first-time customer?
        first_date = first_order_map.get(email_lower)
        if first_date and first_date == order_date:
            daily_stats[order_date]["new_customers"].add(email_lower)

    # ── Step 5: Attribute new customers to campaigns via spend-weighted model ──
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    upsert_count = 0
    total_new_attributed = 0

    for (row_date, campaign_id), spend_info in spend_map.items():
        campaign_name = spend_info["campaign_name"]
        spend = round(spend_info["spend"], 2)

        # Get daily totals
        day_stats = daily_stats.get(row_date, {})
        day_new_customers = len(day_stats.get("new_customers", set()))
        day_total_orders = day_stats.get("total_orders", 0)
        day_total_revenue = round(day_stats.get("total_revenue", 0.0), 2)
        day_total_spend = daily_total_spend.get(row_date, 0.0)

        # Spend-weighted attribution: this campaign's share of daily spend
        if day_total_spend > 0:
            spend_share = spend / day_total_spend
        else:
            spend_share = 0.0

        # Attribute new customers, orders, revenue proportional to spend share
        attributed_new = round(day_new_customers * spend_share)
        attributed_orders = round(day_total_orders * spend_share)
        attributed_revenue = round(day_total_revenue * spend_share, 2)

        # CAC = spend / attributed_new_customers
        cac = round(spend / attributed_new, 2) if attributed_new > 0 else 0.0
        total_new_attributed += attributed_new

        await analytics_db.execute(
            text("""
                INSERT INTO campaign_cac_metrics
                    (id, date, campaign_id, campaign_name, total_spend,
                     new_customers, total_orders, total_revenue, cac,
                     "createdAt", "updatedAt")
                VALUES
                    (gen_random_uuid()::text, :date, :campaign_id, :campaign_name,
                     :total_spend, :new_customers, :total_orders, :total_revenue,
                     :cac, :now, :now)
                ON CONFLICT (date, campaign_id) DO UPDATE SET
                    campaign_name = EXCLUDED.campaign_name,
                    total_spend = EXCLUDED.total_spend,
                    new_customers = EXCLUDED.new_customers,
                    total_orders = EXCLUDED.total_orders,
                    total_revenue = EXCLUDED.total_revenue,
                    cac = EXCLUDED.cac,
                    "updatedAt" = EXCLUDED."updatedAt"
            """),
            {
                "date": row_date,
                "campaign_id": campaign_id,
                "campaign_name": campaign_name,
                "total_spend": spend,
                "new_customers": attributed_new,
                "total_orders": attributed_orders,
                "total_revenue": attributed_revenue,
                "cac": cac,
                "now": now,
            },
        )
        upsert_count += 1

    await analytics_db.commit()

    total_spend = sum(s["spend"] for s in spend_map.values())
    logger.info(
        f"[CAMPAIGN_CAC] Completed: {upsert_count} rows upserted, "
        f"{len(campaign_names)} Meta campaigns, "
        f"₹{total_spend:,.0f} total spend, {total_new_attributed} new customers attributed"
    )
