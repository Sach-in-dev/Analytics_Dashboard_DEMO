"""Customer Lifetime Cohorts router — exposes revenue-based cohort analytics.
Queries only the analytics DB. Supports cohort month range filtering.
"""

from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import CustomerLifetimeCohort

router = APIRouter(
    prefix="/lifetime-cohorts",
    tags=["Customer Lifetime Cohorts"],
    dependencies=[Depends(require_permission("lifetime_cohorts"))],
)


@router.get("")
async def get_lifetime_cohorts(
    request: Request,
    start_month: str | None = Query(None, description="Filter cohorts from YYYY-MM"),
    end_month: str | None = Query(None, description="Filter cohorts up to YYYY-MM"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get cohort-based lifetime value matrix with summary stats.

    Returns cohort data grouped by month, with revenue, cumulative revenue,
    and average LTV for each subsequent month index.
    """
    # ── Fetch records with optional cohort range filter ──
    stmt = select(CustomerLifetimeCohort).order_by(
        CustomerLifetimeCohort.cohort_month.asc(),
        CustomerLifetimeCohort.cohort_index.asc(),
    )
    if start_month:
        stmt = stmt.where(CustomerLifetimeCohort.cohort_month >= start_month)
    if end_month:
        stmt = stmt.where(CustomerLifetimeCohort.cohort_month <= end_month)

    result = await db.execute(stmt)
    records = result.scalars().all()

    if not records:
        return success_response(
            data={
                "cohorts": [],
                "summary": {
                    "total_cohorts": 0,
                    "total_revenue": 0.0,
                    "avg_ltv": 0.0,
                    "best_cohort": None,
                    "fastest_growing": None,
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
            "revenue": r.total_revenue,
            "cumulative_revenue": r.cumulative_revenue,
            "avg_ltv": r.avg_ltv,
        })

    cohorts = list(cohort_map.values())

    # ── Compute summary stats ──
    total_revenue = sum(
        dp["revenue"]
        for c in cohorts
        for dp in c["data"]
    )

    # Best cohort = highest avg_ltv in latest index
    best_cohort = None
    fastest_growing = None

    for c in cohorts:
        if not c["data"]:
            continue

        # Find max cumulative LTV (last index)
        last_dp = c["data"][-1]
        entry = {
            "month": c["cohort_month"],
            "size": c["cohort_size"],
            "avg_ltv": last_dp["avg_ltv"],
            "cumulative_revenue": last_dp["cumulative_revenue"],
        }
        if best_cohort is None or last_dp["avg_ltv"] > best_cohort["avg_ltv"]:
            best_cohort = entry

        # Fastest growing = highest month-1 revenue relative to month-0
        if len(c["data"]) >= 2:
            m0_rev = c["data"][0]["revenue"]
            m1_rev = c["data"][1]["revenue"]
            if m0_rev > 0:
                growth = round((m1_rev / m0_rev) * 100, 2)
                growth_entry = {
                    "month": c["cohort_month"],
                    "size": c["cohort_size"],
                    "m0_revenue": m0_rev,
                    "m1_revenue": m1_rev,
                    "growth_pct": growth,
                }
                if fastest_growing is None or growth > fastest_growing["growth_pct"]:
                    fastest_growing = growth_entry

    # Overall average LTV across all cohorts
    all_sizes = [c["cohort_size"] for c in cohorts]
    total_size = sum(all_sizes)
    avg_ltv = round(total_revenue / total_size, 2) if total_size > 0 else 0.0

    last_updated = max(
        (r.updatedAt for r in records if r.updatedAt),
        default=None,
    )

    data = {
        "cohorts": cohorts,
        "summary": {
            "total_cohorts": len(cohorts),
            "total_revenue": round(total_revenue, 2),
            "avg_ltv": avg_ltv,
            "best_cohort": best_cohort,
            "fastest_growing": fastest_growing,
        },
        "last_updated": last_updated.isoformat() if last_updated else None,
    }

    return success_response(data=data, path=str(request.url.path))


@router.post("/sync")
async def trigger_lifetime_cohort_sync(request: Request):
    """Manually trigger lifetime cohort processing."""
    import logging
    from app.database import ProdSessionLocal, AnalyticsSessionLocal
    from app.actions.lifetime_cohort_action import process_lifetime_cohorts

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
            await process_lifetime_cohorts(prod_db, analytics_db)
        return success_response(
            data={"status": "completed"},
            message="Lifetime cohort sync completed",
            path=str(request.url.path),
        )
    except Exception as e:
        logger.error(f"Manual lifetime cohort sync failed: {e}", exc_info=True)
        from app.schemas.responses import error_response
        return error_response(
            message=f"Lifetime cohort sync failed: {str(e)}",
            path=str(request.url.path),
        )
