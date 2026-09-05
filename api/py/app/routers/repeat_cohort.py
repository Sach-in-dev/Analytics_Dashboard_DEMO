"""Repeat Purchase Cohorts router — exposes cohort-based retention analytics.
Queries only the analytics DB. Supports cohort month range filtering.
"""

from datetime import datetime
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, distinct
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import CustomerRepeatCohort

router = APIRouter(
    prefix="/repeat-cohorts",
    tags=["Repeat Purchase Cohorts"],
    dependencies=[Depends(require_permission("repeat_cohorts"))],
)


@router.get("")
async def get_repeat_cohorts(
    request: Request,
    start_month: str | None = Query(None, description="Filter cohorts from YYYY-MM"),
    end_month: str | None = Query(None, description="Filter cohorts up to YYYY-MM"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get cohort retention matrix with summary stats.

    Returns cohort data grouped by month, with retention rates
    for each subsequent month index.
    """
    # ── Fetch records with optional cohort range filter ──
    stmt = select(CustomerRepeatCohort).order_by(
        CustomerRepeatCohort.cohort_month.asc(),
        CustomerRepeatCohort.cohort_index.asc(),
    )
    if start_month:
        stmt = stmt.where(CustomerRepeatCohort.cohort_month >= start_month)
    if end_month:
        stmt = stmt.where(CustomerRepeatCohort.cohort_month <= end_month)

    result = await db.execute(stmt)
    records = result.scalars().all()

    if not records:
        return success_response(
            data={
                "cohorts": [],
                "summary": {
                    "total_cohorts": 0,
                    "avg_retention_month_1": 0.0,
                    "best_cohort": None,
                    "worst_cohort": None,
                },
                "last_updated": None,
            },
            path=str(request.url.path),
        )

    # ── Group records by cohort_month ──
    cohort_map: dict[str, dict] = {}
    for r in records:
        if r.cohort_month not in cohort_map:
            cohort_map[r.cohort_month] = {
                "cohort_month": r.cohort_month,
                "cohort_size": r.cohort_size,
                "data": [],
            }
        cohort_map[r.cohort_month]["data"].append({
            "index": r.cohort_index,
            "users": r.repeat_customers,
            "rate": r.retention_rate,
        })

    cohorts = list(cohort_map.values())

    # ── Compute summary stats ──
    month_1_rates = []
    best_cohort = None
    worst_cohort = None

    for c in cohorts:
        # Find month-1 retention (index == 1)
        m1 = next((d for d in c["data"] if d["index"] == 1), None)
        if m1:
            rate = m1["rate"]
            month_1_rates.append(rate)
            entry = {
                "month": c["cohort_month"],
                "size": c["cohort_size"],
                "month_1_rate": rate,
            }
            if best_cohort is None or rate > best_cohort["month_1_rate"]:
                best_cohort = entry
            if worst_cohort is None or rate < worst_cohort["month_1_rate"]:
                worst_cohort = entry

    avg_retention_month_1 = (
        round(sum(month_1_rates) / len(month_1_rates), 2)
        if month_1_rates
        else 0.0
    )

    # Find last_updated from the most recent record
    last_updated = max(
        (r.updatedAt for r in records if r.updatedAt),
        default=None,
    )

    data = {
        "cohorts": cohorts,
        "summary": {
            "total_cohorts": len(cohorts),
            "avg_retention_month_1": avg_retention_month_1,
            "best_cohort": best_cohort,
            "worst_cohort": worst_cohort,
        },
        "last_updated": last_updated.isoformat() if last_updated else None,
    }

    return success_response(data=data, path=str(request.url.path))


@router.post("/sync")
async def trigger_repeat_cohort_sync(request: Request):
    """Manually trigger repeat cohort processing."""
    import logging
    from app.database import ProdSessionLocal, AnalyticsSessionLocal
    from app.actions.repeat_cohort_action import process_repeat_cohorts

    logger = logging.getLogger(__name__)

    if ProdSessionLocal is None:
        return success_response(
            data=None,
            message="PROD_DB not configured",
            path=str(request.url.path),
            status_code=503,
        )

    try:
        async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
            await process_repeat_cohorts(prod_db, analytics_db)
        return success_response(
            data={"status": "completed"},
            message="Repeat cohort sync completed",
            path=str(request.url.path),
        )
    except Exception as e:
        logger.error(f"Manual repeat cohort sync failed: {e}", exc_info=True)
        from app.schemas.responses import error_response
        return error_response(
            message=f"Repeat cohort sync failed: {str(e)}",
            path=str(request.url.path),
        )
