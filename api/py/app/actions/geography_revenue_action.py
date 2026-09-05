"""Geography Revenue Action — fetches order + address data from prod DB,
computes daily revenue metrics grouped by city/state,
and upserts into the analytics DB.
"""

import logging
from datetime import datetime, timezone, date, timedelta
from app.utils.date import get_date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)

STATE_ABBR = {
    "an": "Andaman And Nicobar Islands", "ap": "Andhra Pradesh", "ar": "Arunachal Pradesh",
    "as": "Assam", "br": "Bihar", "ch": "Chandigarh", "ct": "Chhattisgarh",
    "dl": "Delhi", "ga": "Goa", "gj": "Gujarat", "hp": "Himachal Pradesh",
    "hr": "Haryana", "jh": "Jharkhand", "jk": "Jammu And Kashmir",
    "ka": "Karnataka", "kl": "Kerala", "la": "Ladakh",
    "mh": "Maharashtra", "ml": "Meghalaya", "mn": "Manipur",
    "mp": "Madhya Pradesh", "mz": "Mizoram", "nl": "Nagaland",
    "od": "Odisha", "or": "Odisha", "pb": "Punjab", "py": "Puducherry",
    "rj": "Rajasthan", "sk": "Sikkim", "tn": "Tamil Nadu",
    "tr": "Tripura", "ts": "Telangana", "uk": "Uttarakhand",
    "up": "Uttar Pradesh", "wb": "West Bengal",
}

def _normalize_state(raw: str) -> str:
    return STATE_ABBR.get(raw.lower().strip(), raw)


async def process_geography_revenue(prod_db: AsyncSession, analytics_db: AsyncSession):
    """Full Geography Revenue pipeline: fetch prod orders → compute per-zone revenue → upsert.

    Recomputes the last 30 days to capture late status changes.
    """
    logger.info("[GEO_REVENUE] Starting geography revenue processing")

    today = date.today()

    for i in range(1, 32):
        target_date = today - timedelta(days=i)
        await _process_day(prod_db, analytics_db, target_date)

    logger.info("[GEO_REVENUE] Completed geography revenue processing (last 30 days)")


async def _process_day(
    prod_db: AsyncSession,
    analytics_db: AsyncSession,
    target_date: date,
):
    """Compute geography revenue metrics for a specific date and upsert into analytics DB."""
    date_range = get_date(date=target_date.isoformat())
    start_time = date_range["start_of_day"]
    end_time = date_range["end_of_day"]

    # Single GROUP BY query: join order + order_address, aggregate by city/state
    # Include only successful orders: COMPLETED/DELIVERED or paid
    result = await prod_db.execute(
        text("""
            SELECT
                COALESCE(INITCAP(TRIM(a.city)), 'Unknown') AS city,
                COALESCE(INITCAP(TRIM(a.state)), 'Unknown') AS state,
                COUNT(*) AS total_orders,
                COALESCE(SUM(o.total), 0) AS total_revenue,
                COUNT(DISTINCT o.customer_id) AS unique_customers
            FROM "order" o
            LEFT JOIN "order_address" a ON o.shipping_address_id = a.id
            WHERE (
                (o.paid_at >= :start_time AND o.paid_at <= :end_time)
                OR
                (o.paid_at IS NULL AND o.status IN ('DELIVERED', 'COMPLETED')
                 AND o.created_at >= :start_time AND o.created_at <= :end_time)
            )
            GROUP BY 1, 2
            HAVING COUNT(*) >= 1
        """),
        {
            "start_time": start_time,
            "end_time": end_time,
        },
    )
    rows = result.all()

    if not rows:
        return

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    for row in rows:
        city = str(row[0])
        state = _normalize_state(str(row[1]))
        total_orders = int(row[2])
        total_revenue = float(row[3])
        unique_customers = int(row[4])
        avg_order_value = round(total_revenue / total_orders, 2) if total_orders > 0 else 0.0

        await analytics_db.execute(
            text("""
                INSERT INTO geography_revenue_metrics
                    (id, date, city, state, total_orders, total_revenue,
                     avg_order_value, unique_customers, "createdAt", "updatedAt")
                VALUES
                    (gen_random_uuid()::text, :date, :city, :state, :total_orders,
                     :total_revenue, :avg_order_value, :unique_customers, :now, :now)
                ON CONFLICT (date, city, state) DO UPDATE SET
                    total_orders = EXCLUDED.total_orders,
                    total_revenue = EXCLUDED.total_revenue,
                    avg_order_value = EXCLUDED.avg_order_value,
                    unique_customers = EXCLUDED.unique_customers,
                    "updatedAt" = EXCLUDED."updatedAt"
            """),
            {
                "date": target_date,
                "city": city,
                "state": state,
                "total_orders": total_orders,
                "total_revenue": total_revenue,
                "avg_order_value": avg_order_value,
                "unique_customers": unique_customers,
                "now": now,
            }
        )

    await analytics_db.commit()

    total_zones = len(rows)
    total_rev = sum(float(r[3]) for r in rows)
    logger.info(
        f"[GEO_REVENUE] {target_date}: {total_zones} zones, "
        f"₹{total_rev:,.0f} total revenue"
    )
