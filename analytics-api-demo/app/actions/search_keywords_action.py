"""Search Keywords Sync Action — syncs top keywords per day from prod to analytics DB."""

import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def sync_search_keywords(prod_db: AsyncSession, analytics_db: AsyncSession):
    """Sync top search keywords from prod customer_searches to analytics DB."""
    logger.info("[SEARCH_KEYWORDS] Starting search keywords sync")

    # Fetch keywords grouped by date, top 50 per day, across all history.
    # Keywords are normalised case-insensitively (LOWER(TRIM(...))) so
    # "Cosrx" and "cosrx" merge into one row; display label is the
    # most-frequent original-case variant.
    result = await prod_db.execute(
        text("""
            WITH per_day_variants AS (
                SELECT
                    CAST(created_at AS DATE) AS search_date,
                    LOWER(TRIM(keyword)) AS norm_keyword,
                    keyword AS original_keyword,
                    COUNT(*) AS variant_count
                FROM customer_searches
                WHERE keyword IS NOT NULL AND TRIM(keyword) != ''
                GROUP BY CAST(created_at AS DATE), LOWER(TRIM(keyword)), keyword
            ),
            per_day_merged AS (
                SELECT
                    search_date,
                    (ARRAY_AGG(original_keyword ORDER BY variant_count DESC))[1] AS keyword,
                    SUM(variant_count) AS kw_count,
                    ROW_NUMBER() OVER (
                        PARTITION BY search_date
                        ORDER BY SUM(variant_count) DESC
                    ) AS rn
                FROM per_day_variants
                GROUP BY search_date, norm_keyword
            )
            SELECT search_date, keyword, kw_count
            FROM per_day_merged
            WHERE rn <= 50
            ORDER BY search_date DESC, kw_count DESC
        """)
    )
    rows = result.fetchall()

    if not rows:
        logger.warning("[SEARCH_KEYWORDS] No search keyword data found in prod DB")
        return

    logger.info(f"[SEARCH_KEYWORDS] Fetched {len(rows)} keyword rows from prod")

    # Full refresh
    await analytics_db.execute(text("DELETE FROM search_top_keywords"))

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    batch_size = 500
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        values = []
        params = {}
        for j, row in enumerate(batch):
            key = f"_{i + j}"
            values.append(
                f"(gen_random_uuid()::text, :kw{key}, :cnt{key}, :dt{key}, :now{key})"
            )
            params.update({
                f"kw{key}": row[1],
                f"cnt{key}": row[2],
                f"dt{key}": row[0],
                f"now{key}": now,
            })

        insert_sql = f"""
            INSERT INTO search_top_keywords
                (id, keyword, count, date, "createdAt")
            VALUES {', '.join(values)}
        """
        await analytics_db.execute(text(insert_sql), params)

    await analytics_db.commit()
    logger.info(f"[SEARCH_KEYWORDS] Successfully synced {len(rows)} keyword entries")
