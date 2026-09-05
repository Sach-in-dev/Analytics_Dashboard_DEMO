"""Correlations Action — pre-computes product pair co-occurrences and summary metrics."""

import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def process_correlations(prod_db: AsyncSession, analytics_db: AsyncSession):
    """Compute product pair co-occurrences and bundling summary from prod orders."""
    logger.info("[CORRELATIONS] Starting correlations processing")

    # Use full date range (all time) for comprehensive analysis
    # Get the earliest and latest order dates from prod
    date_range = await prod_db.execute(
        text("""
            SELECT MIN(created_at)::date, MAX(created_at)::date
            FROM "order"
            WHERE cart_id IS NOT NULL
        """)
    )
    dr = date_range.fetchone()
    if not dr or not dr[0]:
        logger.warning("[CORRELATIONS] No orders found in prod DB")
        return

    period_start = dr[0]
    period_end = dr[1]

    # Step 1: Compute summary metrics
    total_orders_res = await prod_db.execute(
        text("""
            SELECT COUNT(DISTINCT o.id)
            FROM "order" o
            JOIN line_item l ON o.cart_id = l.cart_id
            WHERE l.type = 'PRODUCT' AND l.product_id IS NOT NULL
        """)
    )
    total_active_orders = total_orders_res.scalar() or 0

    multi_orders_res = await prod_db.execute(
        text("""
            WITH order_counts AS (
                SELECT o.id, COUNT(DISTINCT l.product_id) as p_count
                FROM "order" o
                JOIN line_item l ON o.cart_id = l.cart_id
                WHERE l.type = 'PRODUCT' AND l.product_id IS NOT NULL
                GROUP BY o.id
            )
            SELECT COUNT(*) FROM order_counts WHERE p_count > 1
        """)
    )
    multi_item_orders = multi_orders_res.scalar() or 0
    bundling_pct = round((multi_item_orders / total_active_orders * 100), 1) if total_active_orders > 0 else 0

    logger.info(
        f"[CORRELATIONS] Summary: total={total_active_orders}, "
        f"multi={multi_item_orders}, bundling={bundling_pct}%"
    )

    # Step 2: Compute top 200 product pair co-occurrences
    pairs_res = await prod_db.execute(
        text("""
            WITH relevant_items AS (
                SELECT l.product_id, l.cart_id
                FROM line_item l
                WHERE l.product_id IS NOT NULL AND l.type = 'PRODUCT'
                  AND l.cart_id IN (SELECT cart_id FROM "order" WHERE cart_id IS NOT NULL)
                GROUP BY l.product_id, l.cart_id
            )
            SELECT
                p1.title AS product_a_title,
                p2.title AS product_b_title,
                COUNT(l1.cart_id) AS co_occurrences
            FROM relevant_items l1
            JOIN relevant_items l2 ON l1.cart_id = l2.cart_id AND l1.product_id < l2.product_id
            JOIN product p1 ON l1.product_id = p1.id
            JOIN product p2 ON l2.product_id = p2.id
            GROUP BY p1.title, p2.title
            ORDER BY co_occurrences DESC
            LIMIT 200
        """)
    )
    pairs = pairs_res.fetchall()

    logger.info(f"[CORRELATIONS] Computed {len(pairs)} product pairs")

    # Step 3: Store in analytics DB (full refresh)
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await analytics_db.execute(text("DELETE FROM correlation_summary"))
    await analytics_db.execute(
        text("""
            INSERT INTO correlation_summary
                (id, total_active_orders, multi_item_orders, bundling_percentage,
                 period_start, period_end, "createdAt")
            VALUES
                (gen_random_uuid()::text, :total, :multi, :bundling,
                 :ps, :pe, :now)
        """),
        {
            "total": total_active_orders,
            "multi": multi_item_orders,
            "bundling": bundling_pct,
            "ps": period_start,
            "pe": period_end,
            "now": now,
        }
    )

    await analytics_db.execute(text("DELETE FROM product_pair_correlations"))
    for row in pairs:
        await analytics_db.execute(
            text("""
                INSERT INTO product_pair_correlations
                    (id, product_a_title, product_b_title, co_occurrences,
                     period_start, period_end, "createdAt")
                VALUES
                    (gen_random_uuid()::text, :a, :b, :co, :ps, :pe, :now)
            """),
            {
                "a": row[0] or "Unknown Product",
                "b": row[1] or "Unknown Product",
                "co": row[2],
                "ps": period_start,
                "pe": period_end,
                "now": now,
            }
        )

    await analytics_db.commit()
    logger.info("[CORRELATIONS] Successfully stored correlation data")
