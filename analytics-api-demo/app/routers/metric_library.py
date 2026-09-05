"""Metric Library router — Runway, MER, CAC Payback, and financial KPIs."""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import (
    DailyOrders,
    MarketingCostPerOrder,
    CampaignCacMetrics,
    RepeatPurchaseRate,
)

router = APIRouter(
    prefix="/metric-library",
    tags=["MetricLibrary"],
    dependencies=[Depends(require_permission("metric_library"))],
)

GROSS_MARGIN = 0.42
OPERATING_COST_RATIO = 0.20


@router.get("")
async def get_metric_library(
    request: Request,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Runway, MER, CAC, CAC Payback, LTV:CAC ratio."""
    start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()
    start_dtime = datetime.combine(start_dt, datetime.min.time())
    end_dtime = datetime.combine(end_dt, datetime.max.time())
    days = (end_dt - start_dt).days or 1

    # Revenue & orders
    rev_stmt = select(
        func.coalesce(func.sum(DailyOrders.total), 0),
        func.coalesce(func.sum(DailyOrders.dailyOrdersCount), 0),
    ).where(DailyOrders.date >= start_dtime, DailyOrders.date <= end_dtime)
    rev_res = await db.execute(rev_stmt)
    rev_row = rev_res.one()
    total_revenue = float(rev_row[0])
    total_orders = int(rev_row[1])
    avg_aov = round(total_revenue / total_orders, 2) if total_orders else 0.0

    # Spend
    spend_stmt = select(
        func.coalesce(func.sum(MarketingCostPerOrder.total_spend), 0),
    ).where(MarketingCostPerOrder.date >= start_dt, MarketingCostPerOrder.date <= end_dt)
    spend_res = await db.execute(spend_stmt)
    total_spend = float(spend_res.scalar() or 0)

    # MER
    mer = round(total_revenue / total_spend, 2) if total_spend else 0.0

    # CAC
    cac_stmt = select(
        func.coalesce(func.sum(CampaignCacMetrics.total_spend), 0),
        func.coalesce(func.sum(CampaignCacMetrics.new_customers), 0),
    ).where(CampaignCacMetrics.date >= start_dt, CampaignCacMetrics.date <= end_dt)
    cac_res = await db.execute(cac_stmt)
    cac_row = cac_res.one()
    cac_spend = float(cac_row[0])
    new_customers = int(cac_row[1])
    avg_cac = round(cac_spend / new_customers, 2) if new_customers else 0.0

    # RPR
    rpr_stmt = select(RepeatPurchaseRate.rpr_percentage).order_by(
        RepeatPurchaseRate.createdAt.desc()
    ).limit(1)
    rpr_res = await db.execute(rpr_stmt)
    rpr_val = float(rpr_res.scalar() or 0)

    # LTV estimate: AOV / (1 - RPR%) assuming geometric repeat model, floored
    rpr_decimal = rpr_val / 100.0
    estimated_ltv = round(avg_aov / (1 - rpr_decimal), 2) if rpr_decimal < 1.0 and avg_aov else avg_aov
    ltv_cac_ratio = round(estimated_ltv / avg_cac, 2) if avg_cac else 0.0

    # CAC Payback (months): CAC / (AOV * gross_margin)
    monthly_margin = avg_aov * GROSS_MARGIN
    cac_payback_months = round(avg_cac / monthly_margin, 1) if monthly_margin else 0.0

    # Gross profit & contribution margin
    gross_profit = total_revenue * GROSS_MARGIN
    contribution_margin = gross_profit - total_spend
    cm_pct = round((contribution_margin / total_revenue) * 100, 1) if total_revenue else 0.0

    # Runway proxy: contribution margin / daily burn
    daily_spend = total_spend / days if days else 0
    runway_days = round(contribution_margin / daily_spend, 0) if daily_spend > 0 and contribution_margin > 0 else None

    return success_response(
        data={
            "mer": mer,
            "avg_cac": avg_cac,
            "avg_aov": avg_aov,
            "estimated_ltv": estimated_ltv,
            "ltv_cac_ratio": ltv_cac_ratio,
            "cac_payback_months": cac_payback_months,
            "rpr_pct": rpr_val,
            "gross_margin_pct": round(GROSS_MARGIN * 100, 1),
            "contribution_margin": round(contribution_margin, 2),
            "contribution_margin_pct": cm_pct,
            "total_revenue": round(total_revenue, 2),
            "total_spend": round(total_spend, 2),
            "new_customers": new_customers,
            "runway_days": runway_days,
            "period_days": days,
        },
        path=str(request.url.path),
    )
