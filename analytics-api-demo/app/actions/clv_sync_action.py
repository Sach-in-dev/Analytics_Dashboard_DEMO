"""CLV Sync Action — fetches customer order history from prod DB,
computes per-customer lifetime value, and upserts into customer_clv_snapshot.

Flow: Prod DB (read) → compute CLV metrics → Analytics DB (upsert)
"""

import logging
from datetime import datetime, timezone, date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def sync_clv(prod_db: AsyncSession, analytics_db: AsyncSession):
    """Full CLV sync: fetch all active customers from prod, compute CLV, upsert."""
    logger.info("[CLV] Starting CLV sync")
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Fetch per-customer lifetime metrics from prod DB (read-only)
    # Note: prod table is "customers" (with s), orders join via customer_id, email on order
    result = await prod_db.execute(text("""
        WITH customer_orders AS (
            SELECT
                o.customer_id,
                o.email,
                COUNT(o.id)                                      AS order_count,
                SUM(o.total)                                     AS total_spend_paise,
                MIN(COALESCE(o.paid_at, o.created_at)::date)     AS first_purchase_date,
                MAX(COALESCE(o.paid_at, o.created_at)::date)     AS last_purchase_date,
                ROUND(SUM(o.total)::NUMERIC / NULLIF(COUNT(o.id), 0), 2) AS avg_order_value_paise,
                COUNT(o.id) FILTER (
                    WHERE COALESCE(o.paid_at, o.created_at) >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
                      AND COALESCE(o.paid_at, o.created_at) < DATE_TRUNC('month', NOW())
                ) AS prev_month_orders,
                COUNT(o.id) FILTER (
                    WHERE COALESCE(o.paid_at, o.created_at) >= DATE_TRUNC('month', NOW())
                ) AS curr_month_orders
            FROM "order" o
            WHERE (o.paid_at IS NOT NULL OR o.status IN ('COMPLETED', 'DELIVERED'))
              AND o.status NOT IN ('CANCELLED', 'RETURNED', 'FAILED')
              AND o.customer_id IS NOT NULL
            GROUP BY o.customer_id, o.email
        ),
        customer_info AS (
            SELECT
                c.id,
                TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS full_name
            FROM customers c
        )
        SELECT
            co.customer_id,
            ci.full_name,
            co.email,
            co.order_count,
            ROUND(co.total_spend_paise / 100.0, 2)          AS total_spend,
            ROUND(co.avg_order_value_paise / 100.0, 2)      AS avg_order_value,
            co.first_purchase_date,
            co.last_purchase_date,
            co.prev_month_orders,
            co.curr_month_orders,
            CASE
                WHEN co.prev_month_orders = 0 THEN NULL
                ELSE ROUND(
                    ((co.curr_month_orders - co.prev_month_orders)::NUMERIC / co.prev_month_orders) * 100,
                    1
                )
            END AS mom_growth_pct
        FROM customer_orders co
        LEFT JOIN customer_info ci ON ci.id = co.customer_id
        ORDER BY co.total_spend_paise DESC
    """))

    rows = result.fetchall()
    logger.info(f"[CLV] Fetched {len(rows)} customers from prod DB")

    if not rows:
        logger.warning("[CLV] No customer data found")
        return

    # Upsert all rows into analytics DB
    for row in rows:
        await analytics_db.execute(text("""
            INSERT INTO customer_clv_snapshot
                (id, customer_id, customer_name, email, order_count, total_spend,
                 avg_order_value, first_purchase_date, last_purchase_date,
                 prev_month_orders, curr_month_orders, mom_growth_pct,
                 "createdAt", "updatedAt")
            VALUES (
                gen_random_uuid()::text, :customer_id, :customer_name, :email,
                :order_count, :total_spend, :avg_order_value,
                :first_purchase_date, :last_purchase_date,
                :prev_month_orders, :curr_month_orders, :mom_growth_pct,
                :now, :now
            )
            ON CONFLICT (customer_id) DO UPDATE SET
                customer_name       = EXCLUDED.customer_name,
                email               = EXCLUDED.email,
                order_count         = EXCLUDED.order_count,
                total_spend         = EXCLUDED.total_spend,
                avg_order_value     = EXCLUDED.avg_order_value,
                first_purchase_date = EXCLUDED.first_purchase_date,
                last_purchase_date  = EXCLUDED.last_purchase_date,
                prev_month_orders   = EXCLUDED.prev_month_orders,
                curr_month_orders   = EXCLUDED.curr_month_orders,
                mom_growth_pct      = EXCLUDED.mom_growth_pct,
                "updatedAt"         = EXCLUDED."updatedAt"
        """), {
            "customer_id": str(row[0]),
            "customer_name": row[1],
            "email": row[2],
            "order_count": int(row[3]),
            "total_spend": float(row[4]),
            "avg_order_value": float(row[5]),
            "first_purchase_date": row[6],
            "last_purchase_date": row[7],
            "prev_month_orders": int(row[8]),
            "curr_month_orders": int(row[9]),
            "mom_growth_pct": float(row[10]) if row[10] is not None else None,
            "now": now,
        })

    await analytics_db.commit()
    logger.info(f"[CLV] Upserted {len(rows)} customer CLV records")
