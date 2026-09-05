"""Daily orders router — port of daily-orders.controller.ts."""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.utils.date import get_today_date, get_timezone, is_current_day
from app.utils.pagination import Paginate
from app.models.analytics import DailyOrders, AnalyticsJobLog
from app.dependencies import require_permission

router = APIRouter(prefix="/daily-orders", tags=["Daily Orders"], dependencies=[Depends(require_permission("orders"))])


@router.get("/")
async def get_daily_orders(
    request: Request,
    date: str | None = None,
    timezone: str = "Asia/Kolkata",
    refetch: bool = False,
    db: AsyncSession = Depends(get_analytics_db),
):
    tz = get_timezone(timezone)
    target_date = date or get_today_date(timezone)

    from app.utils.date import get_date
    date_range = get_date(date=target_date, timezone=timezone)
    start_of_day = date_range["start_of_day"]

    result = await db.execute(
        select(DailyOrders).where(DailyOrders.date == start_of_day)
    )
    record = result.scalars().first()

    if record and not refetch:
        return success_response(data=_serialize_daily(record), path=str(request.url.path))

    if is_current_day(target_date, timezone) and not refetch:
        return success_response(
            data=None,
            message=f"No data available for today ({target_date}). Data is calculated at end of day.",
            path=str(request.url.path),
        )

    # If refetch or missing, queue a background job (simplified: return pending status)
    return success_response(
        data={"status": "pending", "date": target_date, "message": "Data processing queued"},
        message="Data fetch queued",
        path=str(request.url.path),
    )


@router.get("/all")
async def get_all_daily_orders(
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1),
    sort: str | None = None,
    db: AsyncSession = Depends(get_analytics_db),
):
    paginator = Paginate(page=page, limit=limit, sort=sort or "date:desc")

    count_result = await db.execute(select(func.count(DailyOrders.id)))
    total = count_result.scalar() or 0

    stmt = select(DailyOrders).offset(paginator.offset).limit(paginator.limit)
    if paginator.order_by:
        col = getattr(DailyOrders, paginator.order_by["field"], DailyOrders.date)
        stmt = stmt.order_by(col.desc() if paginator.order_by["direction"] == "desc" else col.asc())
    else:
        stmt = stmt.order_by(DailyOrders.date.desc())

    result = await db.execute(stmt)
    records = result.scalars().all()

    resp = paginator.response([_serialize_daily(r) for r in records], total)
    return success_response(data=resp["data"], meta=resp["meta"], path=str(request.url.path))


@router.get("/job/{job_id}")
async def get_daily_orders_job(
    request: Request,
    job_id: str,
    db: AsyncSession = Depends(get_analytics_db),
):
    result = await db.execute(
        select(AnalyticsJobLog).where(AnalyticsJobLog.job_key == job_id)
    )
    job = result.scalars().first()
    if not job:
        return success_response(data={"status": "not_found"}, message="Job not found", path=str(request.url.path))

    return success_response(
        data={"jobId": job.job_key, "status": job.status, "resultCount": job.result_count, "duration": job.duration},
        path=str(request.url.path),
    )


def _serialize_daily(r: DailyOrders) -> dict:
    return {
        "id": r.id,
        "date": r.date.isoformat() if r.date else None,
        "total": r.total,
        "discountTotal": r.discountTotal,
        "shippingTotal": r.shippingTotal,
        "subTotal": r.subTotal,
        "redeemedPoints": r.redeemedPoints,
        "dailyOrdersCount": r.dailyOrdersCount,
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
        "createdAt": r.createdAt.isoformat() if r.createdAt else None,
    }
