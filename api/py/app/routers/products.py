"""Products router — exposes product performance metrics from the analytics database."""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import datetime
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import DailyProductMetrics
from app.utils.pagination import Paginate

router = APIRouter(prefix="/products", tags=["Products"], dependencies=[Depends(require_permission("products"))])


@router.get("")
async def get_products(
    request: Request,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    metric_type: str = Query("revenue", description="Type of metric: order, revenue, cart, search"),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get top products by orders, revenue, carts, or searches across a date range."""
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)

    # 1. Total count using GROUP BY in a subquery
    subq = (
        select(DailyProductMetrics.product_title)
        .where(
            DailyProductMetrics.date >= start_dt,
            DailyProductMetrics.date <= end_dt,
            DailyProductMetrics.metric_type == metric_type
        )
        .group_by(DailyProductMetrics.product_title)
        .subquery()
    )
    count_stmt = select(func.count()).select_from(subq)
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    # 2. Results
    paginator = Paginate(page=page, limit=limit)
    
    stmt = (
        select(
            DailyProductMetrics.product_title,
            func.sum(DailyProductMetrics.value).label("total_value")
        )
        .where(
            DailyProductMetrics.date >= start_dt,
            DailyProductMetrics.date <= end_dt,
            DailyProductMetrics.metric_type == metric_type
        )
        .group_by(DailyProductMetrics.product_title)
        .order_by(desc("total_value"))
        .offset(paginator.offset)
        .limit(paginator.limit)
    )
    
    result = await db.execute(stmt)
    rows = result.all()
    
    data = [{"product_title": row[0], "value": row[1]} for row in rows]

    # Window-wide totals (not just this page) — powers the Period Comparison card.
    total_value_stmt = select(func.coalesce(func.sum(DailyProductMetrics.value), 0)).where(
        DailyProductMetrics.date >= start_dt,
        DailyProductMetrics.date <= end_dt,
        DailyProductMetrics.metric_type == metric_type,
    )
    total_value = (await db.execute(total_value_stmt)).scalar() or 0

    resp = paginator.response(data, total)
    meta = {**resp["meta"], "summary": {"total_value": float(total_value), "unique_products": int(total)}}
    return success_response(data=resp["data"], meta=meta, path=str(request.url.path))


@router.get("/category-stickiness")
async def get_category_stickiness(
    request: Request,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Category stickiness: customers who purchased from same category multiple times."""
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    from sqlalchemy import text
    query = text("""
        WITH category_purchases AS (
            SELECT
                product_category,
                COUNT(*) AS total_orders,
                SUM(value) AS total_revenue
            FROM daily_product_metrics
            WHERE metric_type = 'revenue'
              AND date >= :start_dt AND date <= :end_dt
              AND product_category IS NOT NULL
            GROUP BY product_category
        )
        SELECT
            product_category,
            total_orders,
            total_revenue
        FROM category_purchases
        ORDER BY total_revenue DESC
        LIMIT 20
    """)
    result = await db.execute(query, {"start_dt": start_dt, "end_dt": end_dt})
    rows = result.fetchall()
    data = [
        {"category": r[0], "total_orders": int(r[1]), "total_revenue": float(r[2])}
        for r in rows
    ]
    return success_response(data=data, path=str(request.url.path))


@router.get("/cross-category")
async def get_cross_category_migration(
    request: Request,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Cross-category migration: category revenue share trends over time.
    Groups monthly_product_metrics by category to show share shifts.
    """
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    from app.models.analytics import MonthlyProductMetrics

    # Dialect-portable rewrite: MAKE_DATE/CONCAT/LPAD are Postgres-only, so
    # filter by (year, month) and format the period label in Python instead.
    start_ym = (start_dt.year, start_dt.month)
    end_ym = (end_dt.year, end_dt.month)
    stmt = select(
        MonthlyProductMetrics.year, MonthlyProductMetrics.month,
        MonthlyProductMetrics.product_category, MonthlyProductMetrics.value,
    ).where(
        MonthlyProductMetrics.metric_type == "revenue",
        MonthlyProductMetrics.product_category.is_not(None),
    )
    result = await db.execute(stmt)
    rows = result.fetchall()

    monthly_cat: dict = {}
    for year, month, category, value in rows:
        if not (start_ym <= (year, month) <= end_ym):
            continue
        period = f"{year:04d}-{month:02d}"
        key = (period, category)
        monthly_cat[key] = monthly_cat.get(key, 0.0) + float(value)

    period_totals: dict = {}
    for (period, _category), revenue in monthly_cat.items():
        period_totals[period] = period_totals.get(period, 0.0) + revenue

    data = [
        {
            "period": period,
            "category": category,
            "revenue": revenue,
            "share_pct": round(revenue / period_totals[period] * 100, 1) if period_totals[period] else 0.0,
        }
        for (period, category), revenue in monthly_cat.items()
    ]
    data.sort(key=lambda d: (d["period"], -d["revenue"]))
    return success_response(data=data, path=str(request.url.path))


@router.get("/new-category-trials")
async def get_new_category_trials(
    request: Request,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """New category trials: categories with first-time revenue in the date range
    (zero revenue in the prior equal-length window).
    """
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    days = (end_dt - start_dt).days or 1
    from sqlalchemy import text
    from datetime import timedelta
    prior_end = start_dt - timedelta(days=1)
    prior_start = prior_end - timedelta(days=days)

    query = text("""
        WITH current_cats AS (
            SELECT product_category, SUM(value) AS revenue
            FROM daily_product_metrics
            WHERE metric_type = 'revenue'
              AND product_category IS NOT NULL
              AND date >= :start_dt AND date <= :end_dt
            GROUP BY product_category
        ),
        prior_cats AS (
            SELECT product_category, SUM(value) AS revenue
            FROM daily_product_metrics
            WHERE metric_type = 'revenue'
              AND product_category IS NOT NULL
              AND date >= :prior_start AND date <= :prior_end
            GROUP BY product_category
        )
        SELECT
            c.product_category,
            c.revenue AS current_revenue,
            COALESCE(p.revenue, 0) AS prior_revenue
        FROM current_cats c
        LEFT JOIN prior_cats p ON c.product_category = p.product_category
        WHERE COALESCE(p.revenue, 0) = 0
        ORDER BY c.revenue DESC
        LIMIT 20
    """)
    result = await db.execute(query, {
        "start_dt": start_dt, "end_dt": end_dt,
        "prior_start": prior_start, "prior_end": prior_end,
    })
    rows = result.fetchall()
    data = [
        {"category": r[0], "current_revenue": float(r[1]), "prior_revenue": float(r[2])}
        for r in rows
    ]
    return success_response(data=data, path=str(request.url.path))
