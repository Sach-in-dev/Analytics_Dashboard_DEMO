"""Customer Lifetime Cohorts Action — computes revenue-based cohort metrics.

Pipeline:
  1. Find each customer's first purchase date → assign cohort (YYYY-MM)
  2. For all orders, compute cohort_index (months since first purchase)
  3. Aggregate: revenue per (cohort, index), cohort_size per cohort
  4. Compute cumulative_revenue and avg_ltv per row
  5. Upsert into customer_lifetime_cohorts (analytics DB)

Uses pure SQL GROUP BY — no per-user Python loops.
"""

import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def process_lifetime_cohorts(
    prod_db: AsyncSession,
    analytics_db: AsyncSession,
):
    """Full lifetime cohort pipeline: fetch prod orders → compute revenue matrix → upsert."""
    logger.info("[LIFETIME-COHORT] Starting lifetime cohort processing")

    # ── Single CTE query: cohort sizes + revenue per (cohort, index) ──
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
            revenue_activity AS (
                SELECT
                    TO_CHAR(fp.first_order_date, 'YYYY-MM') AS cohort_month,
                    (
                        (EXTRACT(YEAR FROM o.created_at)::int * 12
                         + EXTRACT(MONTH FROM o.created_at)::int)
                        - (EXTRACT(YEAR FROM fp.first_order_date)::int * 12
                           + EXTRACT(MONTH FROM fp.first_order_date)::int)
                    ) AS cohort_index,
                    COALESCE(SUM(o.total), 0)::double precision AS total_revenue,
                    COUNT(DISTINCT o.email)::bigint AS unique_customers
                FROM "order" o
                JOIN first_purchase fp ON fp.email = o.email
                WHERE (o.paid_at IS NOT NULL OR o.status IN ('DELIVERED', 'COMPLETED'))
                GROUP BY 1, 2
            )
            SELECT
                cs.cohort_month,
                ra.cohort_index,
                cs.cohort_size,
                ra.total_revenue,
                ra.unique_customers
            FROM revenue_activity ra
            JOIN cohort_sizes cs ON cs.cohort_month = ra.cohort_month
            ORDER BY cs.cohort_month, ra.cohort_index
        """)
    )
    rows = result.fetchall()

    if not rows:
        logger.warning("[LIFETIME-COHORT] No cohort data found in prod DB")
        return

    logger.info(f"[LIFETIME-COHORT] Fetched {len(rows)} cohort-index combinations")

    # ── Build cumulative revenue per cohort ──
    # Group rows by cohort_month, then compute running cumulative
    cohort_data: dict[str, list] = {}
    for row in rows:
        cohort_month = row[0]
        if cohort_month not in cohort_data:
            cohort_data[cohort_month] = []
        cohort_data[cohort_month].append({
            "cohort_index": int(row[1]),
            "cohort_size": int(row[2]),
            "total_revenue": float(row[3]),
        })

    # Sort each cohort's data by index and compute cumulative
    upsert_rows = []
    for cohort_month, entries in cohort_data.items():
        entries.sort(key=lambda x: x["cohort_index"])
        cumulative = 0.0
        for entry in entries:
            cumulative += entry["total_revenue"]
            cohort_size = entry["cohort_size"]
            avg_ltv = round(cumulative / cohort_size, 2) if cohort_size > 0 else 0.0
            upsert_rows.append({
                "cohort_month": cohort_month,
                "cohort_index": entry["cohort_index"],
                "cohort_size": cohort_size,
                "total_revenue": round(entry["total_revenue"], 2),
                "cumulative_revenue": round(cumulative, 2),
                "avg_ltv": avg_ltv,
            })

    # ── Upsert into analytics DB ──
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    for row_data in upsert_rows:
        await analytics_db.execute(
            text("""
                INSERT INTO customer_lifetime_cohorts
                    (id, cohort_month, cohort_index, cohort_size,
                     total_revenue, cumulative_revenue, avg_ltv,
                     "createdAt", "updatedAt")
                VALUES
                    (gen_random_uuid()::text, :cohort_month, :cohort_index,
                     :cohort_size, :total_revenue, :cumulative_revenue,
                     :avg_ltv, :now, :now)
                ON CONFLICT (cohort_month, cohort_index) DO UPDATE SET
                    cohort_size = EXCLUDED.cohort_size,
                    total_revenue = EXCLUDED.total_revenue,
                    cumulative_revenue = EXCLUDED.cumulative_revenue,
                    avg_ltv = EXCLUDED.avg_ltv,
                    "updatedAt" = EXCLUDED."updatedAt"
            """),
            {**row_data, "now": now},
        )

    await analytics_db.commit()
    logger.info(
        f"[LIFETIME-COHORT] Successfully upserted {len(upsert_rows)} cohort rows"
    )
