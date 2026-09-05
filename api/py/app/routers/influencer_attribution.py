"""Influencer Attribution router — UTM-based influencer performance analytics.

GET /influencer-attribution — returns summary, influencer breakdown, and daily trend.
Reads ONLY from analytics DB (influencer_attribution_metrics table).
"""

import logging
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_analytics_db
from app.schemas.responses import success_response, error_response
from app.dependencies import require_permission
from app.models.analytics import InfluencerAttributionMetrics

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/influencer-attribution",
    tags=["Influencer Attribution"],
    dependencies=[Depends(require_permission("influencer_attribution"))],
)


@router.get("")
async def get_influencer_attribution(
    request: Request,
    db: AsyncSession = Depends(get_analytics_db),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    influencer: str | None = Query(None, description="Filter by influencer name"),
):
    """Influencer-level performance from UTM attribution."""
    try:
        if start_date and end_date:
            try:
                d_start = datetime.strptime(start_date, "%Y-%m-%d").date()
                d_end = datetime.strptime(end_date, "%Y-%m-%d").date()
            except ValueError:
                return error_response(message="Invalid date format.", status_code=400, path=str(request.url.path))
        else:
            d_end = date.today() - timedelta(days=1)
            d_start = d_end - timedelta(days=29)

        filters = [
            InfluencerAttributionMetrics.date >= d_start,
            InfluencerAttributionMetrics.date <= d_end,
        ]
        if influencer:
            filters.append(InfluencerAttributionMetrics.influencer_name.ilike(f"%{influencer}%"))

        # ── Per-influencer aggregation ──
        stmt = select(
            InfluencerAttributionMetrics.influencer_name,
            func.coalesce(func.sum(InfluencerAttributionMetrics.total_orders), 0).label("total_orders"),
            func.coalesce(func.sum(InfluencerAttributionMetrics.total_revenue), 0).label("total_revenue"),
            func.coalesce(func.sum(InfluencerAttributionMetrics.unique_customers), 0).label("unique_customers"),
        ).where(*filters).group_by(InfluencerAttributionMetrics.influencer_name)

        result = await db.execute(stmt)
        rows = result.all()

        influencers = []
        for row in rows:
            orders = int(row.total_orders)
            revenue = float(row.total_revenue)
            customers = int(row.unique_customers)
            aov = round(revenue / orders, 2) if orders > 0 else 0.0
            influencers.append({
                "influencer_name": row.influencer_name,
                "total_orders": orders,
                "total_revenue": round(revenue, 2),
                "unique_customers": customers,
                "avg_order_value": aov,
            })

        influencers.sort(key=lambda i: i["total_revenue"], reverse=True)

        # ── Add rank ──
        for idx, inf in enumerate(influencers):
            inf["rank"] = idx + 1

        # ── Summary ──
        total_orders = sum(i["total_orders"] for i in influencers)
        total_revenue = sum(i["total_revenue"] for i in influencers)
        total_customers = sum(i["unique_customers"] for i in influencers)
        avg_aov = round(total_revenue / total_orders, 2) if total_orders > 0 else 0.0
        best = influencers[0] if influencers else None
        worst = influencers[-1] if len(influencers) > 1 else None

        summary = {
            "total_orders": total_orders,
            "total_revenue": round(total_revenue, 2),
            "total_customers": total_customers,
            "avg_aov": avg_aov,
            "total_influencers": len(influencers),
            "top_influencer": best["influencer_name"] if best else "N/A",
            "top_influencer_revenue": best["total_revenue"] if best else 0.0,
            "worst_influencer": worst["influencer_name"] if worst else "N/A",
            "worst_influencer_revenue": worst["total_revenue"] if worst else 0.0,
        }

        # ── Daily trend ──
        trend_stmt = select(
            InfluencerAttributionMetrics.date,
            func.coalesce(func.sum(InfluencerAttributionMetrics.total_orders), 0).label("orders"),
            func.coalesce(func.sum(InfluencerAttributionMetrics.total_revenue), 0).label("revenue"),
            func.coalesce(func.sum(InfluencerAttributionMetrics.unique_customers), 0).label("customers"),
        ).where(*filters).group_by(
            InfluencerAttributionMetrics.date,
        ).order_by(InfluencerAttributionMetrics.date)

        trend_result = await db.execute(trend_stmt)
        trend = []
        for t in trend_result.all():
            orders_val = int(t.orders)
            rev_val = float(t.revenue)
            trend.append({
                "date": t.date.isoformat(),
                "orders": orders_val,
                "revenue": round(rev_val, 2),
                "customers": int(t.customers),
                "aov": round(rev_val / orders_val, 2) if orders_val > 0 else 0.0,
            })

        return success_response(
            data={"summary": summary, "influencers": influencers, "trend": trend},
            path=str(request.url.path),
        )

    except Exception as e:
        logger.error(f"Influencer Attribution query failed: {e}", exc_info=True)
        return error_response(message=f"Failed to load influencer data: {str(e)}", path=str(request.url.path))
