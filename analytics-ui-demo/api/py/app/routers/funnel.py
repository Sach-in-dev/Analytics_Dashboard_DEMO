"""Funnel Metrics router — exposes Open/Click/Conversion rate analytics.
Queries only the analytics DB. Date range filters select which daily
snapshots to aggregate (SUM of daily counts).
"""

from datetime import date, datetime
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import CustomerFunnelMetrics

router = APIRouter(
    prefix="/funnel-metrics",
    tags=["Funnel Metrics"],
    dependencies=[Depends(require_permission("funnel_metrics"))],
)


def _parse_date(date_str: str | None) -> date | None:
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return None


def _safe_rate(numerator: int, denominator: int) -> float:
    if denominator == 0:
        return 0.0
    return round((numerator / denominator) * 100, 2)


@router.get("")
async def get_funnel_metrics(
    request: Request,
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get funnel metrics aggregated across the selected date range.

    KPI cards show SUMS of daily counts. Trend shows daily breakdown.
    """
    start = _parse_date(start_date)
    end = _parse_date(end_date)

    # ── Fetch daily records in range ──
    stmt = select(CustomerFunnelMetrics).order_by(CustomerFunnelMetrics.date.asc())
    if start:
        stmt = stmt.where(CustomerFunnelMetrics.date >= start)
    if end:
        stmt = stmt.where(CustomerFunnelMetrics.date <= end)

    result = await db.execute(stmt)
    records = result.scalars().all()

    if not records:
        return success_response(
            data={
                "totals": {"total_users": 0, "open_users": 0, "click_users": 0, "payment_failure_users": 0, "converted_users": 0},
                "rates": {"open_rate": 0.0, "click_rate": 0.0, "conversion_rate": 0.0, "payment_failure_rate": 0.0},
                "funnel_drop": {"open_to_click_drop": 0.0, "click_to_conversion_drop": 0.0},
                "trend": [],
            },
            path=str(request.url.path),
        )

    # ── Aggregate: SUM of daily counts across the range ──
    total_users = sum(r.total_users for r in records)
    open_users = sum(r.open_users for r in records)
    click_users = sum(r.click_users for r in records)
    payment_failure_users = sum(r.payment_failure_users for r in records)
    converted_users = sum(r.converted_users for r in records)

    # Compute rates from aggregated sums
    open_rate = _safe_rate(open_users, total_users)
    click_rate = _safe_rate(click_users, open_users)
    payment_failure_rate = _safe_rate(payment_failure_users, click_users)
    conversion_rate = _safe_rate(converted_users, click_users)

    open_to_click_drop = round(100 - click_rate, 2) if open_users > 0 else 0.0
    click_to_conversion_drop = round(100 - conversion_rate, 2) if click_users > 0 else 0.0

    # ── Trend (daily breakdown) ──
    trend = [
        {
            "date": r.date.isoformat(),
            "total_users": r.total_users,
            "open_users": r.open_users,
            "click_users": r.click_users,
            "payment_failure_users": r.payment_failure_users,
            "converted_users": r.converted_users,
            "open_rate": r.open_rate,
            "click_rate": r.click_rate,
            "conversion_rate": r.conversion_rate,
        }
        for r in records
    ]

    latest = records[-1]
    data = {
        "totals": {
            "total_users": total_users,
            "open_users": open_users,
            "click_users": click_users,
            "payment_failure_users": payment_failure_users,
            "converted_users": converted_users,
        },
        "rates": {
            "open_rate": open_rate,
            "click_rate": click_rate,
            "payment_failure_rate": payment_failure_rate,
            "conversion_rate": conversion_rate,
        },
        "funnel_drop": {
            "open_to_click_drop": open_to_click_drop,
            "click_to_conversion_drop": click_to_conversion_drop,
        },
        "trend": trend,
        "last_updated": latest.updatedAt.isoformat() if latest.updatedAt else None,
    }

    return success_response(data=data, path=str(request.url.path))


@router.post("/sync")
async def trigger_funnel_sync(request: Request):
    """Manually trigger funnel metrics processing."""
    import logging
    from app.database import ProdSessionLocal, AnalyticsSessionLocal
    from app.actions.funnel_action import process_funnel_metrics

    logger = logging.getLogger(__name__)

    if ProdSessionLocal is None:
        return success_response(data=None, message="PROD_DB not configured", path=str(request.url.path), status_code=503)

    try:
        async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
            await process_funnel_metrics(prod_db, analytics_db)
        return success_response(data={"status": "completed"}, message="Funnel metrics sync completed", path=str(request.url.path))
    except Exception as e:
        logger.error(f"Manual funnel sync failed: {e}", exc_info=True)
        from app.schemas.responses import error_response
        return error_response(message=f"Funnel sync failed: {str(e)}", path=str(request.url.path))
