"""Retention Metrics router — Retention Stack, Gross Profit LTV, CAC Payback."""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from datetime import datetime
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import (
    DailyOrders,
    RepeatPurchaseRate,
    CustomerRfmSegment,
    CustomerLtvBySegment,
    CustomerRepeatCohort,
    CampaignCacMetrics,
    MarketingCostPerOrder,
)

router = APIRouter(
    prefix="/retention",
    tags=["Retention"],
    dependencies=[Depends(require_permission("retention"))],
)

GROSS_MARGIN = 0.42


@router.get("")
async def get_retention_metrics(
    request: Request,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Retention stack, Gross Profit LTV, CAC Payback, RPR trend."""
    start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()

    # Latest RPR in range
    rpr_stmt = select(
        RepeatPurchaseRate.createdAt,
        RepeatPurchaseRate.rpr_percentage,
        RepeatPurchaseRate.total_customers,
        RepeatPurchaseRate.repeat_customers,
    ).where(
        RepeatPurchaseRate.createdAt >= start_dt,
        RepeatPurchaseRate.createdAt <= end_dt,
    ).order_by(RepeatPurchaseRate.createdAt.desc()).limit(1)
    rpr_res = await db.execute(rpr_stmt)
    rpr_row = rpr_res.first()
    rpr_pct = float(rpr_row[1]) if rpr_row else 0.0
    total_customers = int(rpr_row[2]) if rpr_row else 0
    repeat_customers = int(rpr_row[3]) if rpr_row else 0

    # RFM segment distribution (retention stack)
    rfm_stmt = select(
        CustomerRfmSegment.segment,
        func.count(CustomerRfmSegment.id).label("count"),
        func.avg(CustomerRfmSegment.monetary).label("avg_ltv"),
    ).group_by(CustomerRfmSegment.segment).order_by(func.count(CustomerRfmSegment.id).desc())
    rfm_res = await db.execute(rfm_stmt)
    rfm_rows = rfm_res.all()
    total_rfm = sum(int(r[1]) for r in rfm_rows) or 1
    retention_stack = [
        {
            "segment": r[0],
            "count": int(r[1]),
            "share_pct": round(int(r[1]) / total_rfm * 100, 1),
            "avg_ltv": round(float(r[2]) / 100, 2) if r[2] else 0.0,
        }
        for r in rfm_rows
    ]

    # LTV by segment with gross profit overlay
    ltv_stmt = select(CustomerLtvBySegment).order_by(
        CustomerLtvBySegment.avg_ltv.desc()
    )
    ltv_res = await db.execute(ltv_stmt)
    ltv_rows = ltv_res.scalars().all()
    gross_profit_ltv = [
        {
            "segment": r.segment,
            "customer_count": r.total_customers,
            "avg_ltv": round(float(r.avg_ltv) / 100, 2),
            "gross_profit_ltv": round(float(r.avg_ltv) / 100 * GROSS_MARGIN, 2),
            "total_ltv": round(float(r.total_revenue) / 100, 2),
        }
        for r in ltv_rows
    ]

    # Month-1 cohort retention
    cohort_stmt = select(
        CustomerRepeatCohort.cohort_month,
        func.avg(CustomerRepeatCohort.retention_rate).label("avg_retention"),
    ).where(CustomerRepeatCohort.cohort_index == 1).group_by(
        CustomerRepeatCohort.cohort_month
    ).order_by(CustomerRepeatCohort.cohort_month.desc()).limit(12)
    cohort_res = await db.execute(cohort_stmt)
    cohort_trend = [
        {"cohort_month": str(r[0]), "month1_retention": round(float(r[1]), 1)}
        for r in cohort_res.all()
    ]

    # CAC and payback
    cac_stmt = select(
        func.coalesce(func.sum(CampaignCacMetrics.total_spend), 0),
        func.coalesce(func.sum(CampaignCacMetrics.new_customers), 0),
    ).where(CampaignCacMetrics.date >= start_dt, CampaignCacMetrics.date <= end_dt)
    cac_res = await db.execute(cac_stmt)
    cac_row = cac_res.one()
    cac_spend = float(cac_row[0])
    new_custs = int(cac_row[1])
    avg_cac = round(cac_spend / new_custs, 2) if new_custs else 0.0

    rev_stmt = select(
        func.coalesce(func.sum(DailyOrders.total), 0),
        func.coalesce(func.sum(DailyOrders.dailyOrdersCount), 0),
    ).where(
        DailyOrders.date >= datetime.combine(start_dt, datetime.min.time()),
        DailyOrders.date <= datetime.combine(end_dt, datetime.max.time()),
    )
    rev_res = await db.execute(rev_stmt)
    rev_row = rev_res.one()
    total_revenue = float(rev_row[0])
    total_orders = int(rev_row[1])
    avg_aov = round(total_revenue / total_orders, 2) if total_orders else 0.0

    monthly_gp_per_cust = avg_aov * GROSS_MARGIN
    cac_payback_months = round(avg_cac / monthly_gp_per_cust, 1) if monthly_gp_per_cust else 0.0

    rpr_decimal = rpr_pct / 100.0
    estimated_ltv = round(avg_aov / (1 - rpr_decimal), 2) if rpr_decimal < 1.0 and avg_aov else avg_aov
    gross_profit_ltv_val = round(estimated_ltv * GROSS_MARGIN, 2)
    ltv_cac_ratio = round(estimated_ltv / avg_cac, 2) if avg_cac else 0.0

    # RPR daily trend in range
    rpr_trend_stmt = select(
        RepeatPurchaseRate.createdAt,
        RepeatPurchaseRate.rpr_percentage,
    ).where(
        RepeatPurchaseRate.createdAt >= start_dt,
        RepeatPurchaseRate.createdAt <= end_dt,
    ).order_by(RepeatPurchaseRate.createdAt.asc())
    rpr_trend_res = await db.execute(rpr_trend_stmt)
    rpr_trend = [
        {"date": str(r[0]), "rpr_pct": float(r[1])}
        for r in rpr_trend_res.all()
    ]

    return success_response(
        data={
            "summary": {
                "rpr_pct": rpr_pct,
                "total_customers": total_customers,
                "repeat_customers": repeat_customers,
                "avg_cac": avg_cac,
                "avg_aov": avg_aov,
                "estimated_ltv": estimated_ltv,
                "gross_profit_ltv": gross_profit_ltv_val,
                "ltv_cac_ratio": ltv_cac_ratio,
                "cac_payback_months": cac_payback_months,
                "gross_margin_pct": round(GROSS_MARGIN * 100, 1),
            },
            "retention_stack": retention_stack,
            "gross_profit_ltv_by_segment": gross_profit_ltv,
            "cohort_month1_trend": cohort_trend,
            "rpr_trend": rpr_trend,
        },
        path=str(request.url.path),
    )
