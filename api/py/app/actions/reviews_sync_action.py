"""Reviews Sync Action — mirrors product_reviews from prod DB to analytics DB."""

import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def sync_reviews(prod_db: AsyncSession, analytics_db: AsyncSession):
    """Full review mirror: fetch all non-spam reviews from prod → upsert into local."""
    logger.info("[REVIEWS_SYNC] Starting reviews sync")

    # Step 1: Fetch reviews with product titles from prod
    result = await prod_db.execute(
        text("""
            SELECT
                r.id,
                r.product_id,
                p.title AS product_title,
                r.rating,
                r.title,
                r.comment,
                r.first_name,
                r.last_name,
                r.spam,
                r.created_at
            FROM product_reviews r
            LEFT JOIN product p ON r.product_id = p.id
            ORDER BY r.created_at DESC
        """)
    )
    rows = result.fetchall()

    if not rows:
        logger.warning("[REVIEWS_SYNC] No reviews found in prod DB")
        return

    logger.info(f"[REVIEWS_SYNC] Fetched {len(rows)} reviews from prod")

    # Step 2: Clear existing and bulk insert (full refresh for consistency)
    await analytics_db.execute(text("DELETE FROM product_reviews_local"))

    synced_at = datetime.now(timezone.utc).replace(tzinfo=None)

    batch_size = 500
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        values = []
        params = {}
        for j, row in enumerate(batch):
            key = f"_{i + j}"
            values.append(
                f"(:id{key}, :product_id{key}, :product_title{key}, :rating{key}, "
                f":title{key}, :comment{key}, :first_name{key}, :last_name{key}, "
                f":spam{key}, :created_at{key}, :synced_at{key})"
            )
            params.update({
                f"id{key}": str(row[0]),
                f"product_id{key}": str(row[1]) if row[1] else None,
                f"product_title{key}": row[2],
                f"rating{key}": row[3],
                f"title{key}": row[4],
                f"comment{key}": row[5],
                f"first_name{key}": row[6],
                f"last_name{key}": row[7],
                f"spam{key}": row[8] if row[8] is not None else False,
                f"created_at{key}": row[9],
                f"synced_at{key}": synced_at,
            })

        insert_sql = f"""
            INSERT INTO product_reviews_local
                (id, product_id, product_title, rating, title, comment,
                 first_name, last_name, spam, created_at, synced_at)
            VALUES {', '.join(values)}
        """
        await analytics_db.execute(text(insert_sql), params)

    await analytics_db.commit()
    logger.info(f"[REVIEWS_SYNC] Successfully synced {len(rows)} reviews")
