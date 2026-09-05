"""Failure Zones router — exposes geographical failure/RTO metrics.
Supports date filtering and optional state filter.
Reads only from analytics DB (failure_zones_metrics table).
"""

from datetime import date, datetime
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import FailureZonesMetrics

router = APIRouter(
    prefix="/failure-zones",
    tags=["Failure Zones"],
    dependencies=[Depends(require_permission("failure_zones"))],
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
async def get_failure_zones(
    request: Request,
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD)"),
    state: str | None = Query(None, description="Optional state filter"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get failure zone summary + zone breakdown, with optional date/state filtering."""
    start = _parse_date(start_date)
    end = _parse_date(end_date)

    # ── Base filter builder ──
    def _apply_filters(stmt):
        if start:
            stmt = stmt.where(FailureZonesMetrics.date >= start)
        if end:
            stmt = stmt.where(FailureZonesMetrics.date <= end)
        if state:
            stmt = stmt.where(func.lower(FailureZonesMetrics.state) == state.lower().strip())
        return stmt

    # ── Summary: aggregated totals across date range ──
    summary_stmt = select(
        func.coalesce(func.sum(FailureZonesMetrics.total_orders), 0).label("total_orders"),
        func.coalesce(func.sum(FailureZonesMetrics.failed_orders), 0).label("failed_orders"),
        func.coalesce(func.sum(FailureZonesMetrics.rto_orders), 0).label("rto_orders"),
    )
    summary_stmt = _apply_filters(summary_stmt)

    result = await db.execute(summary_stmt)
    row = result.one()

    total_orders = int(row[0])
    failed_orders = int(row[1])
    rto_orders = int(row[2])
    avg_failure_rate = round((failed_orders / total_orders) * 100, 2) if total_orders > 0 else 0.0
    avg_rto_rate = round((rto_orders / total_orders) * 100, 2) if total_orders > 0 else 0.0

    summary = {
        "total_orders": total_orders,
        "failed_orders": failed_orders,
        "rto_orders": rto_orders,
        "avg_failure_rate": avg_failure_rate,
        "avg_rto_rate": avg_rto_rate,
    }

    # ── Zone breakdown: aggregated by city + state ──
    zone_stmt = (
        select(
            FailureZonesMetrics.city,
            FailureZonesMetrics.state,
            func.sum(FailureZonesMetrics.total_orders).label("total_orders"),
            func.sum(FailureZonesMetrics.failed_orders).label("failed_orders"),
            func.sum(FailureZonesMetrics.rto_orders).label("rto_orders"),
        )
        .group_by(FailureZonesMetrics.city, FailureZonesMetrics.state)
        .having(func.sum(FailureZonesMetrics.total_orders) > 0)
        .order_by(desc("failed_orders"))
    )
    zone_stmt = _apply_filters(zone_stmt)

    zone_result = await db.execute(zone_stmt)
    zone_rows = zone_result.all()

    zones = []
    for r in zone_rows:
        t = int(r[2])
        f = int(r[3])
        rto = int(r[4])
        zones.append({
            "city": r[0],
            "state": r[1],
            "total_orders": t,
            "failed_orders": f,
            "rto_orders": rto,
            "failure_rate": round((f / t) * 100, 2) if t > 0 else 0.0,
            "rto_rate": round((rto / t) * 100, 2) if t > 0 else 0.0,
        })

    # ── Top 10 failure cities ──
    top_failure_cities = sorted(
        [z for z in zones if z["total_orders"] >= 5],
        key=lambda x: x["failure_rate"],
        reverse=True,
    )[:10]

    # ── Top 10 RTO states (aggregate by state) ──
    state_agg: dict = {}
    for z in zones:
        s = z["state"]
        if s not in state_agg:
            state_agg[s] = {"state": s, "total_orders": 0, "rto_orders": 0}
        state_agg[s]["total_orders"] += z["total_orders"]
        state_agg[s]["rto_orders"] += z["rto_orders"]

    top_rto_states = []
    for s in state_agg.values():
        t = s["total_orders"]
        rto = s["rto_orders"]
        if t >= 5:
            top_rto_states.append({
                "state": s["state"],
                "total_orders": t,
                "rto_orders": rto,
                "rto_rate": round((rto / t) * 100, 2) if t > 0 else 0.0,
            })
    top_rto_states = sorted(top_rto_states, key=lambda x: x["rto_rate"], reverse=True)[:10]

    data = {
        "summary": summary,
        "zones": zones,
        "top_failure_cities": top_failure_cities,
        "top_rto_states": top_rto_states,
    }

    return success_response(data=data, path=str(request.url.path))
