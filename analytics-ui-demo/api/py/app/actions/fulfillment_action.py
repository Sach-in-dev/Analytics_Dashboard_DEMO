import logging
from datetime import datetime, timezone, date
from app.utils.date import get_date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)

SLA_THRESHOLD_DAYS = 3


async def process_daily_fulfillment_metrics(
    prod_db: AsyncSession,
    analytics_db: AsyncSession,
    target_date: date,
):
    """Compute fulfillment raw sums for a specific target_date (by order created_at) and upsert."""
    
    logger.info(f"[FULFILLMENT] Computing raw metrics for {target_date}")
    
    # We query orders CREATED exactly on `target_date`.
    # Deliveries and RTOs might happen days or weeks later, 
    # but they are correctly aggregated to the date they were placed.
    date_range = get_date(date=target_date.isoformat())
    start_time = date_range["start_of_day"]
    end_time = date_range["end_of_day"]
    
    # 1. Delivery & SLA
    delivery_result = await prod_db.execute(
        text("""
            SELECT
                COUNT(*) AS total_delivered,
                COALESCE(SUM(EXTRACT(EPOCH FROM (delivered_at - created_at)) / 86400.0), 0) AS total_delivery_days,
                COUNT(*) FILTER (
                    WHERE EXTRACT(EPOCH FROM (delivered_at - created_at)) / 86400.0 <= :sla_days
                ) AS within_sla
            FROM "order"
            WHERE delivered_at IS NOT NULL
              AND status NOT IN ('CANCELLED', 'REFUNDED')
              AND COALESCE(paid_at, created_at) >= :start_time
              AND COALESCE(paid_at, created_at) <= :end_time
        """),
        {
            "sla_days": SLA_THRESHOLD_DAYS,
            "start_time": start_time,
            "end_time": end_time,
        },
    )
    del_row = delivery_result.one()
    total_delivered = int(del_row[0])
    total_delivery_days_sum = float(del_row[1])
    within_sla = int(del_row[2])
    
    # 2. RTO Count
    rto_result = await prod_db.execute(
        text("""
            SELECT
                COUNT(*) FILTER (
                    WHERE delivered_at IS NOT NULL
                      AND status IN ('CANCELLED', 'RETURNED', 'REFUNDED')
                ) AS rto_count
            FROM "order"
            WHERE COALESCE(paid_at, created_at) >= :start_time
              AND COALESCE(paid_at, created_at) <= :end_time
        """),
        {
            "start_time": start_time,
            "end_time": end_time,
        },
    )
    rto_count = int(rto_result.scalar() or 0)
    
    # 3. Upsert into Analytics Database
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    
    await analytics_db.execute(
        text("""
            INSERT INTO daily_fulfillment_metrics
                (id, date, total_delivered_orders, total_delivery_days_sum, 
                 orders_within_sla_count, rto_orders_count, "createdAt")
            VALUES
                (gen_random_uuid()::text, :date, :total_delivered_orders, :total_delivery_days_sum,
                 :orders_within_sla_count, :rto_orders_count, :now)
            ON CONFLICT (date) DO UPDATE SET
                total_delivered_orders = EXCLUDED.total_delivered_orders,
                total_delivery_days_sum = EXCLUDED.total_delivery_days_sum,
                orders_within_sla_count = EXCLUDED.orders_within_sla_count,
                rto_orders_count = EXCLUDED.rto_orders_count,
                "createdAt" = EXCLUDED."createdAt"
        """),
        {
            "date": target_date,
            "total_delivered_orders": total_delivered,
            "total_delivery_days_sum": total_delivery_days_sum,
            "orders_within_sla_count": within_sla,
            "rto_orders_count": rto_count,
            "now": now,
        }
    )
    await analytics_db.commit()
    logger.info(f"[FULFILLMENT] Successfully tracking {total_delivered} delivered & {rto_count} RTOs for {target_date}")
