"""Monthly orders router — port of monthly-orders.controller.ts."""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.utils.date import get_timezone, get_current_month, is_current_month
from app.utils.pagination import Paginate
from app.models.analytics import MonthlyOrders, AnalyticsJobLog
from app.dependencies import require_permission

router = APIRouter(prefix="/monthly-orders", tags=["Monthly Orders"], dependencies=[Depends(require_permission("orders"))])


@router.get("/")
async def get_monthly_orders(
    request: Request,
    year: int | None = None,
    month: int | None = None,
    timezone: str = "Asia/Kolkata",
    refetch: bool = False,
    db: AsyncSession = Depends(get_analytics_db),
):
    tz = get_timezone(timezone)
    current = get_current_month(timezone)
    target_year = year or current["year"]
    target_month = month or current["month"]

    result = await db.execute(
        select(MonthlyOrders).where(
            MonthlyOrders.year == target_year,
            MonthlyOrders.month == target_month,
        )
    )
    record = result.scalars().first()

    if record and not refetch:
        return success_response(data=_serialize_monthly(record), path=str(request.url.path))

    if is_current_month(target_year, target_month, timezone) and not refetch:
        return success_response(
            data=None,
            message=f"No data for current month ({target_year}-{target_month}). Data calculated at end of month.",
            path=str(request.url.path),
        )

    return success_response(
        data={"status": "pending", "year": target_year, "month": target_month},
        message="Data fetch queued",
        path=str(request.url.path),
    )


@router.get("/all")
async def get_all_monthly_orders(
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1),
    sort: str | None = None,
    db: AsyncSession = Depends(get_analytics_db),
):
    paginator = Paginate(page=page, limit=limit, sort=sort or "year:desc")
    count_result = await db.execute(select(func.count(MonthlyOrders.id)))
    total = count_result.scalar() or 0

    stmt = select(MonthlyOrders).offset(paginator.offset).limit(paginator.limit)
    if paginator.order_by:
        col = getattr(MonthlyOrders, paginator.order_by["field"], MonthlyOrders.year)
        stmt = stmt.order_by(col.desc() if paginator.order_by["direction"] == "desc" else col.asc())
    else:
        stmt = stmt.order_by(MonthlyOrders.year.desc(), MonthlyOrders.month.desc())

    result = await db.execute(stmt)
    records = result.scalars().all()
    resp = paginator.response([_serialize_monthly(r) for r in records], total)
    return success_response(data=resp["data"], meta=resp["meta"], path=str(request.url.path))


@router.get("/job/{job_id}")
async def get_monthly_orders_job(
    request: Request, job_id: str, db: AsyncSession = Depends(get_analytics_db),
):
    result = await db.execute(select(AnalyticsJobLog).where(AnalyticsJobLog.job_key == job_id))
    job = result.scalars().first()
    if not job:
        return success_response(data={"status": "not_found"}, message="Job not found", path=str(request.url.path))
    return success_response(
        data={"jobId": job.job_key, "status": job.status, "resultCount": job.result_count, "duration": job.duration},
        path=str(request.url.path),
    )


def _serialize_monthly(r: MonthlyOrders) -> dict:
    return {
        "id": r.id, "year": r.year, "month": r.month,
        "total": r.total, "discountTotal": r.discountTotal,
        "shippingTotal": r.shippingTotal, "subTotal": r.subTotal,
        "redeemedPoints": r.redeemedPoints,
        "monthlyOrdersCount": r.monthlyOrdersCount, "aov": r.aov,
        "newCustomerOrdersCount": r.new_customer_orders_count,
        "newCustomerTotal": r.new_customer_total,
        "returningCustomerOrdersCount": r.returning_customer_orders_count,
        "returningCustomerTotal": r.returning_customer_total,
        "webOrdersCount": r.web_orders_count, "webTotal": r.web_total,
        "appOrdersCount": r.app_orders_count, "appTotal": r.app_total,
        "createdAt": r.createdAt.isoformat() if r.createdAt else None,
    }
