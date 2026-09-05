"""Sync cart metrics from production DB into analytics DB."""

import logging
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, delete
from app.models.analytics import DailyCartMetrics, MonthlyCartMetrics

logger = logging.getLogger(__name__)


async def sync_daily_carts(prod_db: AsyncSession, analytics_db: AsyncSession, date: str):
    """Fetch daily cart metrics from prod DB and upsert into analytics DB."""
    dt = datetime.strptime(date, "%Y-%m-%d")

    query = text("""
        WITH cart_stats AS (
            SELECT COUNT(id) as total_carts,
                   COUNT(id) FILTER (WHERE completed_at IS NOT NULL) as completed_carts,
                   COUNT(id) FILTER (WHERE completed_at IS NULL) as abandoned_carts,
                   COALESCE(SUM(total) FILTER (WHERE completed_at IS NOT NULL), 0) as completed_cart_value
            FROM public.cart
            WHERE created_at >= :start AND created_at < :end
        ),
        abandoned_stats AS (
            SELECT COALESCE(SUM(li."unitPrice" * li."quantity"), 0) as abandoned_cart_value
            FROM public.cart c
            JOIN public.line_item li ON li.cart_id = c.id
            WHERE c.created_at >= :start AND c.created_at < :end AND c.completed_at IS NULL
        )
        SELECT 
            cs.total_carts, cs.completed_carts, cs.abandoned_carts,
            cs.completed_cart_value + abs.abandoned_cart_value as total_cart_value,
            cs.completed_cart_value,
            abs.abandoned_cart_value
        FROM cart_stats cs, abandoned_stats abs
    """)
    from datetime import timedelta
    result = await prod_db.execute(query, {
        "start": dt,
        "end": dt + timedelta(days=1),
    })
    row = result.fetchone()
    if not row:
        return

    # Delete existing record for this date (upsert)
    await analytics_db.execute(
        delete(DailyCartMetrics).where(DailyCartMetrics.date == dt)
    )

    record = DailyCartMetrics(
        date=dt,
        total_carts=row[0] or 0,
        completed_carts=row[1] or 0,
        abandoned_carts=row[2] or 0,
        total_cart_value=row[3] or 0,
        completed_cart_value=row[4] or 0,
        abandoned_cart_value=row[5] or 0,
    )
    analytics_db.add(record)
    await analytics_db.commit()
    logger.info(f"Synced daily cart metrics for {date}: total={row[0]}, abandoned_value={row[5]}")


async def sync_monthly_carts(prod_db: AsyncSession, analytics_db: AsyncSession, year: int, month: int):
    """Fetch monthly cart metrics from prod DB and upsert into analytics DB."""
    from calendar import monthrange
    start = datetime(year, month, 1)
    _, last_day = monthrange(year, month)
    end = datetime(year, month, last_day, 23, 59, 59)

    query = text("""
        WITH cart_stats AS (
            SELECT COUNT(id) as total_carts,
                   COUNT(id) FILTER (WHERE completed_at IS NOT NULL) as completed_carts,
                   COUNT(id) FILTER (WHERE completed_at IS NULL) as abandoned_carts,
                   COALESCE(SUM(total) FILTER (WHERE completed_at IS NOT NULL), 0) as completed_cart_value
            FROM public.cart
            WHERE created_at >= :start AND created_at <= :end
        ),
        abandoned_stats AS (
            SELECT COALESCE(SUM(li."unitPrice" * li."quantity"), 0) as abandoned_cart_value
            FROM public.cart c
            JOIN public.line_item li ON li.cart_id = c.id
            WHERE c.created_at >= :start AND c.created_at <= :end AND c.completed_at IS NULL
        )
        SELECT 
            cs.total_carts, cs.completed_carts, cs.abandoned_carts,
            cs.completed_cart_value + abs.abandoned_cart_value as total_cart_value,
            cs.completed_cart_value,
            abs.abandoned_cart_value
        FROM cart_stats cs, abandoned_stats abs
    """)
    result = await prod_db.execute(query, {"start": start, "end": end})
    row = result.fetchone()
    if not row:
        return

    # Delete existing record for this month (upsert)
    await analytics_db.execute(
        delete(MonthlyCartMetrics).where(
            MonthlyCartMetrics.year == year,
            MonthlyCartMetrics.month == month,
        )
    )

    record = MonthlyCartMetrics(
        year=year,
        month=month,
        total_carts=row[0] or 0,
        completed_carts=row[1] or 0,
        abandoned_carts=row[2] or 0,
        total_cart_value=row[3] or 0,
        completed_cart_value=row[4] or 0,
        abandoned_cart_value=row[5] or 0,
    )
    analytics_db.add(record)
    await analytics_db.commit()
    logger.info(f"Synced monthly cart metrics for {year}-{month:02d}: total={row[0]}, abandoned_value={row[5]}")
