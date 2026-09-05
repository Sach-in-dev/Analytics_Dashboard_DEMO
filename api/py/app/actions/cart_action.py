"""Cart analytics actions — reads pre-aggregated data from analytics DB."""

import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def get_cart_monthly(db: AsyncSession, **kwargs) -> dict:
    """Monthly aggregation of total/completed/abandoned carts from analytics DB."""
    query = text("""
        SELECT year, month, total_carts, completed_carts, abandoned_carts,
               total_cart_value, completed_cart_value, abandoned_cart_value
        FROM monthly_cart_metrics
        ORDER BY year, month
    """)
    result = await db.execute(query)
    rows = result.fetchall()

    data = {}
    for row in rows:
        dt_str = f"{row[0]}-{row[1]:02d}"
        data[dt_str] = {
            "total_carts": row[2],
            "completed_carts": row[3],
            "abandoned_carts": row[4],
            "total_cart_value": row[5] or 0,
            "completed_cart_value": row[6] or 0,
            "abandoned_cart_value": row[7] or 0,
        }

    return data


async def get_cart_daily(db: AsyncSession, **kwargs) -> dict:
    """Daily aggregation of total/completed/abandoned carts from analytics DB."""
    query = text("""
        SELECT date, total_carts, completed_carts, abandoned_carts,
               total_cart_value, completed_cart_value, abandoned_cart_value
        FROM daily_cart_metrics
        ORDER BY date
    """)
    result = await db.execute(query)
    rows = result.fetchall()

    data = {}
    for row in rows:
        dt_str = row[0].strftime('%Y-%m-%d')
        data[dt_str] = {
            "total_carts": row[1],
            "completed_carts": row[2],
            "abandoned_carts": row[3],
            "total_cart_value": row[4] or 0,
            "completed_cart_value": row[5] or 0,
            "abandoned_cart_value": row[6] or 0,
        }

    return data
