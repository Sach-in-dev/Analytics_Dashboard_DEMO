"""Coupons router — exposes coupon performance metrics from the analytics database."""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import datetime
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import DailyCouponUsage
from app.utils.pagination import Paginate

router = APIRouter(prefix="/coupons", tags=["Coupons"], dependencies=[Depends(require_permission("coupons"))])


@router.get("")
async def get_coupons(
    request: Request,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_analytics_db),
):
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)

    # 1. Total count
    subq = (
        select(DailyCouponUsage.coupon_code)
        .where(
            DailyCouponUsage.date >= start_dt,
            DailyCouponUsage.date <= end_dt
        )
        .group_by(DailyCouponUsage.coupon_code)
        .subquery()
    )
    count_stmt = select(func.count()).select_from(subq)
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    # 2. Results
    paginator = Paginate(page=page, limit=limit)
    
    stmt = (
        select(
            DailyCouponUsage.coupon_code,
            func.max(DailyCouponUsage.coupon_name),
            func.max(DailyCouponUsage.discount_type),
            func.sum(DailyCouponUsage.usage_count).label("total_usage"),
            func.sum(DailyCouponUsage.total_discount).label("total_discount"),
            func.sum(DailyCouponUsage.total_revenue).label("total_revenue")
        )
        .where(
            DailyCouponUsage.date >= start_dt,
            DailyCouponUsage.date <= end_dt
        )
        .group_by(DailyCouponUsage.coupon_code)
        .order_by(desc("total_usage"))
        .offset(paginator.offset)
        .limit(paginator.limit)
    )
    
    result = await db.execute(stmt)
    rows = result.all()
    
    data = [{
        "coupon_code": row[0],
        "coupon_name": row[1],
        "discount_type": row[2],
        "usage_count": row[3],
        "total_discount": row[4],
        "total_revenue": row[5]
    } for row in rows]

    # Window-wide totals (not just this page) — powers the Period Comparison card.
    totals_stmt = select(
        func.coalesce(func.sum(DailyCouponUsage.usage_count), 0),
        func.coalesce(func.sum(DailyCouponUsage.total_discount), 0),
        func.coalesce(func.sum(DailyCouponUsage.total_revenue), 0),
    ).where(DailyCouponUsage.date >= start_dt, DailyCouponUsage.date <= end_dt)
    totals = (await db.execute(totals_stmt)).one()

    resp = paginator.response(data, total)
    meta = {**resp["meta"], "summary": {
        "total_usage": int(totals[0]),
        "total_discount": float(totals[1]),
        "total_revenue": float(totals[2]),
        "unique_coupons": int(total),
    }}
    return success_response(data=resp["data"], meta=meta, path=str(request.url.path))

@router.get("/{coupon_code}")
async def get_single_coupon(
    request: Request,
    coupon_code: str,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_analytics_db),
):
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)

    stmt = (
        select(
            func.max(DailyCouponUsage.coupon_name),
            func.max(DailyCouponUsage.discount_type),
            func.sum(DailyCouponUsage.usage_count).label("total_orders"),
            func.sum(DailyCouponUsage.total_discount).label("total_discount"),
            func.sum(DailyCouponUsage.total_revenue).label("total_revenue")
        )
        .where(
            DailyCouponUsage.coupon_code == coupon_code,
            DailyCouponUsage.date >= start_dt,
            DailyCouponUsage.date <= end_dt
        )
    )
    
    result = await db.execute(stmt)
    row = result.fetchone()
    
    data = {}
    if row and row[0]:
        usage = int(row[2] or 0)
        revenue = int(row[4] or 0)
        discount = int(row[3] or 0)
        avg = round(revenue / usage, 2) if usage > 0 else 0
        
        data = {
            "coupon_code": coupon_code,
            "coupon_name": row[0],
            "discount_type": row[1],
            "total_orders": usage,
            "total_discount": discount,
            "total_revenue": revenue,
            "total_subtotal_amount": revenue + discount,
            "average_order_value": avg,
            "redeemed_points": "-" # UI mock default
        }
        
    return success_response(data=data, path=str(request.url.path))
