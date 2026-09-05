"""Return Reason Codes router — exposes return/refund reason analytics.
Supports date filtering. Reads only from analytics DB.
"""

from datetime import date, datetime
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import ReturnReasonMetrics

router = APIRouter(
    prefix="/return-reasons",
    tags=["Return Reasons"],
    dependencies=[Depends(require_permission("return_reasons"))],
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
async def get_return_reasons(
    request: Request,
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get return reason summary + per-reason breakdown."""
    start = _parse_date(start_date)
    end = _parse_date(end_date)

    # ── Base filter builder ──
    def _apply_filters(stmt):
        if start:
            stmt = stmt.where(ReturnReasonMetrics.date >= start)
        if end:
            stmt = stmt.where(ReturnReasonMetrics.date <= end)
        return stmt

    # ── Summary: aggregated totals ──
    summary_stmt = select(
        func.coalesce(func.sum(ReturnReasonMetrics.total_cases), 0).label("total_returns"),
        func.coalesce(func.sum(ReturnReasonMetrics.total_revenue_loss), 0).label("total_revenue_loss"),
    )
    summary_stmt = _apply_filters(summary_stmt)
    result = await db.execute(summary_stmt)
    row = result.one()

    total_returns = int(row[0])
    total_revenue_loss = float(row[1])

    # ── Per-reason breakdown ──
    reason_stmt = (
        select(
            ReturnReasonMetrics.reason_code,
            ReturnReasonMetrics.reason_text,
            func.sum(ReturnReasonMetrics.total_cases).label("total_cases"),
            func.sum(ReturnReasonMetrics.total_revenue_loss).label("total_revenue_loss"),
        )
        .group_by(ReturnReasonMetrics.reason_code, ReturnReasonMetrics.reason_text)
        .having(func.sum(ReturnReasonMetrics.total_cases) > 0)
        .order_by(desc("total_revenue_loss"))
    )
    reason_stmt = _apply_filters(reason_stmt)
    reason_result = await db.execute(reason_stmt)
    reason_rows = reason_result.all()

    reasons = []
    for r in reason_rows:
        cases = int(r[2])
        loss = float(r[3])
        pct = round((cases / total_returns) * 100, 2) if total_returns > 0 else 0.0
        reasons.append({
            "reason_code": r[0],
            "reason_text": r[1],
            "total_cases": cases,
            "total_revenue_loss": round(loss, 2),
            "percentage": pct,
        })

    # ── Identify top reason / highest loss ──
    top_reason = reasons[0] if reasons else None

    # Top by cases (may differ from top by revenue loss)
    top_by_cases = max(reasons, key=lambda x: x["total_cases"]) if reasons else None

    # Highest revenue loss (already sorted by loss desc)
    highest_loss = reasons[0] if reasons else None

    summary = {
        "total_returns": total_returns,
        "total_revenue_loss": round(total_revenue_loss, 2),
        "top_reason": top_by_cases["reason_text"] if top_by_cases else "N/A",
        "top_reason_percentage": top_by_cases["percentage"] if top_by_cases else 0,
        "highest_loss_reason": highest_loss["reason_text"] if highest_loss else "N/A",
        "highest_loss_amount": highest_loss["total_revenue_loss"] if highest_loss else 0,
    }

    data = {
        "summary": summary,
        "data": reasons,
    }

    return success_response(data=data, path=str(request.url.path))
