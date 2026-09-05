"""Payment Failure router — exposes payment failure metrics.
Supports date filtering via start_date/end_date query params.
Reads only from analytics DB (payment_failure_metrics table).
"""

from datetime import date, datetime
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import (
    PaymentFailureMetrics,
    PaymentFailureByMethod,
    PaymentFailureByReason,
)

router = APIRouter(
    prefix="/payment-failure",
    tags=["Payment Failure"],
    dependencies=[Depends(require_permission("payment_failure"))],
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
async def get_payment_failure(
    request: Request,
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get Payment Failure summary + trend data, with optional date filtering."""
    start = _parse_date(start_date)
    end = _parse_date(end_date)

    # ── Summary: aggregated totals across date range ──
    summary_stmt = select(
        func.coalesce(func.sum(PaymentFailureMetrics.total_attempts), 0).label("total_attempts"),
        func.coalesce(func.sum(PaymentFailureMetrics.failed_payments), 0).label("failed_payments"),
        func.coalesce(func.sum(PaymentFailureMetrics.lost_gmv), 0.0).label("lost_gmv"),
        func.coalesce(func.sum(PaymentFailureMetrics.affected_customers), 0).label("affected_customers"),
        func.coalesce(func.sum(PaymentFailureMetrics.recovered_orders), 0).label("recovered_orders"),
        func.coalesce(func.sum(PaymentFailureMetrics.recovered_gmv), 0.0).label("recovered_gmv"),
    )
    if start:
        summary_stmt = summary_stmt.where(PaymentFailureMetrics.date >= start)
    if end:
        summary_stmt = summary_stmt.where(PaymentFailureMetrics.date <= end)

    result = await db.execute(summary_stmt)
    row = result.one()

    total_attempts = int(row[0])
    failed_payments = int(row[1])
    lost_gmv = float(row[2])
    affected_customers = int(row[3])
    recovered_orders = int(row[4])
    recovered_gmv = float(row[5])
    failure_rate = round((failed_payments / total_attempts) * 100, 2) if total_attempts > 0 else 0.0
    recovery_rate = round((recovered_orders / failed_payments) * 100, 2) if failed_payments > 0 else 0.0

    summary = {
        "total_attempts": total_attempts,
        "failed_payments": failed_payments,
        "failure_rate": failure_rate,
        "lost_gmv": lost_gmv,
        "affected_customers": affected_customers,
        "recovered_orders": recovered_orders,
        "recovered_gmv": recovered_gmv,
        "recovery_rate": recovery_rate,
    }

    # ── Trend: daily breakdown for chart ──
    trend_stmt = (
        select(
            PaymentFailureMetrics.date,
            PaymentFailureMetrics.total_attempts,
            PaymentFailureMetrics.failed_payments,
            PaymentFailureMetrics.failure_rate,
            PaymentFailureMetrics.lost_gmv,
            PaymentFailureMetrics.affected_customers,
            PaymentFailureMetrics.recovered_orders,
            PaymentFailureMetrics.recovered_gmv,
        )
        .order_by(PaymentFailureMetrics.date.asc())
    )
    if start:
        trend_stmt = trend_stmt.where(PaymentFailureMetrics.date >= start)
    if end:
        trend_stmt = trend_stmt.where(PaymentFailureMetrics.date <= end)

    trend_result = await db.execute(trend_stmt)
    trend_rows = trend_result.all()

    trend = [
        {
            "date": r[0].isoformat() if r[0] else None,
            "total_attempts": r[1],
            "failed_payments": r[2],
            "failure_rate": r[3],
            "lost_gmv": r[4],
            "affected_customers": r[5],
            "recovered_orders": r[6] or 0,
            "recovered_gmv": r[7] or 0.0,
        }
        for r in trend_rows
    ]

    # ── Breakdown: by payment method (aggregated across date range) ──
    method_stmt = (
        select(
            PaymentFailureByMethod.provider,
            PaymentFailureByMethod.payment_mode,
            func.coalesce(func.sum(PaymentFailureByMethod.attempts), 0).label("attempts"),
            func.coalesce(func.sum(PaymentFailureByMethod.failed), 0).label("failed"),
            func.coalesce(func.sum(PaymentFailureByMethod.lost_gmv), 0.0).label("lost_gmv"),
        )
        .group_by(PaymentFailureByMethod.provider, PaymentFailureByMethod.payment_mode)
    )
    if start:
        method_stmt = method_stmt.where(PaymentFailureByMethod.date >= start)
    if end:
        method_stmt = method_stmt.where(PaymentFailureByMethod.date <= end)

    method_rows = (await db.execute(method_stmt)).all()
    by_method = [
        {
            "provider": r[0],
            "payment_mode": r[1],
            "label": f"{r[0]} · {r[1]}",
            "attempts": int(r[2]),
            "failed": int(r[3]),
            "lost_gmv": float(r[4]),
            "failure_rate": round((int(r[3]) / int(r[2])) * 100, 2) if int(r[2]) > 0 else 0.0,
        }
        for r in method_rows
    ]
    by_method.sort(key=lambda x: x["failed"], reverse=True)

    # ── Breakdown: by failure reason (error code) ──
    reason_stmt = (
        select(
            PaymentFailureByReason.error_code,
            func.coalesce(func.sum(PaymentFailureByReason.failed), 0).label("failed"),
            func.coalesce(func.sum(PaymentFailureByReason.lost_gmv), 0.0).label("lost_gmv"),
            func.coalesce(func.sum(PaymentFailureByReason.affected_customers), 0).label("affected_customers"),
        )
        .group_by(PaymentFailureByReason.error_code)
    )
    if start:
        reason_stmt = reason_stmt.where(PaymentFailureByReason.date >= start)
    if end:
        reason_stmt = reason_stmt.where(PaymentFailureByReason.date <= end)

    reason_rows = (await db.execute(reason_stmt)).all()
    total_failed_for_share = sum(int(r[1]) for r in reason_rows) or 1
    by_reason = [
        {
            "error_code": r[0],
            "failed": int(r[1]),
            "lost_gmv": float(r[2]),
            "affected_customers": int(r[3]),
            "share_pct": round((int(r[1]) / total_failed_for_share) * 100, 2),
        }
        for r in reason_rows
    ]
    by_reason.sort(key=lambda x: x["failed"], reverse=True)

    data = {
        "summary": summary,
        "trend": trend,
        "by_method": by_method,
        "by_reason": by_reason,
    }

    return success_response(data=data, path=str(request.url.path))
