"""Marketing Cost per Order router — exposes daily marketing cost per order analytics.
Supports date filtering. Reads only from analytics DB.
"""

from datetime import date, datetime
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.database import get_analytics_db
from app.schemas.responses import success_response, error_response
from app.dependencies import require_permission
from app.models.analytics import MarketingCostPerOrder

router = APIRouter(
    prefix="/marketing-cost-per-order",
    tags=["Marketing Cost per Order"],
    dependencies=[Depends(require_permission("marketing_cost"))],
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
async def get_marketing_cost_per_order(
    request: Request,
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get marketing cost per order summary + daily trend."""
    start = _parse_date(start_date)
    end = _parse_date(end_date)

    # ── Base filter builder ──
    def _apply_filters(stmt):
        if start:
            stmt = stmt.where(MarketingCostPerOrder.date >= start)
        if end:
            stmt = stmt.where(MarketingCostPerOrder.date <= end)
        return stmt

    # ── Summary: aggregated totals ──
    summary_stmt = select(
        func.coalesce(func.sum(MarketingCostPerOrder.total_spend), 0).label("total_spend"),
        func.coalesce(func.sum(MarketingCostPerOrder.total_orders), 0).label("total_orders"),
        func.count(MarketingCostPerOrder.id).label("total_days"),
    )
    summary_stmt = _apply_filters(summary_stmt)
    result = await db.execute(summary_stmt)
    row = result.one()

    total_spend = float(row[0])
    total_orders = int(row[1])
    total_days = int(row[2])

    # Compute overall cost per order
    cost_per_order = round(total_spend / total_orders, 2) if total_orders > 0 else 0.0

    # ── Best/Worst day ──
    best_day_stmt = (
        select(
            MarketingCostPerOrder.date,
            MarketingCostPerOrder.cost_per_order,
        )
        .where(MarketingCostPerOrder.cost_per_order > 0)
        .order_by(MarketingCostPerOrder.cost_per_order.asc())
        .limit(1)
    )
    best_day_stmt = _apply_filters(best_day_stmt)
    best_result = await db.execute(best_day_stmt)
    best_row = best_result.first()

    worst_day_stmt = (
        select(
            MarketingCostPerOrder.date,
            MarketingCostPerOrder.cost_per_order,
        )
        .where(MarketingCostPerOrder.cost_per_order > 0)
        .order_by(MarketingCostPerOrder.cost_per_order.desc())
        .limit(1)
    )
    worst_day_stmt = _apply_filters(worst_day_stmt)
    worst_result = await db.execute(worst_day_stmt)
    worst_row = worst_result.first()

    # ── Daily trend data ──
    trend_stmt = (
        select(
            MarketingCostPerOrder.date,
            MarketingCostPerOrder.total_spend,
            MarketingCostPerOrder.total_orders,
            MarketingCostPerOrder.cost_per_order,
        )
        .order_by(MarketingCostPerOrder.date)
    )
    trend_stmt = _apply_filters(trend_stmt)
    trend_result = await db.execute(trend_stmt)
    trend_rows = trend_result.all()

    trend = []
    for t in trend_rows:
        trend.append({
            "date": t[0].isoformat(),
            "total_spend": round(float(t[1]), 2),
            "total_orders": int(t[2]),
            "cost_per_order": round(float(t[3]), 2),
        })

    summary = {
        "total_spend": round(total_spend, 2),
        "total_orders": total_orders,
        "cost_per_order": cost_per_order,
        "total_days": total_days,
        "best_day": {
            "date": best_row[0].isoformat() if best_row else None,
            "cost_per_order": round(float(best_row[1]), 2) if best_row else 0,
        },
        "worst_day": {
            "date": worst_row[0].isoformat() if worst_row else None,
            "cost_per_order": round(float(worst_row[1]), 2) if worst_row else 0,
        },
    }

    data = {
        "summary": summary,
        "trend": trend,
    }

    return success_response(data=data, path=str(request.url.path))
