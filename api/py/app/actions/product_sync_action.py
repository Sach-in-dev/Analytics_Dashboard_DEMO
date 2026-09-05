"""Sync product metrics from production DB into analytics DB."""

import logging
from datetime import datetime, timedelta
from calendar import monthrange
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, delete
from app.models.analytics import DailyProductMetrics, MonthlyProductMetrics

logger = logging.getLogger(__name__)


async def sync_daily_products(prod_db: AsyncSession, analytics_db: AsyncSession, date: str):
    """Fetch daily product metrics from prod DB and upsert into analytics DB."""
    dt = datetime.strptime(date, "%Y-%m-%d")
    end = dt + timedelta(days=1)

    # Delete existing records for this date
    await analytics_db.execute(
        delete(DailyProductMetrics).where(DailyProductMetrics.date == dt)
    )

    # 1. Orders (with category)
    q_orders = text("""
        SELECT p.title,
               SUM(oi.quantity) as qty,
               MAX(pc.name) as category
        FROM public.order_item oi
        JOIN public.product p ON oi.product_id = p.id
        LEFT JOIN public.product_category_products pcp ON pcp.product_id = p.id
        LEFT JOIN public.product_categories pc ON pc.id = pcp.category_id AND pc.parent_id IS NOT NULL
        WHERE oi.type = 'PRODUCT'
          AND oi.created_at >= :start AND oi.created_at < :end
        GROUP BY p.title
    """)
    result = await prod_db.execute(q_orders, {"start": dt, "end": end})
    for row in result.fetchall():
        analytics_db.add(DailyProductMetrics(
            date=dt, product_title=row[0], metric_type="order",
            value=float(row[1] or 0), product_category=row[2]
        ))

    # 2. Revenue (with category)
    q_revenue = text("""
        SELECT p.title,
               SUM(oi.quantity * COALESCE(oi.unit_price, 0)) as rev,
               MAX(pc.name) as category
        FROM public.order_item oi
        JOIN public.product p ON oi.product_id = p.id
        LEFT JOIN public.product_category_products pcp ON pcp.product_id = p.id
        LEFT JOIN public.product_categories pc ON pc.id = pcp.category_id AND pc.parent_id IS NOT NULL
        WHERE oi.type = 'PRODUCT'
          AND oi.created_at >= :start AND oi.created_at < :end
        GROUP BY p.title
    """)
    result = await prod_db.execute(q_revenue, {"start": dt, "end": end})
    for row in result.fetchall():
        analytics_db.add(DailyProductMetrics(
            date=dt, product_title=row[0], metric_type="revenue",
            value=float(row[1] or 0), product_category=row[2]
        ))

    # 3. Cart additions (with category)
    q_carts = text("""
        SELECT p.title,
               SUM(li.quantity) as qty,
               MAX(pc.name) as category
        FROM public.line_item li
        JOIN public.product p ON li.product_id = p.id
        LEFT JOIN public.product_category_products pcp ON pcp.product_id = p.id
        LEFT JOIN public.product_categories pc ON pc.id = pcp.category_id AND pc.parent_id IS NOT NULL
        WHERE li.type = 'PRODUCT'
          AND li.created_at >= :start AND li.created_at < :end
        GROUP BY p.title
    """)
    result = await prod_db.execute(q_carts, {"start": dt, "end": end})
    for row in result.fetchall():
        analytics_db.add(DailyProductMetrics(
            date=dt, product_title=row[0], metric_type="cart",
            value=float(row[1] or 0), product_category=row[2]
        ))

    # 4. Searches
    q_searches = text("""
        SELECT keyword, count(*)
        FROM public.customer_searches
        WHERE created_at >= :start AND created_at < :end
          AND keyword IS NOT NULL AND trim(keyword) != ''
        GROUP BY keyword
    """)
    result = await prod_db.execute(q_searches, {"start": dt, "end": end})
    for row in result.fetchall():
        analytics_db.add(DailyProductMetrics(
            date=dt, product_title=row[0], metric_type="search", value=float(row[1] or 0)
        ))

    await analytics_db.commit()
    logger.info(f"Synced daily product metrics for {date}")


async def sync_monthly_products(prod_db: AsyncSession, analytics_db: AsyncSession, year: int, month: int):
    """Fetch monthly product metrics from prod DB and upsert into analytics DB."""
    start = datetime(year, month, 1)
    _, last_day = monthrange(year, month)
    end = datetime(year, month, last_day, 23, 59, 59)

    # Delete existing records for this month
    await analytics_db.execute(
        delete(MonthlyProductMetrics).where(
            MonthlyProductMetrics.year == year,
            MonthlyProductMetrics.month == month,
        )
    )

    # 1. Orders (with category)
    q_orders = text("""
        SELECT p.title, SUM(oi.quantity) as qty, MAX(pc.name) as category
        FROM public.order_item oi JOIN public.product p ON oi.product_id = p.id
        LEFT JOIN public.product_category_products pcp ON pcp.product_id = p.id
        LEFT JOIN public.product_categories pc ON pc.id = pcp.category_id AND pc.parent_id IS NOT NULL
        WHERE oi.type = 'PRODUCT' AND oi.created_at >= :start AND oi.created_at <= :end
        GROUP BY p.title
    """)
    result = await prod_db.execute(q_orders, {"start": start, "end": end})
    for row in result.fetchall():
        analytics_db.add(MonthlyProductMetrics(
            year=year, month=month, product_title=row[0], metric_type="order",
            value=float(row[1] or 0), product_category=row[2]
        ))

    # 2. Revenue (with category)
    q_revenue = text("""
        SELECT p.title, SUM(oi.quantity * COALESCE(oi.unit_price, 0)) as rev, MAX(pc.name) as category
        FROM public.order_item oi JOIN public.product p ON oi.product_id = p.id
        LEFT JOIN public.product_category_products pcp ON pcp.product_id = p.id
        LEFT JOIN public.product_categories pc ON pc.id = pcp.category_id AND pc.parent_id IS NOT NULL
        WHERE oi.type = 'PRODUCT' AND oi.created_at >= :start AND oi.created_at <= :end
        GROUP BY p.title
    """)
    result = await prod_db.execute(q_revenue, {"start": start, "end": end})
    for row in result.fetchall():
        analytics_db.add(MonthlyProductMetrics(
            year=year, month=month, product_title=row[0], metric_type="revenue",
            value=float(row[1] or 0), product_category=row[2]
        ))

    # 3. Cart additions (with category)
    q_carts = text("""
        SELECT p.title, SUM(li.quantity) as qty, MAX(pc.name) as category
        FROM public.line_item li JOIN public.product p ON li.product_id = p.id
        LEFT JOIN public.product_category_products pcp ON pcp.product_id = p.id
        LEFT JOIN public.product_categories pc ON pc.id = pcp.category_id AND pc.parent_id IS NOT NULL
        WHERE li.type = 'PRODUCT' AND li.created_at >= :start AND li.created_at <= :end
        GROUP BY p.title
    """)
    result = await prod_db.execute(q_carts, {"start": start, "end": end})
    for row in result.fetchall():
        analytics_db.add(MonthlyProductMetrics(
            year=year, month=month, product_title=row[0], metric_type="cart",
            value=float(row[1] or 0), product_category=row[2]
        ))

    # 4. Searches
    q_searches = text("""
        SELECT keyword, count(*)
        FROM public.customer_searches
        WHERE created_at >= :start AND created_at <= :end
          AND keyword IS NOT NULL AND trim(keyword) != ''
        GROUP BY keyword
    """)
    result = await prod_db.execute(q_searches, {"start": start, "end": end})
    for row in result.fetchall():
        analytics_db.add(MonthlyProductMetrics(
            year=year, month=month, product_title=row[0], metric_type="search", value=float(row[1] or 0)
        ))

    await analytics_db.commit()
    logger.info(f"Synced monthly product metrics for {year}-{month:02d}")
