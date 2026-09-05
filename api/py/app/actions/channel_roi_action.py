"""Channel ROI Action — aggregates UTM attribution revenue data with
spend config to compute ROI/ROAS metrics per marketing channel.

Pipeline:
  1. Query utm_attribution_metrics from analytics DB → classify utm_source → channel
  2. Query channel_spend_config from analytics DB → get daily spend per channel
  3. Compute ROI = (revenue - spend) / spend, ROAS = revenue / spend
  4. Upsert into channel_roi_metrics (analytics DB)

Recomputes the last 30 days on each run to capture late data changes.
NOTE: This action reads ONLY from the analytics DB (no prod DB needed).
"""

import logging
from datetime import datetime, timezone, date, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)

# ── Channel Classification Map ──
# Maps utm_source values to canonical channel names.
CHANNEL_MAP = {
    "facebook": "Facebook Ads",
    "fb": "Facebook Ads",
    "facebook_ads": "Facebook Ads",
    "fb_ads": "Facebook Ads",
    "instagram": "Facebook Ads",
    "ig": "Facebook Ads",
    "meta": "Facebook Ads",
    "google": "Google Ads",
    "google_ads": "Google Ads",
    "googleads": "Google Ads",
    "adwords": "Google Ads",
    "gclid": "Google Ads",
    "youtube": "Google Ads",
    "klaviyo": "Email",
    "email": "Email",
    "newsletter": "Email",
    "mail": "Email",
    "mailchimp": "Email",
    "influencer": "Influencer",
    "creator": "Influencer",
    "collab": "Influencer",
    "organic": "Organic",
    "direct": "Organic",
    "website": "Organic",
    "beautybarn": "Organic",
}


def _classify_channel(utm_source: str) -> str:
    """Classify a utm_source value into a canonical channel name."""
    src = (utm_source or "direct").strip().lower()

    # Direct match
    if src in CHANNEL_MAP:
        return CHANNEL_MAP[src]

    # Substring match
    for key, channel in CHANNEL_MAP.items():
        if key in src:
            return channel

    return "Other"


async def process_channel_roi(analytics_db: AsyncSession, start_dt: date = None, end_dt: date = None):
    """Full Channel ROI pipeline: utm_attribution_metrics + spend_config → channel_roi_metrics.

    Recomputes the last 30 days to capture late data changes,
    unless explicit start_dt/end_dt are provided for backfill.
    """
    logger.info("[CHANNEL_ROI] Starting channel ROI metrics processing")

    if start_dt and end_dt:
        start_date = start_dt
        end_date = end_dt
    else:
        today = date.today()
        start_date = today - timedelta(days=31)
        end_date = today - timedelta(days=1)

    # ── Step 1: Fetch revenue data from utm_attribution_metrics ──
    revenue_result = await analytics_db.execute(
        text("""
            SELECT
                date,
                utm_source,
                SUM(orders) AS total_orders,
                SUM(revenue) AS total_revenue,
                SUM(users) AS unique_users
            FROM utm_attribution_metrics
            WHERE date >= :start_date AND date <= :end_date
            GROUP BY date, utm_source
        """),
        {"start_date": start_date, "end_date": end_date},
    )
    revenue_rows = revenue_result.all()

    # ── Step 2: Aggregate by (date, channel) ──
    channel_data: dict[tuple, dict] = {}

    for row in revenue_rows:
        row_date = row[0]
        utm_source = row[1] or "direct"
        orders = int(row[2]) if row[2] else 0
        revenue = float(row[3]) if row[3] else 0.0
        users = int(row[4]) if row[4] else 0

        channel = _classify_channel(utm_source)
        key = (row_date, channel)

        if key not in channel_data:
            channel_data[key] = {
                "total_revenue": 0.0,
                "total_orders": 0,
                "unique_users": 0,
            }

        channel_data[key]["total_revenue"] += revenue
        channel_data[key]["total_orders"] += orders
        channel_data[key]["unique_users"] += users

    if not channel_data:
        logger.warning("[CHANNEL_ROI] No revenue data found in utm_attribution_metrics")
        return

    # ── Step 3: Fetch spend data from channel_spend_config ──
    spend_result = await analytics_db.execute(
        text("""
            SELECT date, channel, spend
            FROM channel_spend_config
            WHERE date >= :start_date AND date <= :end_date
        """),
        {"start_date": start_date, "end_date": end_date},
    )
    spend_rows = spend_result.all()

    spend_map: dict[tuple, float] = {}
    for row in spend_rows:
        spend_map[(row[0], row[1])] = float(row[2]) if row[2] else 0.0

    # ── Step 4: Compute ROI/ROAS and upsert ──
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    upsert_count = 0

    for (row_date, channel), metrics in channel_data.items():
        revenue = round(metrics["total_revenue"], 2)
        orders = metrics["total_orders"]
        users = metrics["unique_users"]
        spend = spend_map.get((row_date, channel), 0.0)

        # ROI = (Revenue - Spend) / Spend — division by zero → 0
        roi = round((revenue - spend) / spend, 2) if spend > 0 else 0.0
        # ROAS = Revenue / Spend — division by zero → 0
        roas = round(revenue / spend, 2) if spend > 0 else 0.0

        await analytics_db.execute(
            text("""
                INSERT INTO channel_roi_metrics
                    (id, date, channel, total_revenue, total_spend,
                     roi, roas, total_orders, unique_users,
                     "createdAt", "updatedAt")
                VALUES
                    (gen_random_uuid()::text, :date, :channel, :total_revenue,
                     :total_spend, :roi, :roas, :total_orders, :unique_users,
                     :now, :now)
                ON CONFLICT (date, channel) DO UPDATE SET
                    total_revenue = EXCLUDED.total_revenue,
                    total_spend = EXCLUDED.total_spend,
                    roi = EXCLUDED.roi,
                    roas = EXCLUDED.roas,
                    total_orders = EXCLUDED.total_orders,
                    unique_users = EXCLUDED.unique_users,
                    "updatedAt" = EXCLUDED."updatedAt"
            """),
            {
                "date": row_date,
                "channel": channel,
                "total_revenue": revenue,
                "total_spend": round(spend, 2),
                "roi": roi,
                "roas": roas,
                "total_orders": orders,
                "unique_users": users,
                "now": now,
            },
        )
        upsert_count += 1

    await analytics_db.commit()

    total_revenue = sum(m["total_revenue"] for m in channel_data.values())
    logger.info(
        f"[CHANNEL_ROI] Completed: {upsert_count} rows upserted, "
        f"{len(set(ch for _, ch in channel_data.keys()))} channels, "
        f"₹{total_revenue:,.0f} total revenue"
    )
