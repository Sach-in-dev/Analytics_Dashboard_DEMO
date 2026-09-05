"""Flow Attribution router — user journey flow revenue analytics.
Queries only the analytics DB. Supports date range filters.
"""

from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import FlowRevenueAttribution

router = APIRouter(
    prefix="/flow-attribution",
    tags=["Flow Attribution"],
    dependencies=[Depends(require_permission("flow_attribution"))],
)


@router.get("")
async def get_flow_attribution(
    request: Request,
    start_date: str | None = Query(None, description="Filter from YYYY-MM-DD"),
    end_date: str | None = Query(None, description="Filter to YYYY-MM-DD"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get flow attribution metrics with date range filter."""
    from datetime import date as dt_date

    stmt = select(FlowRevenueAttribution).order_by(
        FlowRevenueAttribution.date.desc(),
        FlowRevenueAttribution.revenue.desc(),
    )
    if start_date:
        stmt = stmt.where(FlowRevenueAttribution.date >= dt_date.fromisoformat(start_date))
    if end_date:
        stmt = stmt.where(FlowRevenueAttribution.date <= dt_date.fromisoformat(end_date))

    result = await db.execute(stmt)
    records = result.scalars().all()

    if not records:
        return success_response(
            data={
                "flows": [],
                "top_flows": [],
                "step_transitions": [],
                "summary": {
                    "total_users": 0, "total_orders": 0,
                    "total_revenue": 0.0, "avg_conversion_rate": 0.0,
                    "avg_aov": 0.0, "total_unique_flows": 0,
                    "top_flow": None,
                },
                "last_updated": None,
            },
            path=str(request.url.path),
        )

    # ── Aggregate by flow_path (across dates) ──
    flow_map: dict[str, dict] = {}
    for r in records:
        fp = r.flow_path
        if fp not in flow_map:
            flow_map[fp] = {
                "flow_path": fp,
                "steps_count": r.steps_count,
                "users": 0, "orders": 0, "revenue": 0.0,
            }
        f = flow_map[fp]
        f["users"] += r.users
        f["orders"] += r.orders
        f["revenue"] += r.revenue

    flows = []
    for f in flow_map.values():
        f["revenue"] = round(f["revenue"], 2)
        f["conversion_rate"] = round((f["orders"] / f["users"]) * 100, 2) if f["users"] > 0 else 0.0
        f["aov"] = round(f["revenue"] / f["orders"], 2) if f["orders"] > 0 else 0.0
        flows.append(f)

    flows.sort(key=lambda x: x["revenue"], reverse=True)
    top_flows = flows[:20]

    # ── Build step transitions for Sankey diagram ──
    transition_map: dict[tuple[str, str], int] = {}
    for f in flows:
        steps = f["flow_path"].split(" > ")
        order_count = f["orders"]
        for i in range(len(steps) - 1):
            pair = (steps[i], steps[i + 1])
            transition_map[pair] = transition_map.get(pair, 0) + order_count

    step_transitions = [
        {"from": pair[0], "to": pair[1], "value": val}
        for pair, val in sorted(transition_map.items(), key=lambda x: x[1], reverse=True)
    ][:30]

    # ── Summary ──
    total_users = sum(f["users"] for f in flows)
    total_orders = sum(f["orders"] for f in flows)
    total_revenue = round(sum(f["revenue"] for f in flows), 2)

    last_updated = max((r.updatedAt for r in records if r.updatedAt), default=None)

    return success_response(
        data={
            "flows": flows,
            "top_flows": top_flows,
            "step_transitions": step_transitions,
            "summary": {
                "total_users": total_users,
                "total_orders": total_orders,
                "total_revenue": total_revenue,
                "avg_conversion_rate": round((total_orders / total_users) * 100, 2) if total_users > 0 else 0.0,
                "avg_aov": round(total_revenue / total_orders, 2) if total_orders > 0 else 0.0,
                "total_unique_flows": len(flows),
                "top_flow": top_flows[0] if top_flows else None,
            },
            "last_updated": last_updated.isoformat() if last_updated else None,
        },
        path=str(request.url.path),
    )


@router.post("/sync")
async def trigger_flow_attribution_sync(request: Request):
    """Manually trigger flow attribution processing."""
    import logging
    from app.database import ProdSessionLocal, AnalyticsSessionLocal
    from app.actions.flow_attribution_action import process_flow_attribution

    logger = logging.getLogger(__name__)

    if ProdSessionLocal is None:
        return success_response(data=None, message="PROD_DB not configured",
                                path=str(request.url.path), status_code=503)

    try:
        async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
            await process_flow_attribution(prod_db, analytics_db)
        return success_response(data={"status": "completed"}, message="Flow attribution sync completed",
                                path=str(request.url.path))
    except Exception as e:
        logger.error(f"Flow attribution sync failed: {e}", exc_info=True)
        from app.schemas.responses import error_response
        return error_response(message=f"Sync failed: {str(e)}", path=str(request.url.path))
