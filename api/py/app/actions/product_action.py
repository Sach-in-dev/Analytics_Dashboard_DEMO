"""Product performance actions — reads pre-aggregated data from analytics DB."""

import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


def _top_n_from_rows(rows, n=5) -> list:
    """Sort by value descending and return top N."""
    sorted_items = sorted(rows, key=lambda x: x[1], reverse=True)[:n]
    return [{"name": r[0], "value": r[1]} for r in sorted_items]


async def get_product_monthly(db: AsyncSession, top_n: int = 5, **kwargs) -> dict:
    """Monthly top products by orders, revenue, carts, and searched keywords."""
    query = text("""
        SELECT year, month, product_title, metric_type, value
        FROM monthly_product_metrics
        ORDER BY year, month
    """)
    result = await db.execute(query)
    rows = result.fetchall()

    # Group by metric_type and month
    from collections import defaultdict
    buckets = defaultdict(lambda: defaultdict(list))
    for row in rows:
        dt_str = f"{row[0]}-{row[1]:02d}"
        metric_type = row[3]
        buckets[metric_type][dt_str].append((row[2], row[4]))

    return {
        "orders": {dt: _top_n_from_rows(items, top_n) for dt, items in sorted(buckets.get("order", {}).items())},
        "revenue": {dt: _top_n_from_rows(items, top_n) for dt, items in sorted(buckets.get("revenue", {}).items())},
        "carts": {dt: _top_n_from_rows(items, top_n) for dt, items in sorted(buckets.get("cart", {}).items())},
        "searches": {dt: _top_n_from_rows(items, top_n) for dt, items in sorted(buckets.get("search", {}).items())},
    }


async def get_product_daily(db: AsyncSession, top_n: int = 5, **kwargs) -> dict:
    """Daily top products by orders, revenue, carts, and searched keywords."""
    query = text("""
        SELECT date, product_title, metric_type, value
        FROM daily_product_metrics
        ORDER BY date
    """)
    result = await db.execute(query)
    rows = result.fetchall()

    from collections import defaultdict
    buckets = defaultdict(lambda: defaultdict(list))
    for row in rows:
        dt_str = row[0].strftime('%Y-%m-%d')
        metric_type = row[2]
        buckets[metric_type][dt_str].append((row[1], row[3]))

    return {
        "orders": {dt: _top_n_from_rows(items, top_n) for dt, items in sorted(buckets.get("order", {}).items())},
        "revenue": {dt: _top_n_from_rows(items, top_n) for dt, items in sorted(buckets.get("revenue", {}).items())},
        "carts": {dt: _top_n_from_rows(items, top_n) for dt, items in sorted(buckets.get("cart", {}).items())},
        "searches": {dt: _top_n_from_rows(items, top_n) for dt, items in sorted(buckets.get("search", {}).items())},
    }
