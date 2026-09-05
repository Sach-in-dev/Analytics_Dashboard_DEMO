"""Audience ROAS router — adset-level (audience) performance analytics.

GET /audience-roas — returns summary, audience breakdown, and daily trend.
Reads ONLY from analytics DB (audience_roas_metrics table).
"""

import logging
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_analytics_db
from app.schemas.responses import success_response, error_response
from app.dependencies import require_permission
from app.models.analytics import AudienceRoasMetrics

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/audience-roas",
    tags=["Audience ROAS"],
    dependencies=[Depends(require_permission("audience_roas"))],
)


@router.get("")
async def get_audience_roas(
    request: Request,
    db: AsyncSession = Depends(get_analytics_db),
    start_date: str | None = Query(None, description="Start date YYYY-MM-DD"),
    end_date: str | None = Query(None, description="End date YYYY-MM-DD"),
    campaign: str | None = Query(None, description="Filter by campaign name"),
    adset: str | None = Query(None, description="Filter by adset name"),
):
    """Audience-level (adset) ROAS performance from Meta Ads."""
    try:
        # ── Date range ──
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

        # ── Build filters ──
        filters = [
            AudienceRoasMetrics.date >= d_start,
            AudienceRoasMetrics.date <= d_end,
        ]
        if campaign:
            filters.append(AudienceRoasMetrics.campaign_name.ilike(f"%{campaign}%"))
        if adset:
            filters.append(AudienceRoasMetrics.adset_name.ilike(f"%{adset}%"))

        # ── Aggregate per-audience ──
        audience_stmt = select(
            AudienceRoasMetrics.adset_id,
            func.max(AudienceRoasMetrics.adset_name).label("adset_name"),
            func.max(AudienceRoasMetrics.campaign_name).label("campaign_name"),
            func.coalesce(func.sum(AudienceRoasMetrics.spend), 0).label("spend"),
            func.coalesce(func.sum(AudienceRoasMetrics.impressions), 0).label("impressions"),
            func.coalesce(func.sum(AudienceRoasMetrics.clicks), 0).label("clicks"),
            func.coalesce(func.sum(AudienceRoasMetrics.conversions), 0).label("conversions"),
            func.coalesce(func.sum(AudienceRoasMetrics.revenue), 0).label("revenue"),
        ).where(*filters).group_by(AudienceRoasMetrics.adset_id)

        result = await db.execute(audience_stmt)
        rows = result.all()

        audiences = []
        for row in rows:
            spend = float(row.spend)
            revenue = float(row.revenue)
            clicks = int(row.clicks)
            impressions = int(row.impressions)
            conversions = int(row.conversions)

            roas = round(revenue / spend, 2) if spend > 0 else 0.0
            ctr = round((clicks / impressions) * 100, 2) if impressions > 0 else 0.0
            cpc = round(spend / clicks, 2) if clicks > 0 else 0.0
            conversion_rate = round((conversions / clicks) * 100, 2) if clicks > 0 else 0.0

            audiences.append({
                "adset_id": row.adset_id,
                "adset_name": row.adset_name,
                "campaign_name": row.campaign_name,
                "spend": round(spend, 2),
                "impressions": impressions,
                "clicks": clicks,
                "conversions": conversions,
                "revenue": round(revenue, 2),
                "roas": roas,
                "ctr": ctr,
                "cpc": cpc,
                "conversion_rate": conversion_rate,
            })

        audiences.sort(key=lambda a: a["roas"], reverse=True)

        # ── Summary ──
        total_spend = sum(a["spend"] for a in audiences)
        total_revenue = sum(a["revenue"] for a in audiences)
        total_conversions = sum(a["conversions"] for a in audiences)
        avg_roas = round(total_revenue / total_spend, 2) if total_spend > 0 else 0.0

        with_spend = [a for a in audiences if a["spend"] > 0]
        best = max(with_spend, key=lambda a: a["roas"]) if with_spend else None
        worst = min(with_spend, key=lambda a: a["roas"]) if with_spend else None

        summary = {
            "total_spend": round(total_spend, 2),
            "total_revenue": round(total_revenue, 2),
            "avg_roas": avg_roas,
            "total_conversions": total_conversions,
            "total_audiences": len(audiences),
            "best_audience": best["adset_name"] if best else "N/A",
            "best_audience_roas": best["roas"] if best else 0.0,
            "worst_audience": worst["adset_name"] if worst else "N/A",
            "worst_audience_roas": worst["roas"] if worst else 0.0,
        }

        # ── Daily trend ──
        trend_stmt = select(
            AudienceRoasMetrics.date,
            func.coalesce(func.sum(AudienceRoasMetrics.spend), 0).label("spend"),
            func.coalesce(func.sum(AudienceRoasMetrics.revenue), 0).label("revenue"),
            func.coalesce(func.sum(AudienceRoasMetrics.clicks), 0).label("clicks"),
            func.coalesce(func.sum(AudienceRoasMetrics.impressions), 0).label("impressions"),
            func.coalesce(func.sum(AudienceRoasMetrics.conversions), 0).label("conversions"),
        ).where(*filters).group_by(
            AudienceRoasMetrics.date,
        ).order_by(AudienceRoasMetrics.date)

        trend_result = await db.execute(trend_stmt)
        trend = []
        for t in trend_result.all():
            day_spend = float(t.spend)
            day_revenue = float(t.revenue)
            day_roas = round(day_revenue / day_spend, 2) if day_spend > 0 else 0.0
            trend.append({
                "date": t.date.isoformat(),
                "spend": round(day_spend, 2),
                "revenue": round(day_revenue, 2),
                "clicks": int(t.clicks),
                "impressions": int(t.impressions),
                "conversions": int(t.conversions),
                "roas": day_roas,
            })

        # ── Unique campaigns for filter dropdown ──
        campaigns_stmt = select(
            func.distinct(AudienceRoasMetrics.campaign_name)
        ).where(
            AudienceRoasMetrics.date >= d_start,
            AudienceRoasMetrics.date <= d_end,
        ).order_by(AudienceRoasMetrics.campaign_name)

        campaigns_result = await db.execute(campaigns_stmt)
        campaign_list = [r[0] for r in campaigns_result.all() if r[0]]

        return success_response(
            data={
                "summary": summary,
                "audiences": audiences,
                "trend": trend,
                "campaigns": campaign_list,
            },
            path=str(request.url.path),
        )

    except Exception as e:
        logger.error(f"Audience ROAS query failed: {e}", exc_info=True)
        return error_response(
            message=f"Failed to load audience ROAS: {str(e)}",
            path=str(request.url.path),
        )
