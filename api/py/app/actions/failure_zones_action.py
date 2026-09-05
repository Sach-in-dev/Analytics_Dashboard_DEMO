"""Failure Zones Action — fetches order + address data from prod DB,
computes daily zone-wise failure/RTO metrics (grouped by city/state),
and upserts into the analytics DB.
"""

import logging
from datetime import datetime, timezone, date, timedelta
from app.utils.date import get_date
from app.actions.geography_revenue_action import _normalize_state
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def process_failure_zones(prod_db: AsyncSession, analytics_db: AsyncSession):
    """Full Failure Zones pipeline: fetch prod orders → compute per-zone metrics → upsert.

    Recomputes the last 30 days to capture late status changes.
    """
    logger.info("[FAILURE_ZONES] Starting failure zones processing")

    today = date.today()

    for i in range(1, 32):
        target_date = today - timedelta(days=i)
        await _process_day(prod_db, analytics_db, target_date)

    logger.info("[FAILURE_ZONES] Completed failure zones processing (last 30 days)")


async def _process_day(
    prod_db: AsyncSession,
    analytics_db: AsyncSession,
    target_date: date,
):
    """Compute failure zone metrics for a specific date and upsert into analytics DB."""
    date_range = get_date(date=target_date.isoformat())
    start_time = date_range["start_of_day"]
    end_time = date_range["end_of_day"]

    # Single GROUP BY query: join order + order_address, aggregate by city/state
    result = await prod_db.execute(
        text("""
            SELECT
                COALESCE(INITCAP(TRIM(a.city)), 'Unknown') AS city,
                COALESCE(INITCAP(TRIM(a.state)), 'Unknown') AS state,
                COUNT(*) AS total_orders,
                COUNT(*) FILTER (
                    WHERE o.status IN ('RETURNED', 'FAILED')
                ) AS failed_orders,
                COUNT(*) FILTER (
                    WHERE o.status = 'RETURNED'
                       OR o.status = 'FAILED'
                       OR (o.delivered_at IS NOT NULL
                           AND o.status IN ('CANCELLED', 'REFUNDED'))
                ) AS rto_orders
            FROM "order" o
            LEFT JOIN "order_address" a ON o.shipping_address_id = a.id
            WHERE (o.paid_at IS NOT NULL
                   OR o.status IN ('COMPLETED', 'DELIVERED', 'RETURNED',
                                   'CANCELLED', 'FAILED', 'REFUNDED'))
              AND COALESCE(o.paid_at, o.created_at) >= :start_time
              AND COALESCE(o.paid_at, o.created_at) <= :end_time
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
        failed_orders = int(row[3])
        rto_orders = int(row[4])
        failure_rate = round((failed_orders / total_orders) * 100, 2) if total_orders > 0 else 0.0
        rto_rate = round((rto_orders / total_orders) * 100, 2) if total_orders > 0 else 0.0

        await analytics_db.execute(
            text("""
                INSERT INTO failure_zones_metrics
                    (id, date, city, state, total_orders, failed_orders,
                     rto_orders, failure_rate, rto_rate, "createdAt", "updatedAt")
                VALUES
                    (gen_random_uuid()::text, :date, :city, :state, :total_orders,
                     :failed_orders, :rto_orders, :failure_rate, :rto_rate, :now, :now)
                ON CONFLICT (date, city, state) DO UPDATE SET
                    total_orders = EXCLUDED.total_orders,
                    failed_orders = EXCLUDED.failed_orders,
                    rto_orders = EXCLUDED.rto_orders,
                    failure_rate = EXCLUDED.failure_rate,
                    rto_rate = EXCLUDED.rto_rate,
                    "updatedAt" = EXCLUDED."updatedAt"
            """),
            {
                "date": target_date,
                "city": city,
                "state": state,
                "total_orders": total_orders,
                "failed_orders": failed_orders,
                "rto_orders": rto_orders,
                "failure_rate": failure_rate,
                "rto_rate": rto_rate,
                "now": now,
            }
        )

    await analytics_db.commit()

    total_zones = len(rows)
    total_failed = sum(int(r[3]) for r in rows)
    logger.info(
        f"[FAILURE_ZONES] {target_date}: {total_zones} zones, "
        f"{total_failed} total failures"
    )
