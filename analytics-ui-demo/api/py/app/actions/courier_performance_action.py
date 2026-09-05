"""Courier Performance Action — fetches order data from prod DB,
computes daily courier-wise performance metrics (delivery time, RTO, failure rates),
and upserts into the analytics DB.
"""

import logging
from datetime import datetime, timezone, date, timedelta
from app.utils.date import get_date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def process_courier_performance(prod_db: AsyncSession, analytics_db: AsyncSession):
    """Full Courier Performance pipeline: fetch prod orders → compute per-courier metrics → upsert.

    Recomputes the last 30 days to capture late status changes.
    """
    logger.info("[COURIER_PERF] Starting courier performance processing")

    today = date.today()

    for i in range(1, 32):
        target_date = today - timedelta(days=i)
        await _process_day(prod_db, analytics_db, target_date)

    logger.info("[COURIER_PERF] Completed courier performance processing (last 30 days)")


async def _process_day(
    prod_db: AsyncSession,
    analytics_db: AsyncSession,
    target_date: date,
):
    """Compute courier performance metrics for a specific date and upsert into analytics DB."""
    date_range = get_date(date=target_date.isoformat())
    start_time = date_range["start_of_day"]
    end_time = date_range["end_of_day"]

    # Single GROUP BY query: aggregate by carrier_name
    # Only include orders that have a carrier assigned
    result = await prod_db.execute(
        text("""
            SELECT
                TRIM(carrier_name) AS courier_partner,
                COUNT(*) AS total_orders,
                COUNT(*) FILTER (
                    WHERE status = 'DELIVERED' OR delivered_at IS NOT NULL
                ) AS delivered_orders,
                COUNT(*) FILTER (
                    WHERE status = 'RETURNED'
                       OR (status = 'FAILED')
                       OR (delivered_at IS NOT NULL
                           AND status IN ('CANCELLED', 'REFUNDED'))
                ) AS rto_orders,
                COUNT(*) FILTER (
                    WHERE status IN ('RETURNED', 'FAILED')
                ) AS failed_orders,
                ROUND(
                    AVG(
                        EXTRACT(EPOCH FROM (delivered_at - created_at)) / 86400.0
                    ) FILTER (WHERE delivered_at IS NOT NULL)::numeric,
                    1
                ) AS avg_delivery_time
            FROM "order"
            WHERE carrier_name IS NOT NULL
              AND carrier_name != ''
              AND (
                (paid_at >= :start_time AND paid_at <= :end_time)
                OR
                (paid_at IS NULL AND status IN ('DELIVERED', 'COMPLETED')
                 AND created_at >= :start_time AND created_at <= :end_time)
              )
            GROUP BY 1
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
        courier_partner = str(row[0])
        total_orders = int(row[1])
        delivered_orders = int(row[2])
        rto_orders = int(row[3])
        failed_orders = int(row[4])
        avg_delivery_time = float(row[5]) if row[5] is not None else 0.0
        rto_rate = round((rto_orders / total_orders) * 100, 2) if total_orders > 0 else 0.0
        failure_rate = round((failed_orders / total_orders) * 100, 2) if total_orders > 0 else 0.0

        await analytics_db.execute(
            text("""
                INSERT INTO courier_performance_metrics
                    (id, date, courier_partner, total_orders, delivered_orders,
                     rto_orders, failed_orders, rto_rate, failure_rate,
                     avg_delivery_time, "createdAt", "updatedAt")
                VALUES
                    (gen_random_uuid()::text, :date, :courier_partner, :total_orders,
                     :delivered_orders, :rto_orders, :failed_orders, :rto_rate,
                     :failure_rate, :avg_delivery_time, :now, :now)
                ON CONFLICT (date, courier_partner) DO UPDATE SET
                    total_orders = EXCLUDED.total_orders,
                    delivered_orders = EXCLUDED.delivered_orders,
                    rto_orders = EXCLUDED.rto_orders,
                    failed_orders = EXCLUDED.failed_orders,
                    rto_rate = EXCLUDED.rto_rate,
                    failure_rate = EXCLUDED.failure_rate,
                    avg_delivery_time = EXCLUDED.avg_delivery_time,
                    "updatedAt" = EXCLUDED."updatedAt"
            """),
            {
                "date": target_date,
                "courier_partner": courier_partner,
                "total_orders": total_orders,
                "delivered_orders": delivered_orders,
                "rto_orders": rto_orders,
                "failed_orders": failed_orders,
                "rto_rate": rto_rate,
                "failure_rate": failure_rate,
                "avg_delivery_time": avg_delivery_time,
                "now": now,
            }
        )

    await analytics_db.commit()

    total_couriers = len(rows)
    total = sum(int(r[1]) for r in rows)
    logger.info(
        f"[COURIER_PERF] {target_date}: {total_couriers} couriers, "
        f"{total} total orders"
    )
