"""Signup Cohorts router — reads from signup_cohort_metrics in analytics DB."""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import SignupCohortMetrics

router = APIRouter(
    prefix="/signup-cohorts",
    tags=["SignupCohorts"],
    dependencies=[Depends(require_permission("signup_cohorts"))],
)


@router.get("")
async def get_signup_cohorts(
    request: Request,
    start_month: str = Query(None, description="Filter from YYYY-MM"),
    end_month: str = Query(None, description="Filter to YYYY-MM"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Signup cohorts: registration-month based retention matrix."""
    stmt = select(SignupCohortMetrics).order_by(
        SignupCohortMetrics.signup_cohort.asc(),
        SignupCohortMetrics.cohort_index.asc(),
    )
    if start_month:
        stmt = stmt.where(SignupCohortMetrics.signup_cohort >= start_month)
    if end_month:
        stmt = stmt.where(SignupCohortMetrics.signup_cohort <= end_month)

    result = await db.execute(stmt)
    rows = result.scalars().all()

    # Build cohort matrix
    from collections import defaultdict
    cohort_map = defaultdict(lambda: {"cohort_size": 0, "periods": {}})
    for r in rows:
        cohort_map[r.signup_cohort]["cohort_size"] = r.cohort_size
        cohort_map[r.signup_cohort]["periods"][r.cohort_index] = {
            "cohort_index": r.cohort_index,
            "active_customers": r.active_customers,
            "retention_pct": float(r.retention_pct),
            "orders": r.orders,
            "revenue": float(r.revenue),
        }

    cohort_list = [
        {
            "signup_cohort": cohort_month,
            "cohort_size": data["cohort_size"],
            "periods": [data["periods"][i] for i in sorted(data["periods"].keys())],
        }
        for cohort_month, data in sorted(cohort_map.items())
    ]

    # Avg retention curve by cohort_index
    from collections import defaultdict as dd
    index_sums = dd(list)
    for entry in cohort_list:
        for p in entry["periods"]:
            index_sums[p["cohort_index"]].append(p["retention_pct"])

    retention_curve = [
        {
            "cohort_index": idx,
            "avg_retention_pct": round(sum(vals) / len(vals), 1),
        }
        for idx, vals in sorted(index_sums.items())
    ]

    m1_rates = [
        entry["periods"][0]["retention_pct"]
        for entry in cohort_list
        if any(p["cohort_index"] == 1 for p in entry["periods"])
    ]
    avg_m1 = round(sum(m1_rates) / len(m1_rates), 1) if m1_rates else 0.0
    best = max(cohort_list, key=lambda c: next((p["retention_pct"] for p in c["periods"] if p["cohort_index"] == 1), 0), default=None)

    return success_response(
        data={
            "cohorts": cohort_list,
            "retention_curve": retention_curve,
            "summary": {
                "total_cohorts": len(cohort_list),
                "avg_month1_retention": avg_m1,
                "best_cohort": best["signup_cohort"] if best else None,
            },
        },
        path=str(request.url.path),
    )
