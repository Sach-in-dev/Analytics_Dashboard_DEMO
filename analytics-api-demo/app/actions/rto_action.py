"""RTO (Return to Origin) Action — fetches order data from prod DB,
computes daily RTO metrics (total orders, RTO orders, RTO rate, revenue loss),
and upserts into the analytics DB.
"""

import logging
from datetime import datetime, timezone, date, timedelta
from app.utils.date import get_date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def process_rto_metrics(prod_db: AsyncSession, analytics_db: AsyncSession):
    """Full RTO pipeline: fetch prod orders → compute metrics per day → upsert snapshots.

    Recomputes the last 30 days to capture late status changes (RETURNED etc.).
    """
    logger.info("[RTO] Starting RTO metrics processing")

    today = date.today()

    for i in range(1, 32):
        target_date = today - timedelta(days=i)
        await _process_day(prod_db, analytics_db, target_date)

    logger.info("[RTO] Completed RTO metrics processing (last 30 days)")


async def _process_day(
    prod_db: AsyncSession,
    analytics_db: AsyncSession,
    target_date: date,
):
    """Compute RTO metrics for a specific date and upsert into analytics DB."""
    date_range = get_date(date=target_date.isoformat())
    start_time = date_range["start_of_day"]
    end_time = date_range["end_of_day"]

    # Step 1: Get total valid orders for this date
    result = await prod_db.execute(
        text("""
            SELECT
                COUNT(*) AS total_orders,
                COUNT(*) FILTER (
                    WHERE status = 'RETURNED'
                       OR status = 'FAILED'
                       OR (delivered_at IS NOT NULL
                           AND status IN ('CANCELLED', 'REFUNDED'))
                ) AS rto_orders,
                COALESCE(SUM(total) FILTER (
                    WHERE status = 'RETURNED'
                       OR status = 'FAILED'
                       OR (delivered_at IS NOT NULL
                           AND status IN ('CANCELLED', 'REFUNDED'))
                ), 0) AS rto_revenue_loss
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

    total_orders = int(row[0])
    rto_orders = int(row[1])
    rto_revenue_loss = float(row[2])
    rto_rate = round((rto_orders / total_orders) * 100, 2) if total_orders > 0 else 0.0

    # Step 2: Upsert into analytics DB
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await analytics_db.execute(
        text("""
            INSERT INTO rto_metrics
                (id, date, total_orders, rto_orders, rto_rate, rto_revenue_loss,
                 "createdAt", "updatedAt")
            VALUES
                (gen_random_uuid()::text, :date, :total_orders, :rto_orders,
                 :rto_rate, :rto_revenue_loss, :now, :now)
            ON CONFLICT (date) DO UPDATE SET
                total_orders = EXCLUDED.total_orders,
                rto_orders = EXCLUDED.rto_orders,
                rto_rate = EXCLUDED.rto_rate,
                rto_revenue_loss = EXCLUDED.rto_revenue_loss,
                "updatedAt" = EXCLUDED."updatedAt"
        """),
        {
            "date": target_date,
            "total_orders": total_orders,
            "rto_orders": rto_orders,
            "rto_rate": rto_rate,
            "rto_revenue_loss": rto_revenue_loss,
            "now": now,
        }
    )
    await analytics_db.commit()

    logger.info(
        f"[RTO] {target_date}: {total_orders} total, {rto_orders} RTO "
        f"({rto_rate}%), ₹{rto_revenue_loss:,.0f} lost"
    )
