"""Repeat Purchase Cohorts Action — computes cohort-based retention from prod DB.

Pipeline:
  1. Find each customer's first purchase date → assign cohort (YYYY-MM)
  2. For all subsequent orders, compute cohort_index (months since first purchase)
  3. Aggregate: cohort_size per cohort, repeat_customers per (cohort, index)
  4. Compute retention_rate = (repeat_customers / cohort_size) * 100
  5. Upsert into customer_repeat_cohorts (analytics DB)

Uses pure SQL GROUP BY — no per-user Python loops.
"""

import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


def _safe_rate(numerator: int, denominator: int) -> float:
    """Compute percentage rate, returning 0 on division-by-zero."""
    if denominator == 0:
        return 0.0
    return round((numerator / denominator) * 100, 2)


async def process_repeat_cohorts(
    prod_db: AsyncSession,
    analytics_db: AsyncSession,
):
    """Full cohort pipeline: fetch prod orders → compute matrix → upsert."""
    logger.info("[REPEAT-COHORT] Starting repeat purchase cohort processing")

    # ── Single CTE query: cohort sizes + repeat activity matrix ──
    result = await prod_db.execute(
        text("""
            WITH first_purchase AS (
                SELECT
                    email,
                    MIN(created_at) AS first_order_date
                FROM "order"
                WHERE (paid_at IS NOT NULL OR status IN ('DELIVERED', 'COMPLETED'))
                  AND email IS NOT NULL
                  AND email != ''
                GROUP BY email
            ),
            cohort_sizes AS (
                SELECT
                    TO_CHAR(first_order_date, 'YYYY-MM') AS cohort_month,
                    COUNT(*)::bigint AS cohort_size
                FROM first_purchase
                GROUP BY 1
            ),
            repeat_activity AS (
                SELECT
                    TO_CHAR(fp.first_order_date, 'YYYY-MM') AS cohort_month,
                    (
                        (EXTRACT(YEAR FROM o.created_at)::int * 12
                         + EXTRACT(MONTH FROM o.created_at)::int)
                        - (EXTRACT(YEAR FROM fp.first_order_date)::int * 12
                           + EXTRACT(MONTH FROM fp.first_order_date)::int)
                    ) AS cohort_index,
                    COUNT(DISTINCT o.email)::bigint AS repeat_customers
                FROM "order" o
                JOIN first_purchase fp ON fp.email = o.email
                WHERE (o.paid_at IS NOT NULL OR o.status IN ('DELIVERED', 'COMPLETED'))
                GROUP BY 1, 2
            )
            SELECT
                cs.cohort_month,
                ra.cohort_index,
                cs.cohort_size,
                ra.repeat_customers
            FROM repeat_activity ra
            JOIN cohort_sizes cs ON cs.cohort_month = ra.cohort_month
            ORDER BY cs.cohort_month, ra.cohort_index
        """)
    )
    rows = result.fetchall()

    if not rows:
        logger.warning("[REPEAT-COHORT] No cohort data found in prod DB")
        return

    logger.info(f"[REPEAT-COHORT] Fetched {len(rows)} cohort-index combinations")

    # ── Upsert each row into analytics DB ──
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    upsert_count = 0

    for row in rows:
        cohort_month = row[0]
        cohort_index = int(row[1])
        cohort_size = int(row[2])
        repeat_customers = int(row[3])
        retention_rate = _safe_rate(repeat_customers, cohort_size)

        await analytics_db.execute(
            text("""
                INSERT INTO customer_repeat_cohorts
                    (id, cohort_month, cohort_index, cohort_size,
                     repeat_customers, retention_rate, "createdAt", "updatedAt")
                VALUES
                    (gen_random_uuid()::text, :cohort_month, :cohort_index,
                     :cohort_size, :repeat_customers, :retention_rate, :now, :now)
                ON CONFLICT (cohort_month, cohort_index) DO UPDATE SET
                    cohort_size = EXCLUDED.cohort_size,
                    repeat_customers = EXCLUDED.repeat_customers,
                    retention_rate = EXCLUDED.retention_rate,
                    "updatedAt" = EXCLUDED."updatedAt"
            """),
            {
                "cohort_month": cohort_month,
                "cohort_index": cohort_index,
                "cohort_size": cohort_size,
                "repeat_customers": repeat_customers,
                "retention_rate": retention_rate,
                "now": now,
            },
        )
        upsert_count += 1

    await analytics_db.commit()
    logger.info(
        f"[REPEAT-COHORT] Successfully upserted {upsert_count} cohort rows"
    )
