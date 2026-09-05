"""Marketing Platforms router — unified wrapper for Creative Performance and Influencer Attribution."""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import (
    CreativePerformanceMetrics,
    InfluencerAttributionMetrics,
    AudienceRoasMetrics,
    CampaignCacMetrics,
    MarketingCostPerOrder,
)

router = APIRouter(
    prefix="/marketing-platforms",
    tags=["MarketingPlatforms"],
    dependencies=[Depends(require_permission("marketing_platforms"))],
)


@router.get("")
async def get_marketing_platforms(
    request: Request,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Unified marketing platform overview: Meta Ads + Influencer performance."""
    start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()

    # Meta Ads — creative level
    creative_stmt = select(
        CreativePerformanceMetrics.creative_name,
        func.sum(CreativePerformanceMetrics.spend).label("spend"),
        func.sum(CreativePerformanceMetrics.revenue_actual).label("revenue"),
        func.sum(CreativePerformanceMetrics.orders).label("orders"),
        func.sum(CreativePerformanceMetrics.impressions).label("impressions"),
        func.sum(CreativePerformanceMetrics.clicks).label("clicks"),
    ).where(
        CreativePerformanceMetrics.date >= start_dt,
        CreativePerformanceMetrics.date <= end_dt,
    ).group_by(CreativePerformanceMetrics.creative_name).order_by(
        func.sum(CreativePerformanceMetrics.revenue_actual).desc()
    ).limit(20)
    cr_res = await db.execute(creative_stmt)
    creatives = []
    for r in cr_res.all():
        spend = float(r[1])
        rev = float(r[2])
        roas = round(rev / spend, 2) if spend else 0.0
        ctr = round(int(r[5]) / int(r[4]) * 100, 2) if int(r[4]) else 0.0
        creatives.append({
            "ad_name": r[0],  # creative_name
            "spend": round(spend, 2),
            "revenue": round(rev, 2),
            "roas": roas,
            "orders": int(r[3]),
            "impressions": int(r[4]),
            "clicks": int(r[5]),
            "ctr": ctr,
        })

    # Influencers
    influencer_stmt = select(
        InfluencerAttributionMetrics.influencer_name,
        func.sum(InfluencerAttributionMetrics.total_revenue).label("revenue"),
        func.sum(InfluencerAttributionMetrics.total_orders).label("orders"),
        func.count(func.distinct(InfluencerAttributionMetrics.date)).label("active_days"),
    ).where(
        InfluencerAttributionMetrics.date >= start_dt,
        InfluencerAttributionMetrics.date <= end_dt,
    ).group_by(InfluencerAttributionMetrics.influencer_name).order_by(
        func.sum(InfluencerAttributionMetrics.total_revenue).desc()
    ).limit(20)
    inf_res = await db.execute(influencer_stmt)
    influencers = [
        {
            "influencer_name": r[0],
            "revenue": round(float(r[1]), 2),
            "orders": int(r[2]),
            "active_days": int(r[3]),
            "avg_order_value": round(float(r[1]) / int(r[2]), 2) if int(r[2]) else 0.0,
        }
        for r in inf_res.all()
    ]

    # Meta Ads summary totals
    meta_summary_stmt = select(
        func.coalesce(func.sum(MarketingCostPerOrder.total_spend), 0),
        func.coalesce(func.sum(MarketingCostPerOrder.total_orders), 0),
    ).where(MarketingCostPerOrder.date >= start_dt, MarketingCostPerOrder.date <= end_dt)
    meta_res = await db.execute(meta_summary_stmt)
    meta_row = meta_res.one()
    meta_spend = float(meta_row[0])
    meta_orders = int(meta_row[1])

    # CAC summary
    cac_stmt = select(
        func.coalesce(func.sum(CampaignCacMetrics.new_customers), 0),
        func.coalesce(func.sum(CampaignCacMetrics.total_spend), 0),
    ).where(CampaignCacMetrics.date >= start_dt, CampaignCacMetrics.date <= end_dt)
    cac_res = await db.execute(cac_stmt)
    cac_row = cac_res.one()
    new_customers = int(cac_row[0])
    cac_spend = float(cac_row[1])
    avg_cac = round(cac_spend / new_customers, 2) if new_customers else 0.0

    # Influencer totals
    inf_total_rev = sum(i["revenue"] for i in influencers)
    inf_total_orders = sum(i["orders"] for i in influencers)

    return success_response(
        data={
            "meta_ads": {
                "total_spend": round(meta_spend, 2),
                "total_orders_attributed": meta_orders,
                "avg_cac": avg_cac,
                "new_customers": new_customers,
                "top_creatives": creatives,
            },
            "influencers": {
                "total_revenue": round(inf_total_rev, 2),
                "total_orders": inf_total_orders,
                "total_influencers": len(influencers),
                "top_influencers": influencers,
            },
            # Flat numeric summary — powers the Period Comparison card.
            "summary": {
                "meta_spend": round(meta_spend, 2),
                "meta_orders_attributed": meta_orders,
                "avg_cac": avg_cac,
                "new_customers": new_customers,
                "influencer_revenue": round(inf_total_rev, 2),
                "influencer_orders": inf_total_orders,
                "total_influencers": len(influencers),
            },
        },
        path=str(request.url.path),
    )
