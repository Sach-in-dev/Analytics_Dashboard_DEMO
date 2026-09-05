"""LTV by Segment router — exposes customer LTV data grouped by RFM segment.
Supports date filtering via last_order_date from RFM segments table.
"""

from datetime import datetime
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import CustomerRfmSegment, CustomerLtvBySegment

router = APIRouter(
    prefix="/ltv-by-segment",
    tags=["LTV Analysis"],
    dependencies=[Depends(require_permission("ltv"))],
)


def _parse_date(date_str: str | None) -> datetime | None:
    """Parse YYYY-MM-DD string to datetime, returns None on failure."""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return None


def _apply_date_filter(stmt, start_date: str | None, end_date: str | None):
    """Apply last_order_date range filter to a query statement."""
    start = _parse_date(start_date)
    end = _parse_date(end_date)
    if start:
        stmt = stmt.where(CustomerRfmSegment.last_order_date >= start)
    if end:
        # Include the full end day (up to 23:59:59)
        end_inclusive = end.replace(hour=23, minute=59, second=59)
        stmt = stmt.where(CustomerRfmSegment.last_order_date <= end_inclusive)
    return stmt


@router.get("")
async def get_ltv_by_segment(
    request: Request,
    start_date: str | None = Query(None, description="Filter: last order on or after (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="Filter: last order on or before (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get LTV metrics grouped by customer segment, with optional date filtering.

    When date filters are provided, computes LTV on-the-fly from
    customer_rfm_segments (which has last_order_date + monetary per customer).
    Without filters, returns pre-computed data from customer_ltv_by_segment.
    """
    has_date_filter = start_date is not None or end_date is not None

    if has_date_filter:
        # Compute LTV from RFM segments table with date filtering
        base_stmt = select(
            CustomerRfmSegment.segment,
            func.count(CustomerRfmSegment.id).label("total_customers"),
            func.sum(CustomerRfmSegment.monetary).label("total_revenue"),
            func.avg(CustomerRfmSegment.monetary).label("avg_ltv"),
        )
        base_stmt = _apply_date_filter(base_stmt, start_date, end_date)
        stmt = (
            base_stmt
            .group_by(CustomerRfmSegment.segment)
            .order_by(func.sum(CustomerRfmSegment.monetary).desc())
        )

        result = await db.execute(stmt)
        rows = result.fetchall()

        grand_total_customers = sum(row[1] for row in rows)
        grand_total_revenue = sum(float(row[2] or 0) for row in rows)
        grand_avg_ltv = (
            round(grand_total_revenue / grand_total_customers, 2)
            if grand_total_customers > 0 else 0.0
        )

        segments = [
            {
                "id": None,
                "segment": row[0],
                "total_customers": row[1],
                "total_revenue": round(float(row[2] or 0), 2),
                "avg_ltv": round(float(row[3] or 0), 2),
                "createdAt": None,
            }
            for row in rows
        ]
    else:
        # Return pre-computed data from the LTV table
        stmt = (
            select(CustomerLtvBySegment)
            .order_by(CustomerLtvBySegment.total_revenue.desc())
        )
        result = await db.execute(stmt)
        records = result.scalars().all()

        grand_total_customers = sum(r.total_customers for r in records)
        grand_total_revenue = sum(r.total_revenue for r in records)
        grand_avg_ltv = (
            round(grand_total_revenue / grand_total_customers, 2)
            if grand_total_customers > 0 else 0.0
        )

        segments = [_serialize(r) for r in records]

    data = {
        "summary": {
            "total_customers": grand_total_customers,
            "total_revenue": round(grand_total_revenue, 2),
            "avg_ltv": grand_avg_ltv,
        },
        "segments": segments,
    }

    return success_response(data=data, path=str(request.url.path))


def _serialize(r: CustomerLtvBySegment) -> dict:
    return {
        "id": r.id,
        "segment": r.segment,
        "total_customers": r.total_customers,
        "total_revenue": r.total_revenue,
        "avg_ltv": r.avg_ltv,
        "createdAt": r.createdAt.isoformat() if r.createdAt else None,
    }
