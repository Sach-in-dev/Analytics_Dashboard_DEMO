"""Delivery Time router — exposes delivery performance metrics.
Supports date filtering via start_date/end_date query params.
Reads only from analytics DB (delivery_time_metrics table).
"""

from datetime import date, datetime
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import DeliveryTimeMetrics

router = APIRouter(
    prefix="/delivery-time",
    tags=["Delivery Time"],
    dependencies=[Depends(require_permission("delivery_time"))],
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
async def get_delivery_time(
    request: Request,
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get delivery time summary + trend data, with optional date filtering."""
    start = _parse_date(start_date)
    end = _parse_date(end_date)

    # ── Summary: weighted averages across date range ──
    summary_stmt = select(
        func.coalesce(func.sum(DeliveryTimeMetrics.total_orders), 0).label("total_orders"),
        func.coalesce(func.sum(DeliveryTimeMetrics.delayed_orders), 0).label("delayed_orders"),
    )
    if start:
        summary_stmt = summary_stmt.where(DeliveryTimeMetrics.date >= start)
    if end:
        summary_stmt = summary_stmt.where(DeliveryTimeMetrics.date <= end)

    result = await db.execute(summary_stmt)
    row = result.one()
    total_orders = int(row[0])
    delayed_orders = int(row[1])

    # Weighted averages for delivery times (weight by daily order count)
    wavg_stmt = select(
        func.sum(DeliveryTimeMetrics.avg_delivery_time * DeliveryTimeMetrics.total_orders).label("wavg_sum"),
        func.sum(DeliveryTimeMetrics.median_delivery_time * DeliveryTimeMetrics.total_orders).label("wmed_sum"),
        func.sum(DeliveryTimeMetrics.p90_delivery_time * DeliveryTimeMetrics.total_orders).label("wp90_sum"),
        func.sum(DeliveryTimeMetrics.total_orders).label("weight"),
    )
    if start:
        wavg_stmt = wavg_stmt.where(DeliveryTimeMetrics.date >= start)
    if end:
        wavg_stmt = wavg_stmt.where(DeliveryTimeMetrics.date <= end)

    wavg_result = await db.execute(wavg_stmt)
    wavg_row = wavg_result.one()

    weight = float(wavg_row[3] or 0)
    avg_delivery_time = round(float(wavg_row[0] or 0) / weight, 2) if weight > 0 else 0.0
    median_delivery_time = round(float(wavg_row[1] or 0) / weight, 2) if weight > 0 else 0.0
    p90_delivery_time = round(float(wavg_row[2] or 0) / weight, 2) if weight > 0 else 0.0

    summary = {
        "total_orders": total_orders,
        "avg_delivery_time": avg_delivery_time,
        "median_delivery_time": median_delivery_time,
        "p90_delivery_time": p90_delivery_time,
        "delayed_orders": delayed_orders,
    }

    import collections
    carrier_delays_agg = collections.defaultdict(int)
    state_delays_agg = collections.defaultdict(int)

    # ── Trend: daily breakdown for chart ──
    trend_stmt = (
        select(
            DeliveryTimeMetrics.date,
            DeliveryTimeMetrics.total_orders,
            DeliveryTimeMetrics.avg_delivery_time,
            DeliveryTimeMetrics.median_delivery_time,
            DeliveryTimeMetrics.p90_delivery_time,
            DeliveryTimeMetrics.delayed_orders,
            DeliveryTimeMetrics.delays_by_carrier,
            DeliveryTimeMetrics.delays_by_state,
        )
        .order_by(DeliveryTimeMetrics.date.asc())
    )
    if start:
        trend_stmt = trend_stmt.where(DeliveryTimeMetrics.date >= start)
    if end:
        trend_stmt = trend_stmt.where(DeliveryTimeMetrics.date <= end)

    trend_result = await db.execute(trend_stmt)
    trend_rows = trend_result.all()

    trend = [
        {
            "date": r[0].isoformat() if r[0] else None,
            "total_orders": r[1],
            "avg_delivery_time": r[2],
            "median_delivery_time": r[3],
            "p90_delivery_time": r[4],
            "delayed_orders": r[5],
        }
        for r in trend_rows
    ]

    for r in trend_rows:
        if r[6]:
            for k, v in r[6].items(): carrier_delays_agg[k] += v
        if r[7]:
            for k, v in r[7].items(): state_delays_agg[k] += v

    top_carriers = [{"name": k, "count": v} for k, v in sorted(carrier_delays_agg.items(), key=lambda item: item[1], reverse=True)[:5]]
    top_states = [{"name": k, "count": v} for k, v in sorted(state_delays_agg.items(), key=lambda item: item[1], reverse=True)[:10]]

    summary["delays_by_carrier"] = top_carriers
    summary["delays_by_state"] = top_states

    data = {
        "summary": summary,
        "trend": trend,
    }

    return success_response(data=data, path=str(request.url.path))
