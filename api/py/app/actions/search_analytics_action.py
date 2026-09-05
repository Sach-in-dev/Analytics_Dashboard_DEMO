"""Search Analytics Action — computes comprehensive search metrics snapshot
from prod customer_searches table and upserts into analytics DB.

Sections computed:
1. Top Searched Keywords (with trending % change)
2. Zero-Result Searches
3. Low-Result Searches (<3 results)
4. High Exit Searches
5. Brand Search Volume
6. Category Demand
7. Attributes Frequency
8. New vs Returning Customers (search behavior)
"""

import json
import logging
from datetime import datetime, timezone, date, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def process_search_analytics(prod_db: AsyncSession, analytics_db: AsyncSession):
    """Full search analytics pipeline: fetch prod data → compute all sections → upsert snapshot."""
    logger.info("[SEARCH_ANALYTICS] Starting search analytics processing")

    today = date.today()
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Compute each section
    top_keywords = await _compute_top_keywords(prod_db)
    zero_result = await _compute_zero_result_searches(prod_db)
    # Exclude zero-result keywords that also appear in top keywords
    top_kw_norms = {kw["keyword"].lower().strip() for kw in top_keywords}
    zero_result = [z for z in zero_result if z["keyword"].lower().strip() not in top_kw_norms]
    low_result = await _compute_low_result_searches(prod_db)
    high_exit = await _compute_high_exit_searches(prod_db)
    brand_volume = await _compute_brand_search_volume(prod_db)
    category_demand = await _compute_category_demand(prod_db)
    attributes_freq = await _compute_attributes_frequency(prod_db)
    new_vs_returning = await _compute_new_vs_returning(prod_db)
    high_intent_demand = await _compute_high_intent_demand(prod_db)
    not_purchased = await _compute_not_purchased_products(prod_db)

    # Upsert into analytics DB
    await analytics_db.execute(
        text("""
            INSERT INTO search_analytics_snapshot
                (id, snapshot_date, top_keywords_data, zero_result_data, low_result_data,
                 high_exit_data, brand_volume_data, category_demand_data,
                 attributes_frequency_data, new_vs_returning_data,
                 high_intent_demand_data, not_purchased_data, "createdAt")
            VALUES
                (gen_random_uuid()::text, :snapshot_date, CAST(:top_keywords AS JSONB),
                 CAST(:zero_result AS JSONB), CAST(:low_result AS JSONB),
                 CAST(:high_exit AS JSONB), CAST(:brand_volume AS JSONB),
                 CAST(:category_demand AS JSONB), CAST(:attributes_freq AS JSONB),
                 CAST(:new_vs_returning AS JSONB),
                 CAST(:high_intent_demand AS JSONB), CAST(:not_purchased AS JSONB), :now)
            ON CONFLICT (snapshot_date) DO UPDATE SET
                top_keywords_data = EXCLUDED.top_keywords_data,
                zero_result_data = EXCLUDED.zero_result_data,
                low_result_data = EXCLUDED.low_result_data,
                high_exit_data = EXCLUDED.high_exit_data,
                brand_volume_data = EXCLUDED.brand_volume_data,
                category_demand_data = EXCLUDED.category_demand_data,
                attributes_frequency_data = EXCLUDED.attributes_frequency_data,
                new_vs_returning_data = EXCLUDED.new_vs_returning_data,
                high_intent_demand_data = EXCLUDED.high_intent_demand_data,
                not_purchased_data = EXCLUDED.not_purchased_data,
                "createdAt" = EXCLUDED."createdAt"
        """),
        {
            "snapshot_date": today,
            "top_keywords": json.dumps(top_keywords),
            "zero_result": json.dumps(zero_result),
            "low_result": json.dumps(low_result),
            "high_exit": json.dumps(high_exit),
            "brand_volume": json.dumps(brand_volume),
            "category_demand": json.dumps(category_demand),
            "attributes_freq": json.dumps(attributes_freq),
            "new_vs_returning": json.dumps(new_vs_returning),
            "high_intent_demand": json.dumps(high_intent_demand),
            "not_purchased": json.dumps(not_purchased),
            "now": now,
        }
    )
    await analytics_db.commit()

    logger.info(
        f"[SEARCH_ANALYTICS] Snapshot saved for {today}: "
        f"top_kw={len(top_keywords)}, zero={len(zero_result)}, low={len(low_result)}, "
        f"exit={len(high_exit)}, brands={len(brand_volume)}, categories={len(category_demand)}, "
        f"attrs={len(attributes_freq)}, new_vs_ret={len(new_vs_returning)}, "
        f"high_intent={len(high_intent_demand)}, not_purchased={len(not_purchased)}"
    )


async def _compute_top_keywords(prod_db: AsyncSession) -> list[dict]:
    """Top searched keywords with trending % change (this week vs last week).

    Keywords are merged case-insensitively (LOWER(TRIM(...))). The display
    label for each group is the most-frequent original-case variant.
    """
    result = await prod_db.execute(
        text("""
            WITH tw_variants AS (
                SELECT LOWER(TRIM(keyword)) AS norm,
                       keyword AS original,
                       COUNT(*) AS variant_volume,
                       SUM(COALESCE(total_result, 0)) AS sum_total_results
                FROM customer_searches
                WHERE keyword IS NOT NULL AND TRIM(keyword) != ''
                  AND created_at >= (CURRENT_DATE - INTERVAL '7 days')
                GROUP BY LOWER(TRIM(keyword)), keyword
            ),
            this_week AS (
                SELECT norm,
                       (ARRAY_AGG(original ORDER BY variant_volume DESC))[1] AS keyword,
                       SUM(variant_volume) AS search_volume,
                       SUM(sum_total_results) AS sum_total_results,
                       1 AS count_search_keywords
                FROM tw_variants
                GROUP BY norm
            ),
            last_week AS (
                SELECT LOWER(TRIM(keyword)) AS norm,
                       COUNT(*) AS search_volume
                FROM customer_searches
                WHERE keyword IS NOT NULL AND TRIM(keyword) != ''
                  AND created_at >= (CURRENT_DATE - INTERVAL '14 days')
                  AND created_at < (CURRENT_DATE - INTERVAL '7 days')
                GROUP BY LOWER(TRIM(keyword))
            )
            SELECT
                tw.keyword,
                tw.search_volume AS top_search_volume_last_week,
                ROW_NUMBER() OVER (ORDER BY tw.search_volume DESC) AS rank_by_count,
                COALESCE(lw.search_volume, 0) AS top_search_volume_last_week_2,
                CASE
                    WHEN COALESCE(lw.search_volume, 0) = 0 THEN 0
                    ELSE ROUND(((tw.search_volume - lw.search_volume)::NUMERIC / lw.search_volume) * 100, 2)
                END AS trending_pct_change,
                tw.sum_total_results,
                tw.count_search_keywords
            FROM this_week tw
            LEFT JOIN last_week lw ON tw.norm = lw.norm
            WHERE tw.sum_total_results > 0
            ORDER BY tw.search_volume DESC
            LIMIT 50
        """)
    )
    rows = result.fetchall()
    return [
        {
            "keyword": row[0],
            "top_search_volume_last_week": int(row[1]),
            "rank_by_count": int(row[2]),
            "top_search_volume_last_week_2": int(row[3]),
            "trending_pct_change": float(row[4]),
            "sum_total_results": int(row[5]),
            "count_search_keywords": int(row[6]),
        }
        for row in rows
    ]


async def _compute_zero_result_searches(prod_db: AsyncSession) -> list[dict]:
    """Keywords that NEVER return results (all searches for that keyword had total_result=0).
    Case-insensitive merge — display label is the most-frequent variant.
    """
    result = await prod_db.execute(
        text("""
            WITH per_keyword AS (
                SELECT LOWER(TRIM(keyword)) AS norm,
                       keyword AS original,
                       COUNT(*) AS variant_count,
                       SUM(COALESCE(total_result, 0)) AS sum_total_results,
                       MAX(COALESCE(total_result, 0)) AS max_total_result,
                       COUNT(*) FILTER (WHERE created_at >= (CURRENT_DATE - INTERVAL '7 days')) AS recent_volume
                FROM customer_searches
                WHERE keyword IS NOT NULL AND TRIM(keyword) != ''
                GROUP BY LOWER(TRIM(keyword)), keyword
            ),
            merged AS (
                SELECT norm,
                       (ARRAY_AGG(original ORDER BY variant_count DESC))[1] AS keyword,
                       SUM(sum_total_results) AS sum_total_results,
                       MAX(max_total_result) AS max_total_result,
                       SUM(recent_volume) AS top_search_volume_last_week
                FROM per_keyword
                GROUP BY norm
            )
            SELECT keyword, sum_total_results::int, top_search_volume_last_week::int, 1
            FROM merged
            WHERE max_total_result = 0
            ORDER BY top_search_volume_last_week DESC
            LIMIT 50
        """)
    )
    rows = result.fetchall()
    return [
        {
            "keyword": row[0],
            "sum_total_results": int(row[1]),
            "top_search_volume_last_week": int(row[2]),
            "count_search_keywords": int(row[3]),
        }
        for row in rows
    ]


async def _compute_low_result_searches(prod_db: AsyncSession) -> list[dict]:
    """Keywords where total_result > 0 AND total_result < 3.
    Case-insensitive merge.
    """
    result = await prod_db.execute(
        text("""
            WITH variants AS (
                SELECT LOWER(TRIM(keyword)) AS norm,
                       keyword AS original,
                       COUNT(*) AS variant_count,
                       SUM(COALESCE(total_result, 0)) AS sum_total_results,
                       COUNT(*) FILTER (WHERE created_at >= (CURRENT_DATE - INTERVAL '7 days')) AS recent_volume
                FROM customer_searches
                WHERE keyword IS NOT NULL AND TRIM(keyword) != ''
                  AND total_result > 0 AND total_result < 3
                GROUP BY LOWER(TRIM(keyword)), keyword
            )
            SELECT
                (ARRAY_AGG(original ORDER BY variant_count DESC))[1] AS keyword,
                SUM(sum_total_results) AS sum_total_results,
                SUM(recent_volume) AS top_search_volume_last_week,
                1 AS count_search_keywords
            FROM variants
            GROUP BY norm
            ORDER BY top_search_volume_last_week DESC
            LIMIT 50
        """)
    )
    rows = result.fetchall()
    return [
        {
            "keyword": row[0],
            "sum_total_results": int(row[1]),
            "top_search_volume_last_week": int(row[2]),
            "count_search_keywords": int(row[3]),
        }
        for row in rows
    ]


async def _compute_high_exit_searches(prod_db: AsyncSession) -> list[dict]:
    """Keywords with high search volume but low result engagement (proxy for exit searches).
    Case-insensitive merge.
    """
    result = await prod_db.execute(
        text("""
            WITH variants AS (
                SELECT LOWER(TRIM(keyword)) AS norm,
                       keyword AS original,
                       COUNT(*) AS variant_count,
                       SUM(COALESCE(total_result, 0)) AS sum_total_results
                FROM customer_searches
                WHERE keyword IS NOT NULL AND TRIM(keyword) != ''
                GROUP BY LOWER(TRIM(keyword)), keyword
            ),
            merged AS (
                SELECT
                    (ARRAY_AGG(original ORDER BY variant_count DESC))[1] AS keyword,
                    SUM(variant_count) AS exit_search_count,
                    SUM(sum_total_results) AS sum_total_results
                FROM variants
                GROUP BY norm
            )
            SELECT
                keyword,
                ROW_NUMBER() OVER (ORDER BY exit_search_count DESC) AS rank_exit_keywords,
                exit_search_count,
                sum_total_results
            FROM merged
            ORDER BY exit_search_count DESC
            LIMIT 50
        """)
    )
    rows = result.fetchall()
    return [
        {
            "keyword": row[0],
            "rank_exit_keywords": int(row[1]),
            "exit_search_count": int(row[2]),
            "sum_total_results": int(row[3]),
        }
        for row in rows
    ]


async def _compute_brand_search_volume(prod_db: AsyncSession) -> list[dict]:
    """Search volume grouped by brand."""
    result = await prod_db.execute(
        text("""
            SELECT
                brands,
                SUM(COALESCE(total_result, 0)) AS sum_total_results,
                COUNT(*) FILTER (WHERE created_at >= (CURRENT_DATE - INTERVAL '7 days')) AS top_search_volume_last_week,
                COUNT(DISTINCT keyword) AS count_search_keywords
            FROM customer_searches
            WHERE brands IS NOT NULL AND TRIM(brands) != ''
            GROUP BY brands
            ORDER BY top_search_volume_last_week DESC
            LIMIT 50
        """)
    )
    rows = result.fetchall()
    return [
        {
            "brand": row[0],
            "sum_total_results": int(row[1]),
            "top_search_volume_last_week": int(row[2]),
            "count_search_keywords": int(row[3]),
        }
        for row in rows
    ]


async def _compute_category_demand(prod_db: AsyncSession) -> list[dict]:
    """Search volume grouped by category."""
    result = await prod_db.execute(
        text("""
            SELECT
                categories,
                SUM(COALESCE(total_result, 0)) AS sum_total_results,
                COUNT(*) FILTER (WHERE created_at >= (CURRENT_DATE - INTERVAL '7 days')) AS top_search_volume_last_week,
                COUNT(DISTINCT keyword) AS count_search_keywords
            FROM customer_searches
            WHERE categories IS NOT NULL AND TRIM(categories) != ''
            GROUP BY categories
            ORDER BY top_search_volume_last_week DESC
            LIMIT 50
        """)
    )
    rows = result.fetchall()
    return [
        {
            "category": row[0],
            "sum_total_results": int(row[1]),
            "top_search_volume_last_week": int(row[2]),
            "count_search_keywords": int(row[3]),
        }
        for row in rows
    ]


async def _compute_attributes_frequency(prod_db: AsyncSession) -> list[dict]:
    """Search volume grouped by attributes (JSONB field)."""
    result = await prod_db.execute(
        text("""
            SELECT
                attributes::TEXT AS attr_text,
                COUNT(*) FILTER (WHERE created_at >= (CURRENT_DATE - INTERVAL '7 days')) AS top_search_volume_last_week,
                SUM(COALESCE(total_result, 0)) AS sum_total_results,
                COUNT(DISTINCT keyword) AS count_search_keywords
            FROM customer_searches
            WHERE attributes IS NOT NULL AND attributes::TEXT != 'null' AND attributes::TEXT != '{}'
            GROUP BY attributes::TEXT
            ORDER BY top_search_volume_last_week DESC
            LIMIT 50
        """)
    )
    rows = result.fetchall()
    return [
        {
            "attributes": row[0],
            "top_search_volume_last_week": int(row[1]),
            "sum_total_results": int(row[2]),
            "count_search_keywords": int(row[3]),
        }
        for row in rows
    ]


async def _compute_new_vs_returning(prod_db: AsyncSession) -> list[dict]:
    """Split search behavior by new vs returning searchers.

    Since customer_id is NULL for all rows in customer_searches,
    we use ip_address as the searcher identifier and cross-reference
    with the order table to classify:
      New = IP with 0-1 orders placed
      Returning = IP with 2+ orders placed
    Brand search = search where brands IS NOT NULL.
    Concern search = search where attributes IS NOT NULL (skin concern, type, etc).
    """
    result = await prod_db.execute(
        text("""
            WITH ip_order_counts AS (
                SELECT
                    a.ip_address,
                    COUNT(DISTINCT o.id) AS order_count
                FROM "order" o
                JOIN "customer_activities" a
                    ON o.customer_id = a.customer_id
                    AND a.ip_address IS NOT NULL
                WHERE o.status NOT IN ('CANCELLED', 'RETURNED')
                GROUP BY a.ip_address
            ),
            search_with_type AS (
                SELECT
                    cs.id,
                    cs.brands,
                    cs.attributes,
                    CASE
                        WHEN COALESCE(ioc.order_count, 0) <= 1 THEN 'New'
                        ELSE 'Returning'
                    END AS user_type
                FROM customer_searches cs
                LEFT JOIN ip_order_counts ioc ON cs.ip_address = ioc.ip_address
                WHERE cs.ip_address IS NOT NULL
                  AND cs.created_at >= (CURRENT_DATE - INTERVAL '30 days')
            )
            SELECT
                user_type,
                COUNT(*) FILTER (WHERE brands IS NOT NULL AND TRIM(brands) != '') AS brand_searches,
                ROUND(
                    (COUNT(*) FILTER (WHERE brands IS NOT NULL AND TRIM(brands) != '')::NUMERIC / NULLIF(COUNT(*), 0)) * 100,
                    1
                ) AS brand_search_pct,
                COUNT(*) FILTER (WHERE attributes IS NOT NULL AND attributes::TEXT != 'null' AND attributes::TEXT != '{}') AS concern_searches,
                ROUND(
                    (COUNT(*) FILTER (WHERE attributes IS NOT NULL AND attributes::TEXT != 'null' AND attributes::TEXT != '{}')::NUMERIC / NULLIF(COUNT(*), 0)) * 100,
                    1
                ) AS concern_search_pct
            FROM search_with_type
            GROUP BY user_type
            ORDER BY user_type
        """)
    )
    rows = result.fetchall()
    return [
        {
            "user_type": row[0],
            "brand_searches": int(row[1]),
            "brand_search_pct": float(row[2]) if row[2] else 0.0,
            "concern_searches": int(row[3]),
            "concern_search_pct": float(row[4]) if row[4] else 0.0,
        }
        for row in rows
    ]



async def _compute_high_intent_demand(prod_db: AsyncSession) -> list[dict]:
    """High-intent demand patterns: keywords with high search volume + good results (>=3)
    indicating strong purchase intent."""
    result = await prod_db.execute(
        text("""
            WITH variants AS (
                SELECT
                    LOWER(TRIM(keyword)) AS norm,
                    keyword AS original,
                    categories,
                    brands,
                    COUNT(*) AS variant_count,
                    AVG(COALESCE(total_result, 0)) AS avg_results,
                    COUNT(*) FILTER (WHERE created_at >= (CURRENT_DATE - INTERVAL '7 days')) AS last_7d_searches
                FROM customer_searches
                WHERE keyword IS NOT NULL AND TRIM(keyword) != ''
                  AND total_result >= 3
                  AND created_at >= (CURRENT_DATE - INTERVAL '30 days')
                GROUP BY LOWER(TRIM(keyword)), keyword, categories, brands
            )
            SELECT
                (ARRAY_AGG(original ORDER BY variant_count DESC))[1] AS keyword,
                (ARRAY_AGG(categories ORDER BY variant_count DESC))[1] AS categories,
                (ARRAY_AGG(brands ORDER BY variant_count DESC))[1] AS brands,
                SUM(variant_count) AS search_count,
                AVG(avg_results) AS avg_results,
                SUM(last_7d_searches) AS last_7d_searches
            FROM variants
            GROUP BY norm
            HAVING SUM(variant_count) >= 5
            ORDER BY last_7d_searches DESC, search_count DESC
            LIMIT 50
        """)
    )
    rows = result.fetchall()
    return [
        {
            "keyword": row[0],
            "category": row[1],
            "brand": row[2],
            "search_count": int(row[3]),
            "avg_results": round(float(row[4]), 1),
            "last_7d_searches": int(row[5]),
        }
        for row in rows
    ]


async def _compute_not_purchased_products(prod_db: AsyncSession) -> list[dict]:
    """Products frequently searched but not purchased — surfaces unmet demand."""
    result = await prod_db.execute(
        text("""
            WITH search_variants AS (
                SELECT
                    LOWER(TRIM(keyword)) AS norm,
                    keyword AS original,
                    COUNT(*) AS variant_volume,
                    COUNT(*) FILTER (WHERE created_at >= (CURRENT_DATE - INTERVAL '7 days')) AS variant_last_7d
                FROM customer_searches
                WHERE keyword IS NOT NULL AND TRIM(keyword) != ''
                  AND total_result > 0
                  AND created_at >= (CURRENT_DATE - INTERVAL '30 days')
                GROUP BY LOWER(TRIM(keyword)), keyword
            ),
            search_agg AS (
                SELECT
                    (ARRAY_AGG(original ORDER BY variant_volume DESC))[1] AS keyword,
                    norm,
                    SUM(variant_volume) AS search_volume,
                    SUM(variant_last_7d) AS last_7d
                FROM search_variants
                GROUP BY norm
                HAVING SUM(variant_volume) >= 5
            ),
            purchase_agg AS (
                SELECT
                    LOWER(l.title) AS product_keyword,
                    COUNT(DISTINCT o.id) AS purchase_count
                FROM line_item l
                JOIN "order" o ON l.order_id = o.id
                WHERE o.created_at >= (CURRENT_DATE - INTERVAL '30 days')
                  AND o.status NOT IN ('CANCELLED', 'RETURNED')
                GROUP BY LOWER(l.title)
            )
            SELECT
                s.keyword,
                s.search_volume,
                s.last_7d,
                COALESCE(p.purchase_count, 0) AS purchase_count,
                ROUND(
                    COALESCE(p.purchase_count, 0)::NUMERIC / NULLIF(s.search_volume, 0) * 100,
                    2
                ) AS purchase_to_search_pct
            FROM search_agg s
            LEFT JOIN purchase_agg p ON p.product_keyword ILIKE '%' || s.keyword || '%'
            WHERE COALESCE(p.purchase_count, 0) < s.search_volume * 0.05
            ORDER BY s.search_volume DESC
            LIMIT 50
        """)
    )
    rows = result.fetchall()
    return [
        {
            "keyword": row[0],
            "search_volume": int(row[1]),
            "last_7d_searches": int(row[2]),
            "purchase_count": int(row[3]),
            "purchase_to_search_pct": float(row[4]) if row[4] else 0.0,
        }
        for row in rows
    ]
