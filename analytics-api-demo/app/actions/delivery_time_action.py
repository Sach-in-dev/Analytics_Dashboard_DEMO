"""Delivery Time Action — fetches delivered orders from prod DB,
computes daily delivery time metrics (avg, median, p90, delayed count),
and upserts into the analytics DB.
"""

import logging
from datetime import datetime, timezone, date, timedelta
from app.utils.date import get_date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)

# Orders taking longer than this are considered "delayed"
DELAY_THRESHOLD_DAYS = 5


async def process_delivery_time_metrics(prod_db: AsyncSession, analytics_db: AsyncSession):
    """Full delivery time pipeline: fetch prod orders → compute metrics per day → upsert.

    Recomputes the last 30 days to capture late delivery updates.
    """
    logger.info("[DELIVERY_TIME] Starting delivery time metrics processing")

    today = date.today()

    for i in range(1, 32):
        target_date = today - timedelta(days=i)
        await _process_day(prod_db, analytics_db, target_date)

    logger.info("[DELIVERY_TIME] Completed delivery time metrics processing (last 30 days)")


async def _process_day(
    prod_db: AsyncSession,
    analytics_db: AsyncSession,
    target_date: date,
):
    """Compute delivery time metrics for orders created on target_date."""
    date_range = get_date(date=target_date.isoformat())
    start_time = date_range["start_of_day"]
    end_time = date_range["end_of_day"]

    # Fetch delivery time metrics using SQL percentile functions
    # Using created_at → delivered_at since shipped_at doesn't exist in this DB
    result = await prod_db.execute(
        text("""
            SELECT
                COUNT(*) AS total_orders,
                COALESCE(AVG(EXTRACT(EPOCH FROM (delivered_at - created_at)) / 86400), 0) AS avg_days,
                COALESCE(
                    PERCENTILE_CONT(0.5) WITHIN GROUP (
                        ORDER BY EXTRACT(EPOCH FROM (delivered_at - created_at)) / 86400
                    ), 0
                ) AS median_days,
                COALESCE(
                    PERCENTILE_CONT(0.9) WITHIN GROUP (
                        ORDER BY EXTRACT(EPOCH FROM (delivered_at - created_at)) / 86400
                    ), 0
                ) AS p90_days,
                COUNT(*) FILTER (
                    WHERE EXTRACT(EPOCH FROM (delivered_at - created_at)) / 86400 > :threshold
                ) AS delayed_orders
            FROM "order"
            WHERE delivered_at IS NOT NULL
              AND delivered_at > created_at
              AND COALESCE(paid_at, created_at) >= :start_time
              AND COALESCE(paid_at, created_at) <= :end_time
        """),
        {
            "start_time": start_time,
            "end_time": end_time,
            "threshold": DELAY_THRESHOLD_DAYS,
        },
    )
    row = result.one()

    total_orders = int(row[0])
    avg_delivery_time = round(float(row[1]), 2) if total_orders > 0 else 0.0
    median_delivery_time = round(float(row[2]), 2) if total_orders > 0 else 0.0
    p90_delivery_time = round(float(row[3]), 2) if total_orders > 0 else 0.0
    delayed_orders = int(row[4])

    # Second query: break down delayed orders by Carrier and State
    delays_by_carrier = {}
    delays_by_state = {}
    if delayed_orders > 0:
        breakdown_result = await prod_db.execute(
            text("""
                SELECT
                    o.carrier_name,
                    a.state,
                    COUNT(*) as delay_count
                FROM "order" o
                LEFT JOIN "order_address" a ON o.shipping_address_id = a.id
                WHERE o.delivered_at IS NOT NULL
                  AND o.delivered_at > o.created_at
                  AND COALESCE(o.paid_at, o.created_at) >= :start_time
                  AND COALESCE(o.paid_at, o.created_at) <= :end_time
                  AND EXTRACT(EPOCH FROM (o.delivered_at - o.created_at)) / 86400 > :threshold
                GROUP BY 1, 2
            """),
            {
                "start_time": start_time,
                "end_time": end_time,
                "threshold": DELAY_THRESHOLD_DAYS,
            },
        )
        for brow in breakdown_result:
            carrier = str(brow[0] or "Unknown").strip()
            state = str(brow[1] or "Unknown").strip()
            count = int(brow[2])
            delays_by_carrier[carrier] = delays_by_carrier.get(carrier, 0) + count
            delays_by_state[state] = delays_by_state.get(state, 0) + count

    # Upsert into analytics DB
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    import json
    await analytics_db.execute(
        text("""
            INSERT INTO delivery_time_metrics
                (id, date, total_orders, avg_delivery_time, median_delivery_time,
                 p90_delivery_time, delayed_orders, delays_by_carrier, delays_by_state, "createdAt", "updatedAt")
            VALUES
                (gen_random_uuid()::text, :date, :total_orders, :avg_delivery_time,
                 :median_delivery_time, :p90_delivery_time, :delayed_orders, 
                 CAST(:delays_by_carrier AS JSONB), CAST(:delays_by_state AS JSONB), :now, :now)
            ON CONFLICT (date) DO UPDATE SET
                total_orders = EXCLUDED.total_orders,
                avg_delivery_time = EXCLUDED.avg_delivery_time,
                median_delivery_time = EXCLUDED.median_delivery_time,
                p90_delivery_time = EXCLUDED.p90_delivery_time,
                delayed_orders = EXCLUDED.delayed_orders,
                delays_by_carrier = EXCLUDED.delays_by_carrier,
                delays_by_state = EXCLUDED.delays_by_state,
                "updatedAt" = EXCLUDED."updatedAt"
        """),
        {
            "date": target_date,
            "total_orders": total_orders,
            "avg_delivery_time": avg_delivery_time,
            "median_delivery_time": median_delivery_time,
            "p90_delivery_time": p90_delivery_time,
            "delayed_orders": delayed_orders,
            "delays_by_carrier": json.dumps(delays_by_carrier),
            "delays_by_state": json.dumps(delays_by_state),
            "now": now,
        }
    )
    await analytics_db.commit()

    logger.info(
        f"[DELIVERY_TIME] {target_date}: {total_orders} delivered, "
        f"avg={avg_delivery_time}d, median={median_delivery_time}d, "
        f"p90={p90_delivery_time}d, delayed={delayed_orders}"
    )
