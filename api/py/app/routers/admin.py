"""Admin router — port of admin.controller.ts."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, func
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.models.analytics import (
    DailyOrders, MonthlyOrders,
    UtmSourceDaily, UtmMediumDaily, UtmCampaignDaily, UtmTermDaily, UtmContentDaily,
    UtmSourceMonthly, UtmMediumMonthly, UtmCampaignMonthly, UtmTermMonthly, UtmContentMonthly,
    DailyCouponUsage, MonthlyCouponUsage, CouponMetadata, AnalyticsJobLog,
)
from app.dependencies import require_permission

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_permission("admin"))])


@router.delete("/reset")
async def reset_analytics(
    request: Request,
    db: AsyncSession = Depends(get_analytics_db),
):
    """Reset all analytics data by truncating all tables."""
    tables = [
        "daily_orders", "monthly_orders",
        "utm_source_daily", "utm_medium_daily", "utm_campaign_daily",
        "utm_term_daily", "utm_content_daily",
        "utm_source_monthly", "utm_medium_monthly", "utm_campaign_monthly",
        "utm_term_monthly", "utm_content_monthly",
        "daily_coupon_usage", "monthly_coupon_usage",
        "coupon_metadata", "analytics_job_logs",
    ]
    for table in tables:
        await db.execute(text(f'TRUNCATE TABLE "{table}" CASCADE'))
    await db.commit()

    return success_response(
        data={"message": "All analytics data has been reset"},
        path=str(request.url.path),
    )


@router.get("/stats")
async def get_stats(
    request: Request,
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get record counts for all analytics tables."""
    models = {
        "dailyOrders": DailyOrders,
        "monthlyOrders": MonthlyOrders,
        "utmSourceDaily": UtmSourceDaily,
        "utmMediumDaily": UtmMediumDaily,
        "utmCampaignDaily": UtmCampaignDaily,
        "utmTermDaily": UtmTermDaily,
        "utmContentDaily": UtmContentDaily,
        "utmSourceMonthly": UtmSourceMonthly,
        "utmMediumMonthly": UtmMediumMonthly,
        "utmCampaignMonthly": UtmCampaignMonthly,
        "utmTermMonthly": UtmTermMonthly,
        "utmContentMonthly": UtmContentMonthly,
        "dailyCouponUsage": DailyCouponUsage,
        "monthlyCouponUsage": MonthlyCouponUsage,
        "couponMetadata": CouponMetadata,
        "analyticsJobLogs": AnalyticsJobLog,
    }

    stats = {}
    for name, model in models.items():
        result = await db.execute(select(func.count(model.id)))
        stats[name] = result.scalar() or 0

    return success_response(data=stats, path=str(request.url.path))
