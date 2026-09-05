"""UTM Attribution router — marketing attribution analytics.
Queries only the analytics DB. Supports date range + source/medium/campaign filters.
"""

from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import UtmAttributionMetrics

router = APIRouter(
    prefix="/utm-attribution",
    tags=["UTM Attribution"],
    dependencies=[Depends(require_permission("utm_attribution"))],
)


@router.get("")
async def get_utm_attribution(
    request: Request,
    start_date: str | None = Query(None, description="Filter from YYYY-MM-DD"),
    end_date: str | None = Query(None, description="Filter to YYYY-MM-DD"),
    source: str | None = Query(None, description="Filter by utm_source"),
    medium: str | None = Query(None, description="Filter by utm_medium"),
    campaign: str | None = Query(None, description="Filter by utm_campaign"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get UTM attribution metrics with filters."""
    from datetime import date as dt_date

    stmt = select(UtmAttributionMetrics).order_by(
        UtmAttributionMetrics.date.desc(),
        UtmAttributionMetrics.revenue.desc(),
    )
    if start_date:
        stmt = stmt.where(UtmAttributionMetrics.date >= dt_date.fromisoformat(start_date))
    if end_date:
        stmt = stmt.where(UtmAttributionMetrics.date <= dt_date.fromisoformat(end_date))
    if source:
        stmt = stmt.where(UtmAttributionMetrics.utm_source == source.lower())
    if medium:
        stmt = stmt.where(UtmAttributionMetrics.utm_medium == medium.lower())
    if campaign:
        stmt = stmt.where(UtmAttributionMetrics.utm_campaign == campaign.lower())

    result = await db.execute(stmt)
    records = result.scalars().all()

    if not records:
        return success_response(
            data={
                "data": [],
                "by_source": [],
                "by_campaign": [],
                "summary": {
                    "total_users": 0, "total_sessions": 0,
                    "total_orders": 0, "total_revenue": 0.0,
                    "avg_conversion_rate": 0.0, "avg_aov": 0.0,
                    "top_source": None, "top_campaign": None,
                },
                "last_updated": None,
            },
            path=str(request.url.path),
        )

    # ── Aggregate by UTM combo (across dates) ──
    combo_map: dict[tuple, dict] = {}
    for r in records:
        key = (r.utm_source, r.utm_medium, r.utm_campaign, r.utm_term, r.utm_content)
        if key not in combo_map:
            combo_map[key] = {
                "utm_source": r.utm_source, "utm_medium": r.utm_medium,
                "utm_campaign": r.utm_campaign, "utm_term": r.utm_term,
                "utm_content": r.utm_content,
                "users": 0, "sessions": 0, "orders": 0, "revenue": 0.0,
            }
        c = combo_map[key]
        c["users"] += r.users
        c["sessions"] += r.sessions
        c["orders"] += r.orders
        c["revenue"] += r.revenue

    data_list = []
    for c in combo_map.values():
        c["revenue"] = round(c["revenue"], 2)
        c["conversion_rate"] = round((c["orders"] / c["sessions"]) * 100, 2) if c["sessions"] > 0 else 0.0
        c["aov"] = round(c["revenue"] / c["orders"], 2) if c["orders"] > 0 else 0.0
        data_list.append(c)

    data_list.sort(key=lambda x: x["revenue"], reverse=True)

    # ── By source ──
    source_map: dict[str, dict] = {}
    for d in data_list:
        src = d["utm_source"]
        if src not in source_map:
            source_map[src] = {"source": src, "users": 0, "sessions": 0, "orders": 0, "revenue": 0.0}
        s = source_map[src]
        s["users"] += d["users"]
        s["sessions"] += d["sessions"]
        s["orders"] += d["orders"]
        s["revenue"] += d["revenue"]

    by_source = sorted(source_map.values(), key=lambda x: x["revenue"], reverse=True)
    for s in by_source:
        s["revenue"] = round(s["revenue"], 2)
        s["conversion_rate"] = round((s["orders"] / s["sessions"]) * 100, 2) if s["sessions"] > 0 else 0.0
        s["aov"] = round(s["revenue"] / s["orders"], 2) if s["orders"] > 0 else 0.0

    # ── By campaign ──
    campaign_map: dict[str, dict] = {}
    for d in data_list:
        camp = d["utm_campaign"]
        if camp == "none":
            continue
        if camp not in campaign_map:
            campaign_map[camp] = {"campaign": camp, "users": 0, "sessions": 0, "orders": 0, "revenue": 0.0}
        cm = campaign_map[camp]
        cm["users"] += d["users"]
        cm["sessions"] += d["sessions"]
        cm["orders"] += d["orders"]
        cm["revenue"] += d["revenue"]

    by_campaign = sorted(campaign_map.values(), key=lambda x: x["revenue"], reverse=True)
    for cm in by_campaign:
        cm["revenue"] = round(cm["revenue"], 2)
        cm["conversion_rate"] = round((cm["orders"] / cm["sessions"]) * 100, 2) if cm["sessions"] > 0 else 0.0
        cm["aov"] = round(cm["revenue"] / cm["orders"], 2) if cm["orders"] > 0 else 0.0

    # ── Summary ──
    total_users = sum(d["users"] for d in data_list)
    total_sessions = sum(d["sessions"] for d in data_list)
    total_orders = sum(d["orders"] for d in data_list)
    total_revenue = round(sum(d["revenue"] for d in data_list), 2)

    last_updated = max((r.updatedAt for r in records if r.updatedAt), default=None)

    return success_response(
        data={
            "data": data_list,
            "by_source": by_source,
            "by_campaign": by_campaign,
            "summary": {
                "total_users": total_users,
                "total_sessions": total_sessions,
                "total_orders": total_orders,
                "total_revenue": total_revenue,
                "avg_conversion_rate": round((total_orders / total_sessions) * 100, 2) if total_sessions > 0 else 0.0,
                "avg_aov": round(total_revenue / total_orders, 2) if total_orders > 0 else 0.0,
                "top_source": by_source[0] if by_source else None,
                "top_campaign": by_campaign[0] if by_campaign else None,
            },
            "last_updated": last_updated.isoformat() if last_updated else None,
        },
        path=str(request.url.path),
    )


@router.post("/sync")
async def trigger_utm_attribution_sync(request: Request):
    """Manually trigger UTM attribution processing."""
    import logging
    from app.database import ProdSessionLocal, AnalyticsSessionLocal
    from app.actions.utm_attribution_action import process_utm_attribution

    logger = logging.getLogger(__name__)

    if ProdSessionLocal is None:
        return success_response(data=None, message="PROD_DB not configured",
                                path=str(request.url.path), status_code=503)

    try:
        async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
            await process_utm_attribution(prod_db, analytics_db)
        return success_response(data={"status": "completed"}, message="UTM attribution sync completed",
                                path=str(request.url.path))
    except Exception as e:
        logger.error(f"UTM attribution sync failed: {e}", exc_info=True)
        from app.schemas.responses import error_response
        return error_response(message=f"Sync failed: {str(e)}", path=str(request.url.path))
