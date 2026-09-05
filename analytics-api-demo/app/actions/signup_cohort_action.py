"""Signup Cohort Action — cohorts customers by registration month (created_at),
tracks subsequent order activity per cohort-month index, upserts into signup_cohort_metrics.

Flow: Prod DB (read) → compute cohort retention matrix → Analytics DB (upsert)
"""

import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def sync_signup_cohorts(prod_db: AsyncSession, analytics_db: AsyncSession):
    """Full signup cohort sync: build cohort × month retention matrix from prod orders."""
    logger.info("[SIGNUP_COHORTS] Starting signup cohort sync")
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    result = await prod_db.execute(text("""
        WITH cohorts AS (
            SELECT
                c.id AS customer_id,
                TO_CHAR(DATE_TRUNC('month', c.created_at), 'YYYY-MM') AS signup_cohort
            FROM customers c
            WHERE c.created_at >= NOW() - INTERVAL '24 months'
        ),
        cohort_sizes AS (
            SELECT signup_cohort, COUNT(*) AS cohort_size
            FROM cohorts
            GROUP BY signup_cohort
        ),
        orders_per_cohort AS (
            SELECT
                co.signup_cohort,
                (
                    EXTRACT(YEAR FROM AGE(
                        DATE_TRUNC('month', COALESCE(o.paid_at, o.created_at)),
                        TO_DATE(co.signup_cohort, 'YYYY-MM')
                    ))::int * 12 +
                    EXTRACT(MONTH FROM AGE(
                        DATE_TRUNC('month', COALESCE(o.paid_at, o.created_at)),
                        TO_DATE(co.signup_cohort, 'YYYY-MM')
                    ))::int
                ) AS cohort_index,
                COUNT(DISTINCT o.customer_id)   AS active_customers,
                COUNT(o.id)                     AS orders,
                ROUND(SUM(o.total) / 100.0, 2)  AS revenue
            FROM cohorts co
            JOIN "order" o ON o.customer_id = co.customer_id
            WHERE (o.paid_at IS NOT NULL OR o.status IN ('COMPLETED', 'DELIVERED'))
              AND o.status NOT IN ('CANCELLED', 'RETURNED', 'FAILED')
            GROUP BY co.signup_cohort, cohort_index
        )
        SELECT
            opc.signup_cohort,
            cs.cohort_size,
            opc.cohort_index,
            opc.active_customers,
            ROUND((opc.active_customers::NUMERIC / NULLIF(cs.cohort_size, 0)) * 100, 1) AS retention_pct,
            opc.orders,
            opc.revenue
        FROM orders_per_cohort opc
        JOIN cohort_sizes cs ON cs.signup_cohort = opc.signup_cohort
        WHERE opc.cohort_index >= 0 AND opc.cohort_index <= 12
        ORDER BY opc.signup_cohort ASC, opc.cohort_index ASC
    """))

    rows = result.fetchall()
    logger.info(f"[SIGNUP_COHORTS] Fetched {len(rows)} cohort-month rows from prod DB")

    if not rows:
        logger.warning("[SIGNUP_COHORTS] No cohort data found")
        return

    for row in rows:
        await analytics_db.execute(text("""
            INSERT INTO signup_cohort_metrics
                (id, signup_cohort, cohort_size, cohort_index,
                 active_customers, retention_pct, orders, revenue, "createdAt")
            VALUES (
                gen_random_uuid()::text,
                :signup_cohort, :cohort_size, :cohort_index,
                :active_customers, :retention_pct, :orders, :revenue, :now
            )
            ON CONFLICT (signup_cohort, cohort_index) DO UPDATE SET
                cohort_size      = EXCLUDED.cohort_size,
                active_customers = EXCLUDED.active_customers,
                retention_pct    = EXCLUDED.retention_pct,
                orders           = EXCLUDED.orders,
                revenue          = EXCLUDED.revenue
        """), {
            "signup_cohort": row[0],
            "cohort_size": int(row[1]),
            "cohort_index": int(row[2]),
            "active_customers": int(row[3]),
            "retention_pct": float(row[4]) if row[4] else 0.0,
            "orders": int(row[5]),
            "revenue": float(row[6]),
            "now": now,
        })

    await analytics_db.commit()
    logger.info(f"[SIGNUP_COHORTS] Upserted {len(rows)} signup cohort records")
