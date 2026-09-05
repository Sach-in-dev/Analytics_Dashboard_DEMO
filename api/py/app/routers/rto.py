"""RTO Rate router — exposes RTO (Return to Origin) metrics.
Supports date filtering via start_date/end_date query params.
Reads only from analytics DB (rto_metrics table).
"""

from datetime import date, datetime
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import RtoMetrics

router = APIRouter(
    prefix="/rto-rate",
    tags=["RTO Rate"],
    dependencies=[Depends(require_permission("rto_metrics"))],
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
async def get_rto_rate(
    request: Request,
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get RTO Rate summary + trend data, with optional date filtering.

    Without filters, returns all available data.
    With filters, restricts to the given date range.
    """
    # Build base filter
    start = _parse_date(start_date)
    end = _parse_date(end_date)

    # ── Summary: aggregated totals across date range ──
    summary_stmt = select(
        func.coalesce(func.sum(RtoMetrics.total_orders), 0).label("total_orders"),
        func.coalesce(func.sum(RtoMetrics.rto_orders), 0).label("rto_orders"),
        func.coalesce(func.sum(RtoMetrics.rto_revenue_loss), 0.0).label("rto_revenue_loss"),
    )
    if start:
        summary_stmt = summary_stmt.where(RtoMetrics.date >= start)
    if end:
        summary_stmt = summary_stmt.where(RtoMetrics.date <= end)

    result = await db.execute(summary_stmt)
    row = result.one()

    total_orders = int(row[0])
    rto_orders = int(row[1])
    rto_revenue_loss = float(row[2])
    rto_rate = round((rto_orders / total_orders) * 100, 2) if total_orders > 0 else 0.0

    summary = {
        "total_orders": total_orders,
        "rto_orders": rto_orders,
        "rto_rate": rto_rate,
        "rto_revenue_loss": rto_revenue_loss,
    }

    # ── Trend: daily breakdown for chart ──
    trend_stmt = (
        select(
            RtoMetrics.date,
            RtoMetrics.total_orders,
            RtoMetrics.rto_orders,
            RtoMetrics.rto_rate,
            RtoMetrics.rto_revenue_loss,
        )
        .order_by(RtoMetrics.date.asc())
    )
    if start:
        trend_stmt = trend_stmt.where(RtoMetrics.date >= start)
    if end:
        trend_stmt = trend_stmt.where(RtoMetrics.date <= end)

    trend_result = await db.execute(trend_stmt)
    trend_rows = trend_result.all()

    trend = [
        {
            "date": r[0].isoformat() if r[0] else None,
            "total_orders": r[1],
            "rto_orders": r[2],
            "rto_rate": r[3],
            "rto_revenue_loss": r[4],
        }
        for r in trend_rows
    ]

    data = {
        "summary": summary,
        "trend": trend,
    }

    return success_response(data=data, path=str(request.url.path))
