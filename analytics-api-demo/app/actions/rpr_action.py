"""Repeat Purchase Rate Action — fetches customer order counts from prod DB,
computes total customers, repeat customers, and RPR percentage, then inserts a snapshot.
"""

import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def process_rpr(prod_db: AsyncSession, analytics_db: AsyncSession):
    """Full RPR pipeline: fetch prod orders → compute metrics → insert snapshot."""
    logger.info("[RPR] Starting Repeat Purchase Rate processing")

    # Step 1: Fetch per-customer order counts from prod DB
    result = await prod_db.execute(
        text("""
            SELECT
                email,
                COUNT(*)::bigint AS total_orders
            FROM "order"
            WHERE (paid_at IS NOT NULL OR status IN ('DELIVERED', 'COMPLETED'))
              AND email IS NOT NULL
              AND email != ''
            GROUP BY email
        """)
    )
    rows = result.fetchall()

    if not rows:
        logger.warning("[RPR] No customer order data found in prod DB")
        return

    # Step 2: Compute metrics
    total_customers = len(rows)
    repeat_customers = sum(1 for row in rows if row[1] > 1)
    rpr_percentage = round((repeat_customers / total_customers) * 100, 2) if total_customers > 0 else 0.0

    logger.info(
        f"[RPR] Total: {total_customers}, Repeat: {repeat_customers}, "
        f"RPR: {rpr_percentage}%"
    )

    # Step 3: Insert snapshot into analytics DB
    created_at = datetime.now(timezone.utc).replace(tzinfo=None)

    await analytics_db.execute(
        text("""
            INSERT INTO repeat_purchase_rate
                (id, total_customers, repeat_customers, rpr_percentage, "createdAt")
            VALUES
                (gen_random_uuid()::text, :total_customers, :repeat_customers,
                 :rpr_percentage, :created_at)
        """),
        {
            "total_customers": total_customers,
            "repeat_customers": repeat_customers,
            "rpr_percentage": rpr_percentage,
            "created_at": created_at,
        }
    )
    await analytics_db.commit()

    logger.info(f"[RPR] Successfully inserted RPR snapshot")
