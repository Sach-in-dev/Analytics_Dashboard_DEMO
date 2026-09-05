"""Courier Performance router — exposes courier-wise performance metrics.
Supports date filtering. Reads only from analytics DB.
"""

from datetime import date, datetime
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, cast, Numeric
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import CourierPerformanceMetrics

router = APIRouter(
    prefix="/courier-performance",
    tags=["Courier Performance"],
    dependencies=[Depends(require_permission("courier_performance"))],
)


def _parse_date(date_str: str | None) -> date | None:
    """Parse YYYY-MM-DD string to date, returns None on failure."""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return None


@router.get("")
async def get_courier_performance(
    request: Request,
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get courier performance summary + per-courier breakdown."""
    start = _parse_date(start_date)
    end = _parse_date(end_date)

    # ── Base filter builder ──
    def _apply_filters(stmt):
        if start:
            stmt = stmt.where(CourierPerformanceMetrics.date >= start)
        if end:
            stmt = stmt.where(CourierPerformanceMetrics.date <= end)
        return stmt

    # ── Summary: aggregated totals ──
    summary_stmt = select(
        func.coalesce(func.sum(CourierPerformanceMetrics.total_orders), 0).label("total_orders"),
        func.coalesce(func.sum(CourierPerformanceMetrics.delivered_orders), 0).label("delivered_orders"),
        func.coalesce(func.sum(CourierPerformanceMetrics.rto_orders), 0).label("rto_orders"),
        func.coalesce(func.sum(CourierPerformanceMetrics.failed_orders), 0).label("failed_orders"),
    )
    summary_stmt = _apply_filters(summary_stmt)
    result = await db.execute(summary_stmt)
    row = result.one()

    s_total = int(row[0])
    s_delivered = int(row[1])
    s_rto = int(row[2])
    s_failed = int(row[3])
    s_rto_rate = round(s_rto * 100 / s_total, 1) if s_total > 0 else 0.0
    s_failure_rate = round(s_failed * 100 / s_total, 1) if s_total > 0 else 0.0

    summary = {
        "total_orders": s_total,
        "delivered_orders": s_delivered,
        "rto_orders": s_rto,
        "failed_orders": s_failed,
        "rto_rate": s_rto_rate,
        "failure_rate": s_failure_rate,
    }

    # ── Per-courier breakdown ──
    courier_stmt = (
        select(
            CourierPerformanceMetrics.courier_partner,
            func.sum(CourierPerformanceMetrics.total_orders).label("total_orders"),
            func.sum(CourierPerformanceMetrics.delivered_orders).label("delivered_orders"),
            func.sum(CourierPerformanceMetrics.rto_orders).label("rto_orders"),
            func.sum(CourierPerformanceMetrics.failed_orders).label("failed_orders"),
            func.round(
                cast(
                    func.avg(CourierPerformanceMetrics.avg_delivery_time)
                    .filter(CourierPerformanceMetrics.avg_delivery_time > 0),
                    Numeric
                ),
                1
            ).label("avg_delivery_time"),
        )
        .group_by(CourierPerformanceMetrics.courier_partner)
        .having(func.sum(CourierPerformanceMetrics.total_orders) > 0)
        .order_by(desc("total_orders"))
    )
    courier_stmt = _apply_filters(courier_stmt)
    courier_result = await db.execute(courier_stmt)
    courier_rows = courier_result.all()

    couriers = []
    for r in courier_rows:
        t = int(r[1])
        delivered = int(r[2])
        rto = int(r[3])
        failed = int(r[4])
        avg_time = float(r[5]) if r[5] is not None else 0.0
        couriers.append({
            "courier_partner": r[0],
            "total_orders": t,
            "delivered_orders": delivered,
            "rto_orders": rto,
            "failed_orders": failed,
            "rto_rate": round(rto * 100 / t, 1) if t > 0 else 0.0,
            "failure_rate": round(failed * 100 / t, 1) if t > 0 else 0.0,
            "avg_delivery_time": avg_time,
        })

    # ── Best / Worst courier ──
    # Best: lowest RTO rate among couriers with ≥10 orders
    qualified = [c for c in couriers if c["total_orders"] >= 10]
    best_courier = min(qualified, key=lambda x: x["rto_rate"]) if qualified else None
    worst_courier = max(qualified, key=lambda x: x["rto_rate"]) if qualified else None
    fastest_courier = min(
        [c for c in qualified if c["avg_delivery_time"] > 0],
        key=lambda x: x["avg_delivery_time"]
    ) if [c for c in qualified if c["avg_delivery_time"] > 0] else None

    # ── Average delivery time across all ──
    avg_time_stmt = select(
        func.round(cast(
            func.avg(CourierPerformanceMetrics.avg_delivery_time).filter(
                CourierPerformanceMetrics.avg_delivery_time > 0
            ), Numeric
        ), 1)
    )
    avg_time_stmt = _apply_filters(avg_time_stmt)
    avg_time_result = await db.execute(avg_time_stmt)
    overall_avg_time = float(avg_time_result.scalar() or 0)

    data = {
        "summary": {
            **summary,
            "avg_delivery_time": overall_avg_time,
        },
        "couriers": couriers,
        "best_courier": best_courier,
        "worst_courier": worst_courier,
        "fastest_courier": fastest_courier,
    }

    return success_response(data=data, path=str(request.url.path))
