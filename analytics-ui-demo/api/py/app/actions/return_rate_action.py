"""Return Rate Action — fetches delivered+returned order data from prod DB,
computes daily return metrics (post-delivery returns only),
and upserts into the analytics DB.

Key distinction from RTO:
- RTO = orders that NEVER reached the customer (returned/failed before delivery)
- Return Rate = orders DELIVERED to customer but RETURNED afterwards
"""

import logging
from datetime import datetime, timezone, date, timedelta
from app.utils.date import get_date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def process_return_rate(prod_db: AsyncSession, analytics_db: AsyncSession):
    """Full Return Rate pipeline: fetch prod orders → compute metrics per day → upsert.

    Recomputes the last 30 days to capture late status changes.
    """
    logger.info("[RETURN_RATE] Starting return rate metrics processing")

    today = date.today()

    for i in range(1, 32):
        target_date = today - timedelta(days=i)
        await _process_day(prod_db, analytics_db, target_date)

    logger.info("[RETURN_RATE] Completed return rate metrics processing (last 30 days)")


async def _process_day(
    prod_db: AsyncSession,
    analytics_db: AsyncSession,
    target_date: date,
):
    """Compute return rate metrics for a specific date and upsert into analytics DB."""
    date_range = get_date(date=target_date.isoformat())
    start_time = date_range["start_of_day"]
    end_time = date_range["end_of_day"]

    # Step 1: Count delivered orders AND returned-after-delivery orders
    # Delivered = status = 'DELIVERED' OR delivered_at IS NOT NULL
    # Returned (post-delivery) = status = 'RETURNED' AND delivered_at IS NOT NULL
    result = await prod_db.execute(
        text("""
            SELECT
                COUNT(*) FILTER (
                    WHERE status = 'DELIVERED'
                       OR delivered_at IS NOT NULL
                ) AS total_delivered_orders,
                COUNT(*) FILTER (
                    WHERE status = 'RETURNED'
                      AND delivered_at IS NOT NULL
                ) AS returned_orders,
                COALESCE(SUM(total) FILTER (
                    WHERE status = 'RETURNED'
                      AND delivered_at IS NOT NULL
                ), 0) AS return_revenue_loss
            FROM "order"
            WHERE (paid_at IS NOT NULL OR status IN ('COMPLETED', 'DELIVERED', 'RETURNED', 'CANCELLED', 'FAILED', 'REFUNDED'))
              AND COALESCE(paid_at, created_at) >= :start_time
              AND COALESCE(paid_at, created_at) <= :end_time
        """),
        {
            "start_time": start_time,
            "end_time": end_time,
        },
    )
    row = result.one()

    total_delivered = int(row[0])
    returned_orders = int(row[1])
    return_revenue_loss = float(row[2])
    return_rate = round((returned_orders / total_delivered) * 100, 2) if total_delivered > 0 else 0.0

    # Step 2: Upsert into analytics DB
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await analytics_db.execute(
        text("""
            INSERT INTO return_rate_metrics
                (id, date, total_delivered_orders, returned_orders, return_rate,
                 return_revenue_loss, "createdAt", "updatedAt")
            VALUES
                (gen_random_uuid()::text, :date, :total_delivered_orders, :returned_orders,
                 :return_rate, :return_revenue_loss, :now, :now)
            ON CONFLICT (date) DO UPDATE SET
                total_delivered_orders = EXCLUDED.total_delivered_orders,
                returned_orders = EXCLUDED.returned_orders,
                return_rate = EXCLUDED.return_rate,
                return_revenue_loss = EXCLUDED.return_revenue_loss,
                "updatedAt" = EXCLUDED."updatedAt"
        """),
        {
            "date": target_date,
            "total_delivered_orders": total_delivered,
            "returned_orders": returned_orders,
            "return_rate": return_rate,
            "return_revenue_loss": return_revenue_loss,
            "now": now,
        }
    )
    await analytics_db.commit()

    logger.info(
        f"[RETURN_RATE] {target_date}: {total_delivered} delivered, {returned_orders} returned "
        f"({return_rate}%), ₹{return_revenue_loss:,.0f} lost"
    )
