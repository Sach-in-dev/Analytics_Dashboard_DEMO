"""Cart Abandoned Products Sync — syncs top abandoned products per day from prod."""

import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def sync_abandoned_products(prod_db: AsyncSession, analytics_db: AsyncSession):
    """Sync top abandoned cart products from prod to analytics DB."""
    logger.info("[ABANDONED_PRODUCTS] Starting abandoned products sync")

    # Fetch abandoned products grouped by date, top 50 per day
    result = await prod_db.execute(
        text("""
            WITH daily_abandoned AS (
                SELECT
                    CAST(c.created_at AS DATE) AS abandon_date,
                    l.title AS product_title,
                    COUNT(l.id) AS abandon_count,
                    ROW_NUMBER() OVER (
                        PARTITION BY CAST(c.created_at AS DATE)
                        ORDER BY COUNT(l.id) DESC
                    ) AS rn
                FROM line_item l
                JOIN cart c ON l.cart_id = c.id
                WHERE c.completed_at IS NULL
                  AND l.title IS NOT NULL
                GROUP BY CAST(c.created_at AS DATE), l.title
            )
            SELECT abandon_date, product_title, abandon_count
            FROM daily_abandoned
            WHERE rn <= 50
            ORDER BY abandon_date DESC, abandon_count DESC
        """)
    )
    rows = result.fetchall()

    if not rows:
        logger.warning("[ABANDONED_PRODUCTS] No abandoned cart data found in prod DB")
        return

    logger.info(f"[ABANDONED_PRODUCTS] Fetched {len(rows)} rows from prod")

    # Full refresh
    await analytics_db.execute(text("DELETE FROM cart_abandoned_products"))

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    batch_size = 500
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        values = []
        params = {}
        for j, row in enumerate(batch):
            key = f"_{i + j}"
            values.append(
                f"(gen_random_uuid()::text, :title{key}, :cnt{key}, :dt{key}, :now{key})"
            )
            params.update({
                f"title{key}": row[1],
                f"cnt{key}": row[2],
                f"dt{key}": row[0],
                f"now{key}": now,
            })

        insert_sql = f"""
            INSERT INTO cart_abandoned_products
                (id, product_title, count, date, "createdAt")
            VALUES {', '.join(values)}
        """
        await analytics_db.execute(text(insert_sql), params)

    await analytics_db.commit()
    logger.info(f"[ABANDONED_PRODUCTS] Successfully synced {len(rows)} entries")
