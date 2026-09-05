"""Carts router — exposes cart metrics from the analytics database."""

from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from datetime import datetime
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import DailyCartMetrics, MonthlyCartMetrics

router = APIRouter(prefix="/carts", tags=["Carts"], dependencies=[Depends(require_permission("carts"))])


@router.get("")
async def get_carts(
    request: Request,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    interval: str | None = Query(None, description="Granularity: daily or monthly"),
    db: AsyncSession = Depends(get_analytics_db),
):
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    if interval == "monthly":
        start_year, start_month = start_dt.year, start_dt.month
        end_year, end_month = end_dt.year, end_dt.month

        start_str = f"{start_year}-{start_month:02d}"
        end_str = f"{end_year}-{end_month:02d}"

        stmt = select(MonthlyCartMetrics).where(
            func.concat(func.cast(MonthlyCartMetrics.year, str), '-', func.lpad(func.cast(MonthlyCartMetrics.month, str), 2, '0')) >= start_str,
            func.concat(func.cast(MonthlyCartMetrics.year, str), '-', func.lpad(func.cast(MonthlyCartMetrics.month, str), 2, '0')) <= end_str,
        ).order_by(MonthlyCartMetrics.year.asc(), MonthlyCartMetrics.month.asc())

        result = await db.execute(stmt)
        records = result.scalars().all()

        return success_response(data=[_serialize_monthly(r) for r in records], path=str(request.url.path))
    else:
        stmt = select(DailyCartMetrics).where(
            DailyCartMetrics.date >= start_dt,
            DailyCartMetrics.date <= end_dt
        ).order_by(DailyCartMetrics.date.asc())

        result = await db.execute(stmt)
        records = result.scalars().all()

        return success_response(data=[_serialize_daily(r) for r in records], path=str(request.url.path))


def _serialize_daily(r: DailyCartMetrics) -> dict:
    return {
        "id": r.id,
        "date": r.date.strftime("%Y-%m-%d") if r.date else None,
        "total_carts": r.total_carts,
        "completed_carts": r.completed_carts,
        "abandoned_carts": r.abandoned_carts,
        "total_cart_value": r.total_cart_value or 0,
        "completed_cart_value": r.completed_cart_value or 0,
        "abandoned_cart_value": r.abandoned_cart_value or 0,
        "interval": "daily"
    }

def _serialize_monthly(r: MonthlyCartMetrics) -> dict:
    return {
        "id": r.id,
        "date": f"{r.year}-{r.month:02d}",
        "total_carts": r.total_carts,
        "completed_carts": r.completed_carts,
        "abandoned_carts": r.abandoned_carts,
        "total_cart_value": r.total_cart_value or 0,
        "completed_cart_value": r.completed_cart_value or 0,
        "abandoned_cart_value": r.abandoned_cart_value or 0,
        "interval": "monthly"
    }


@router.get("/abandoned-products")
async def get_abandoned_products(
    request: Request,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    page: int = Query(1, description="Page number"),
    limit: int = Query(10, description="Items per page"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get abandoned products from analytics DB (pre-synced from prod) with pagination."""
    start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()
    offset = (page - 1) * limit

    count_query = text("""
        SELECT COUNT(DISTINCT product_title)
        FROM cart_abandoned_products
        WHERE date >= :start_dt AND date <= :end_dt AND product_title != 'Default'
    """)
    total_result = await db.execute(count_query, {"start_dt": start_dt, "end_dt": end_dt})
    total = total_result.scalar() or 0

    query = text("""
        SELECT product_title, SUM(count) as total_count
        FROM cart_abandoned_products
        WHERE date >= :start_dt AND date <= :end_dt AND product_title != 'Default'
        GROUP BY product_title
        ORDER BY total_count DESC
        LIMIT :limit OFFSET :offset
    """)

    result = await db.execute(query, {
        "start_dt": start_dt, 
        "end_dt": end_dt,
        "limit": limit,
        "offset": offset
    })
    rows = result.fetchall()

    data = [{"title": row[0], "count": row[1]} for row in rows]
    return success_response(data={"items": data, "total": total}, path=str(request.url.path))
