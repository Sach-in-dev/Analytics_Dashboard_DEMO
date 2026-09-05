"""Return Rate router — exposes post-delivery return metrics.
Supports date filtering via start_date/end_date query params.
Reads only from analytics DB (return_rate_metrics table).
"""

from datetime import date, datetime
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import ReturnRateMetrics

router = APIRouter(
    prefix="/return-rate",
    tags=["Return Rate"],
    dependencies=[Depends(require_permission("return_rate"))],
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
async def get_return_rate(
    request: Request,
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get Return Rate summary + trend data, with optional date filtering.

    Without filters, returns all available data.
    With filters, restricts to the given date range.
    """
    start = _parse_date(start_date)
    end = _parse_date(end_date)

    # ── Summary: aggregated totals across date range ──
    summary_stmt = select(
        func.coalesce(func.sum(ReturnRateMetrics.total_delivered_orders), 0).label("total_delivered_orders"),
        func.coalesce(func.sum(ReturnRateMetrics.returned_orders), 0).label("returned_orders"),
        func.coalesce(func.sum(ReturnRateMetrics.return_revenue_loss), 0.0).label("return_revenue_loss"),
    )
    if start:
        summary_stmt = summary_stmt.where(ReturnRateMetrics.date >= start)
    if end:
        summary_stmt = summary_stmt.where(ReturnRateMetrics.date <= end)

    result = await db.execute(summary_stmt)
    row = result.one()

    total_delivered = int(row[0])
    returned_orders = int(row[1])
    return_revenue_loss = float(row[2])
    return_rate = round((returned_orders / total_delivered) * 100, 2) if total_delivered > 0 else 0.0

    summary = {
        "total_delivered_orders": total_delivered,
        "returned_orders": returned_orders,
        "return_rate": return_rate,
        "return_revenue_loss": return_revenue_loss,
    }

    # ── Trend: daily breakdown for chart ──
    trend_stmt = (
        select(
            ReturnRateMetrics.date,
            ReturnRateMetrics.total_delivered_orders,
            ReturnRateMetrics.returned_orders,
            ReturnRateMetrics.return_rate,
            ReturnRateMetrics.return_revenue_loss,
        )
        .order_by(ReturnRateMetrics.date.asc())
    )
    if start:
        trend_stmt = trend_stmt.where(ReturnRateMetrics.date >= start)
    if end:
        trend_stmt = trend_stmt.where(ReturnRateMetrics.date <= end)

    trend_result = await db.execute(trend_stmt)
    trend_rows = trend_result.all()

    trend = [
        {
            "date": r[0].isoformat() if r[0] else None,
            "total_delivered_orders": r[1],
            "returned_orders": r[2],
            "return_rate": r[3],
            "return_revenue_loss": r[4],
        }
        for r in trend_rows
    ]

    data = {
        "summary": summary,
        "trend": trend,
    }

    return success_response(data=data, path=str(request.url.path))
