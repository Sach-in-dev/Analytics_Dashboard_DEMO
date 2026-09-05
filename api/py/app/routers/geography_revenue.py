"""Geography Revenue router — exposes revenue-by-geography metrics.
Supports date filtering and optional state/city filters.
Reads only from analytics DB (geography_revenue_metrics table).
"""

from datetime import date, datetime
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import GeographyRevenueMetrics

router = APIRouter(
    prefix="/geography-revenue",
    tags=["Geography Revenue"],
    dependencies=[Depends(require_permission("geography_revenue"))],
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
async def get_geography_revenue(
    request: Request,
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD)"),
    state: str | None = Query(None, description="Optional state filter"),
    city: str | None = Query(None, description="Optional city filter"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get geography revenue summary + zone breakdown, with optional filters."""
    start = _parse_date(start_date)
    end = _parse_date(end_date)

    # ── Base filter builder ──
    def _apply_filters(stmt):
        if start:
            stmt = stmt.where(GeographyRevenueMetrics.date >= start)
        if end:
            stmt = stmt.where(GeographyRevenueMetrics.date <= end)
        if state:
            stmt = stmt.where(func.lower(GeographyRevenueMetrics.state) == state.lower().strip())
        if city:
            stmt = stmt.where(func.lower(GeographyRevenueMetrics.city) == city.lower().strip())
        return stmt

    # ── Summary: aggregated totals across date range ──
    summary_stmt = select(
        func.coalesce(func.sum(GeographyRevenueMetrics.total_orders), 0).label("total_orders"),
        func.coalesce(func.sum(GeographyRevenueMetrics.total_revenue), 0.0).label("total_revenue"),
        func.coalesce(func.sum(GeographyRevenueMetrics.unique_customers), 0).label("unique_customers"),
    )
    summary_stmt = _apply_filters(summary_stmt)

    result = await db.execute(summary_stmt)
    row = result.one()

    total_orders = int(row[0])
    total_revenue = float(row[1])
    unique_customers = int(row[2])
    avg_order_value = round(total_revenue / total_orders, 2) if total_orders > 0 else 0.0

    summary = {
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "avg_order_value": avg_order_value,
        "unique_customers": unique_customers,
    }

    # ── Zone breakdown: aggregated by city + state ──
    zone_stmt = (
        select(
            GeographyRevenueMetrics.city,
            GeographyRevenueMetrics.state,
            func.sum(GeographyRevenueMetrics.total_orders).label("total_orders"),
            func.sum(GeographyRevenueMetrics.total_revenue).label("total_revenue"),
            func.sum(GeographyRevenueMetrics.unique_customers).label("unique_customers"),
        )
        .group_by(GeographyRevenueMetrics.city, GeographyRevenueMetrics.state)
        .having(func.sum(GeographyRevenueMetrics.total_orders) > 0)
        .order_by(desc("total_revenue"))
    )
    zone_stmt = _apply_filters(zone_stmt)

    zone_result = await db.execute(zone_stmt)
    zone_rows = zone_result.all()

    zones = []
    for r in zone_rows:
        t = int(r[2])
        rev = float(r[3])
        cust = int(r[4])
        zones.append({
            "city": r[0],
            "state": r[1],
            "total_orders": t,
            "total_revenue": rev,
            "avg_order_value": round(rev / t, 2) if t > 0 else 0.0,
            "unique_customers": cust,
        })

    # ── Top 10 cities by revenue (aggregate across states) ──
    city_agg: dict = {}
    for z in zones:
        c = z["city"]
        if c not in city_agg:
            city_agg[c] = {"city": c, "total_orders": 0, "total_revenue": 0.0, "unique_customers": 0}
        city_agg[c]["total_orders"] += z["total_orders"]
        city_agg[c]["total_revenue"] += z["total_revenue"]
        city_agg[c]["unique_customers"] += z["unique_customers"]

    top_cities = []
    for ci in city_agg.values():
        t = ci["total_orders"]
        top_cities.append({
            "city": ci["city"],
            "total_orders": t,
            "total_revenue": ci["total_revenue"],
            "avg_order_value": round(ci["total_revenue"] / t, 2) if t > 0 else 0.0,
            "unique_customers": ci["unique_customers"],
        })
    top_cities = sorted(top_cities, key=lambda x: x["total_revenue"], reverse=True)[:10]

    # ── Top 10 states by revenue (aggregate by state) ──
    state_agg: dict = {}
    for z in zones:
        s = z["state"]
        if s not in state_agg:
            state_agg[s] = {"state": s, "total_orders": 0, "total_revenue": 0.0, "unique_customers": 0}
        state_agg[s]["total_orders"] += z["total_orders"]
        state_agg[s]["total_revenue"] += z["total_revenue"]
        state_agg[s]["unique_customers"] += z["unique_customers"]

    top_states = []
    for s in state_agg.values():
        t = s["total_orders"]
        top_states.append({
            "state": s["state"],
            "total_orders": t,
            "total_revenue": s["total_revenue"],
            "avg_order_value": round(s["total_revenue"] / t, 2) if t > 0 else 0.0,
            "unique_customers": s["unique_customers"],
        })
    top_states = sorted(top_states, key=lambda x: x["total_revenue"], reverse=True)[:10]

    # ── Top performing city ──
    top_city = top_cities[0] if top_cities else None

    data = {
        "summary": summary,
        "zones": zones,
        "top_cities": top_cities,
        "top_states": top_states,
        "top_city": top_city,
    }

    return success_response(data=data, path=str(request.url.path))
