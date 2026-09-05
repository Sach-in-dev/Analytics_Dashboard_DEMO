"""Acquisition Source Retention router — source breakdown + retention by acquisition channel."""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from datetime import datetime
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import UtmAttributionMetrics, CustomerRepeatCohort

router = APIRouter(
    prefix="/acquisition-retention",
    tags=["AcquisitionRetention"],
    dependencies=[Depends(require_permission("acquisition_retention"))],
)


@router.get("")
async def get_acquisition_retention(
    request: Request,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Source breakdown combined with repeat cohort retention data."""
    start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()

    # Source breakdown: sessions, orders, revenue per UTM source
    source_stmt = select(
        UtmAttributionMetrics.utm_source,
        func.sum(UtmAttributionMetrics.sessions).label("sessions"),
        func.sum(UtmAttributionMetrics.orders).label("orders"),
        func.sum(UtmAttributionMetrics.revenue).label("revenue"),
        func.sum(UtmAttributionMetrics.users).label("users"),
    ).where(
        UtmAttributionMetrics.date >= start_dt,
        UtmAttributionMetrics.date <= end_dt,
    ).group_by(UtmAttributionMetrics.utm_source).order_by(
        func.sum(UtmAttributionMetrics.revenue).desc()
    ).limit(20)
    source_res = await db.execute(source_stmt)
    source_rows = source_res.all()

    total_revenue = sum(float(r[3]) for r in source_rows) or 1
    source_breakdown = [
        {
            "source": r[0],
            "sessions": int(r[1]),
            "orders": int(r[2]),
            "revenue": round(float(r[3]), 2),
            "revenue_share_pct": round(float(r[3]) / total_revenue * 100, 1),
            "users": int(r[4]),
            "conversion_rate": round(int(r[2]) / int(r[1]) * 100, 2) if int(r[1]) else 0.0,
        }
        for r in source_rows
    ]

    # Cohort retention summary: avg retention by cohort_index (month 1-6)
    cohort_stmt = select(
        CustomerRepeatCohort.cohort_index,
        func.avg(CustomerRepeatCohort.retention_rate).label("avg_retention"),
        func.count(func.distinct(CustomerRepeatCohort.cohort_month)).label("cohorts"),
    ).group_by(CustomerRepeatCohort.cohort_index).order_by(
        CustomerRepeatCohort.cohort_index.asc()
    ).limit(12)
    cohort_res = await db.execute(cohort_stmt)
    cohort_retention = [
        {
            "month_index": int(r[0]),
            "avg_retention_pct": round(float(r[1]), 1),
            "cohort_count": int(r[2]),
        }
        for r in cohort_res.all()
    ]

    # Medium breakdown for channel diversity
    medium_stmt = select(
        UtmAttributionMetrics.utm_medium,
        func.sum(UtmAttributionMetrics.sessions).label("sessions"),
        func.sum(UtmAttributionMetrics.revenue).label("revenue"),
    ).where(
        UtmAttributionMetrics.date >= start_dt,
        UtmAttributionMetrics.date <= end_dt,
    ).group_by(UtmAttributionMetrics.utm_medium).order_by(
        func.sum(UtmAttributionMetrics.revenue).desc()
    ).limit(10)
    medium_res = await db.execute(medium_stmt)
    medium_breakdown = [
        {
            "medium": r[0],
            "sessions": int(r[1]),
            "revenue": round(float(r[2]), 2),
        }
        for r in medium_res.all()
    ]

    total_sessions = sum(s["sessions"] for s in source_breakdown)
    total_orders = sum(s["orders"] for s in source_breakdown)
    total_users = sum(s["users"] for s in source_breakdown)
    avg_conversion = round(total_orders / total_sessions * 100, 2) if total_sessions else 0.0
    avg_retention_m1 = cohort_retention[0]["avg_retention_pct"] if cohort_retention else 0.0
    source_count = len(source_breakdown)

    return success_response(
        data={
            "summary": {
                "total_sessions": total_sessions,
                "total_orders": total_orders,
                "total_revenue": round(total_revenue, 2) if total_revenue != 1 else 0,
                "total_users": total_users,
                "avg_conversion_rate": avg_conversion,
                "avg_retention_m1_pct": avg_retention_m1,
                "source_count": source_count,
            },
            "source_breakdown": source_breakdown,
            "cohort_retention_by_month": cohort_retention,
            "medium_breakdown": medium_breakdown,
        },
        path=str(request.url.path),
    )
