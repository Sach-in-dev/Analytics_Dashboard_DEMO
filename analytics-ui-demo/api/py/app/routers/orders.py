"""Orders router — single endpoint supporting date ranges and intervals."""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, String
from datetime import datetime
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.models.analytics import DailyOrders, MonthlyOrders
from app.dependencies import require_permission
from app.utils.date import get_date

router = APIRouter(prefix="/orders", tags=["Orders"], dependencies=[Depends(require_permission("orders"))])

@router.get("")
async def get_orders(
    request: Request,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    interval: str | None = Query(None, description="Granularity: daily or monthly"),
    timezone: str = Query("Asia/Kolkata"),
    db: AsyncSession = Depends(get_analytics_db),
):
    # daily_orders.date stores the IST start-of-day converted to UTC (e.g. IST Jul 1
    #00:00 -> UTC Jun 30 18:30), so filtering must use the same conversion as the
    # write path (app.utils.date.get_date) rather than naive local date strings —
    # otherwise the last day of a range can silently fall outside the naive bounds.
    start_dt = get_date(date=start_date, timezone=timezone)["start_of_day"]
    end_dt = get_date(date=end_date, timezone=timezone)["end_of_day"]
    if interval == "monthly":
        start_year, start_month = start_dt.year, start_dt.month
        end_year, end_month = end_dt.year, end_dt.month
        
        # Simplified logic for month range using string comparison
        start_str = f"{start_year}-{start_month:02d}"
        end_str = f"{end_year}-{end_month:02d}"
        
        stmt = select(MonthlyOrders).where(
            func.concat(func.cast(MonthlyOrders.year, String), '-', func.lpad(func.cast(MonthlyOrders.month, String), 2, '0')) >= start_str,
            func.concat(func.cast(MonthlyOrders.year, String), '-', func.lpad(func.cast(MonthlyOrders.month, String), 2, '0')) <= end_str,
        ).order_by(MonthlyOrders.year.asc(), MonthlyOrders.month.asc())
        
        result = await db.execute(stmt)
        records = result.scalars().all()
        
        return success_response(data=[_serialize_monthly(r) for r in records], path=str(request.url.path))
    else:
        # Fetch daily orders
        stmt = select(DailyOrders).where(
            DailyOrders.date >= start_dt,
            DailyOrders.date <= end_dt
        ).order_by(DailyOrders.date.asc())
        
        result = await db.execute(stmt)
        records = result.scalars().all()
        
        return success_response(data=[_serialize_daily(r) for r in records], path=str(request.url.path))


def _serialize_daily(r: DailyOrders) -> dict:
    return {
        "id": r.id,
        "date": r.date.strftime("%Y-%m-%d") if r.date else None,
        "total": r.total,
        "discountTotal": r.discountTotal,
        "shippingTotal": r.shippingTotal,
        "subTotal": r.subTotal,
        "redeemedPoints": r.redeemedPoints,
        "ordersCount": r.dailyOrdersCount, 
        "aov": r.aov,
        "newCustomerOrdersCount": r.new_customer_orders_count,
        "newCustomerTotal": r.new_customer_total,
        "newCustomerAov": r.new_customer_aov,
        "returningCustomerOrdersCount": r.returning_customer_orders_count,
        "returningCustomerTotal": r.returning_customer_total,
        "returningCustomerAov": r.returning_customer_aov,
        "webOrdersCount": r.web_orders_count,
        "webTotal": r.web_total,
        "webAov": r.web_aov,
        "appOrdersCount": r.app_orders_count,
        "appTotal": r.app_total,
        "appAov": r.app_aov,
        "interval": "daily"
    }

def _serialize_monthly(r: MonthlyOrders) -> dict:
    return {
        "id": r.id,
        "date": f"{r.year}-{r.month:02d}", 
        "total": r.total,
        "discountTotal": r.discountTotal,
        "shippingTotal": r.shippingTotal,
        "subTotal": r.subTotal,
        "redeemedPoints": r.redeemedPoints,
        "ordersCount": r.monthlyOrdersCount,
        "aov": r.aov,
        "newCustomerOrdersCount": r.new_customer_orders_count,
        "newCustomerTotal": r.new_customer_total,
        "newCustomerAov": r.new_customer_aov,
        "returningCustomerOrdersCount": r.returning_customer_orders_count,
        "returningCustomerTotal": r.returning_customer_total,
        "returningCustomerAov": r.returning_customer_aov,
        "webOrdersCount": r.web_orders_count,
        "webTotal": r.web_total,
        "webAov": r.web_aov,
        "appOrdersCount": r.app_orders_count,
        "appTotal": r.app_total,
        "appAov": r.app_aov,
        "interval": "monthly"
    }
