"""Campaign CAC router — exposes campaign-level Customer Acquisition Cost analytics.
Supports date filtering. Reads only from analytics DB.
"""

from datetime import date, datetime
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.database import get_analytics_db
from app.schemas.responses import success_response, error_response
from app.dependencies import require_permission
from app.models.analytics import CampaignCacMetrics

router = APIRouter(
    prefix="/campaign-cac",
    tags=["Campaign CAC"],
    dependencies=[Depends(require_permission("campaign_cac"))],
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
async def get_campaign_cac(
    request: Request,
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get campaign CAC summary + per-campaign breakdown + daily trend."""
    start = _parse_date(start_date)
    end = _parse_date(end_date)

    # ── Base filter builder ──
    def _apply_filters(stmt):
        if start:
            stmt = stmt.where(CampaignCacMetrics.date >= start)
        if end:
            stmt = stmt.where(CampaignCacMetrics.date <= end)
        return stmt

    # ── Summary: aggregated totals ──
    summary_stmt = select(
        func.coalesce(func.sum(CampaignCacMetrics.total_spend), 0).label("total_spend"),
        func.coalesce(func.sum(CampaignCacMetrics.new_customers), 0).label("total_new_customers"),
        func.coalesce(func.sum(CampaignCacMetrics.total_orders), 0).label("total_orders"),
        func.coalesce(func.sum(CampaignCacMetrics.total_revenue), 0).label("total_revenue"),
    )
    summary_stmt = _apply_filters(summary_stmt)
    result = await db.execute(summary_stmt)
    row = result.one()

    total_spend = float(row[0])
    total_new_customers = int(row[1])
    total_orders = int(row[2])
    total_revenue = float(row[3])

    # Compute overall avg CAC
    avg_cac = round(total_spend / total_new_customers, 2) if total_new_customers > 0 else 0.0

    # ── Per-campaign breakdown ──
    campaign_stmt = (
        select(
            CampaignCacMetrics.campaign_id,
            CampaignCacMetrics.campaign_name,
            func.sum(CampaignCacMetrics.total_spend).label("total_spend"),
            func.sum(CampaignCacMetrics.new_customers).label("new_customers"),
            func.sum(CampaignCacMetrics.total_orders).label("total_orders"),
            func.sum(CampaignCacMetrics.total_revenue).label("total_revenue"),
        )
        .group_by(CampaignCacMetrics.campaign_id, CampaignCacMetrics.campaign_name)
        .order_by(desc("total_spend"))
    )
    campaign_stmt = _apply_filters(campaign_stmt)
    campaign_result = await db.execute(campaign_stmt)
    campaign_rows = campaign_result.all()

    campaigns = []
    best_campaign = None
    best_cac = float("inf")
    worst_campaign = None
    worst_cac = float("-inf")

    for r in campaign_rows:
        c_spend = float(r[2])
        c_new = int(r[3])
        c_orders = int(r[4])
        c_revenue = float(r[5])
        c_cac = round(c_spend / c_new, 2) if c_new > 0 else 0.0

        campaign_entry = {
            "campaign_id": r[0],
            "campaign_name": r[1],
            "total_spend": round(c_spend, 2),
            "new_customers": c_new,
            "total_orders": c_orders,
            "total_revenue": round(c_revenue, 2),
            "cac": c_cac,
        }
        campaigns.append(campaign_entry)

        # Track best (lowest CAC with spend > 0 and new_customers > 0)
        if c_spend > 0 and c_new > 0:
            if c_cac < best_cac:
                best_cac = c_cac
                best_campaign = r[1]
            if c_cac > worst_cac:
                worst_cac = c_cac
                worst_campaign = r[1]

    # ── Daily trend data ──
    trend_stmt = (
        select(
            CampaignCacMetrics.date,
            func.sum(CampaignCacMetrics.total_spend).label("total_spend"),
            func.sum(CampaignCacMetrics.new_customers).label("new_customers"),
            func.sum(CampaignCacMetrics.total_orders).label("total_orders"),
            func.sum(CampaignCacMetrics.total_revenue).label("total_revenue"),
        )
        .group_by(CampaignCacMetrics.date)
        .order_by(CampaignCacMetrics.date)
    )
    trend_stmt = _apply_filters(trend_stmt)
    trend_result = await db.execute(trend_stmt)
    trend_rows = trend_result.all()

    trend = []
    for t in trend_rows:
        t_spend = float(t[1])
        t_new = int(t[2])
        t_cac = round(t_spend / t_new, 2) if t_new > 0 else 0.0
        trend.append({
            "date": t[0].isoformat(),
            "total_spend": round(t_spend, 2),
            "new_customers": t_new,
            "total_orders": int(t[3]),
            "total_revenue": round(float(t[4]), 2),
            "cac": t_cac,
        })

    summary = {
        "total_spend": round(total_spend, 2),
        "total_new_customers": total_new_customers,
        "total_orders": total_orders,
        "total_revenue": round(total_revenue, 2),
        "avg_cac": avg_cac,
        "best_campaign": best_campaign or "N/A",
        "best_campaign_cac": round(best_cac, 2) if best_cac != float("inf") else 0.0,
        "worst_campaign": worst_campaign or "N/A",
        "worst_campaign_cac": round(worst_cac, 2) if worst_cac != float("-inf") else 0.0,
        "total_campaigns": len(campaigns),
    }

    data = {
        "summary": summary,
        "campaigns": campaigns,
        "trend": trend,
    }

    return success_response(data=data, path=str(request.url.path))
