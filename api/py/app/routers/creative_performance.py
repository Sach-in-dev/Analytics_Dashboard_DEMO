"""Creative Performance router — creative (ad-level) analytics.

GET /creative-performance — returns summary, creatives breakdown, and daily trend.
Reads ONLY from analytics DB (creative_performance_metrics table).
"""

import logging
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, desc
from app.database import get_analytics_db
from app.schemas.responses import success_response, error_response
from app.dependencies import require_permission
from app.models.analytics import CreativePerformanceMetrics

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/creative-performance",
    tags=["Creative Performance"],
    dependencies=[Depends(require_permission("creative_performance"))],
)


@router.get("")
async def get_creative_performance(
    request: Request,
    db: AsyncSession = Depends(get_analytics_db),
    start_date: str | None = Query(None, description="Start date YYYY-MM-DD"),
    end_date: str | None = Query(None, description="End date YYYY-MM-DD"),
):
    """Creative-level performance with hybrid attribution (orders-first)."""
    try:
        # ── Date range handling ──
        if start_date and end_date:
            try:
                d_start = datetime.strptime(start_date, "%Y-%m-%d").date()
                d_end = datetime.strptime(end_date, "%Y-%m-%d").date()
            except ValueError:
                return error_response(
                    message="Invalid date format. Use YYYY-MM-DD.",
                    status_code=400,
                    path=str(request.url.path),
                )
        else:
            d_end = date.today() - timedelta(days=1)
            d_start = d_end - timedelta(days=29)

        # ── Aggregate per-creative for the full date range ──
        creative_stmt = select(
            CreativePerformanceMetrics.creative_id,
            func.max(CreativePerformanceMetrics.creative_name).label("creative_name"),
            func.max(CreativePerformanceMetrics.campaign_name).label("campaign_name"),
            func.coalesce(func.sum(CreativePerformanceMetrics.orders), 0).label("orders"),
            func.coalesce(func.sum(CreativePerformanceMetrics.revenue_actual), 0).label("revenue_actual"),
            func.coalesce(func.sum(CreativePerformanceMetrics.spend), 0).label("spend"),
            func.coalesce(func.sum(CreativePerformanceMetrics.clicks), 0).label("clicks"),
            func.coalesce(func.sum(CreativePerformanceMetrics.impressions), 0).label("impressions"),
            func.coalesce(func.sum(CreativePerformanceMetrics.meta_revenue), 0).label("meta_revenue"),
        ).where(
            CreativePerformanceMetrics.date >= d_start,
            CreativePerformanceMetrics.date <= d_end,
        ).group_by(
            CreativePerformanceMetrics.creative_id,
        )

        result = await db.execute(creative_stmt)
        rows = result.all()

        creatives = []
        for row in rows:
            spend = float(row.spend)
            revenue_actual = float(row.revenue_actual)
            clicks = int(row.clicks)
            impressions = int(row.impressions)
            meta_revenue = float(row.meta_revenue)
            orders = int(row.orders)

            roas = round(revenue_actual / spend, 2) if spend > 0 else 0.0
            ctr = round((clicks / impressions) * 100, 2) if impressions > 0 else 0.0
            cpc = round(spend / clicks, 2) if clicks > 0 else 0.0
            revenue_diff = (
                round(((meta_revenue - revenue_actual) / revenue_actual) * 100, 2)
                if revenue_actual > 0 else 0.0
            )
            flag = "Meta Over-reporting" if revenue_diff > 20 else None

            creatives.append({
                "creative_id": row.creative_id,
                "creative_name": row.creative_name,
                "campaign_name": row.campaign_name,
                "orders": orders,
                "revenue_actual": round(revenue_actual, 2),
                "spend": round(spend, 2),
                "clicks": clicks,
                "impressions": impressions,
                "roas": roas,
                "ctr": ctr,
                "cpc": cpc,
                "meta_revenue": round(meta_revenue, 2),
                "revenue_diff": revenue_diff,
                "flag": flag,
            })

        # ── Sort by revenue_actual desc for the list ──
        creatives.sort(key=lambda c: c["revenue_actual"], reverse=True)

        # ── Summary ──
        total_spend = sum(c["spend"] for c in creatives)
        total_revenue = sum(c["revenue_actual"] for c in creatives)
        total_orders = sum(c["orders"] for c in creatives)
        avg_roas = round(total_revenue / total_spend, 2) if total_spend > 0 else 0.0

        with_spend = [c for c in creatives if c["spend"] > 0]
        best = max(with_spend, key=lambda c: c["roas"]) if with_spend else None
        worst = min(with_spend, key=lambda c: c["roas"]) if with_spend else None
        over_reporting = sum(1 for c in creatives if c["flag"])

        summary = {
            "total_spend": round(total_spend, 2),
            "total_revenue_actual": round(total_revenue, 2),
            "avg_roas": avg_roas,
            "total_orders": total_orders,
            "best_creative": best["creative_name"] if best else "N/A",
            "best_creative_roas": best["roas"] if best else 0.0,
            "worst_creative": worst["creative_name"] if worst else "N/A",
            "worst_creative_roas": worst["roas"] if worst else 0.0,
            "total_creatives": len(creatives),
            "over_reporting_count": over_reporting,
        }

        # ── Daily trend ──
        trend_stmt = select(
            CreativePerformanceMetrics.date,
            func.coalesce(func.sum(CreativePerformanceMetrics.spend), 0).label("spend"),
            func.coalesce(func.sum(CreativePerformanceMetrics.revenue_actual), 0).label("revenue_actual"),
            func.coalesce(func.sum(CreativePerformanceMetrics.orders), 0).label("orders"),
            func.coalesce(func.sum(CreativePerformanceMetrics.clicks), 0).label("clicks"),
            func.coalesce(func.sum(CreativePerformanceMetrics.impressions), 0).label("impressions"),
        ).where(
            CreativePerformanceMetrics.date >= d_start,
            CreativePerformanceMetrics.date <= d_end,
        ).group_by(
            CreativePerformanceMetrics.date,
        ).order_by(
            CreativePerformanceMetrics.date,
        )

        trend_result = await db.execute(trend_stmt)
        trend = []
        for t in trend_result.all():
            day_spend = float(t.spend)
            day_revenue = float(t.revenue_actual)
            day_roas = round(day_revenue / day_spend, 2) if day_spend > 0 else 0.0
            trend.append({
                "date": t.date.isoformat(),
                "spend": round(day_spend, 2),
                "revenue_actual": round(day_revenue, 2),
                "orders": int(t.orders),
                "clicks": int(t.clicks),
                "impressions": int(t.impressions),
                "roas": day_roas,
            })

        return success_response(
            data={
                "summary": summary,
                "creatives": creatives,
                "trend": trend,
            },
            path=str(request.url.path),
        )

    except Exception as e:
        logger.error(f"Creative Performance query failed: {e}", exc_info=True)
        return error_response(
            message=f"Failed to load creative performance: {str(e)}",
            path=str(request.url.path),
        )
