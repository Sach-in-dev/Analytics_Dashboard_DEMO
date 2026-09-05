"""Repeat Purchase Rate router — exposes RPR metrics.
Supports date filtering via last_order_date from RFM segments table.
"""

from datetime import datetime
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import RepeatPurchaseRate, CustomerRfmSegment

router = APIRouter(
    prefix="/repeat-purchase-rate",
    tags=["Repeat Purchase Rate"],
    dependencies=[Depends(require_permission("rpr"))],
)


def _parse_date(date_str: str | None) -> datetime | None:
    """Parse YYYY-MM-DD string to datetime, returns None on failure."""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return None


@router.get("")
async def get_repeat_purchase_rate(
    request: Request,
    start_date: str | None = Query(None, description="Filter: last order on or after (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="Filter: last order on or before (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get Repeat Purchase Rate, with optional date filtering.

    When date filters are provided, computes RPR on-the-fly from
    customer_rfm_segments (which has last_order_date + frequency per customer).
    Without filters, returns the latest pre-computed snapshot.
    """
    has_date_filter = start_date is not None or end_date is not None

    if has_date_filter:
        # Compute RPR from RFM segments table with date filtering
        base_stmt = select(
            func.count(CustomerRfmSegment.id).label("total_customers"),
            func.sum(
                case(
                    (CustomerRfmSegment.frequency > 1, 1),
                    else_=0
                )
            ).label("repeat_customers"),
        )

        start = _parse_date(start_date)
        end = _parse_date(end_date)
        if start:
            base_stmt = base_stmt.where(CustomerRfmSegment.last_order_date >= start)
        if end:
            end_inclusive = end.replace(hour=23, minute=59, second=59)
            base_stmt = base_stmt.where(CustomerRfmSegment.last_order_date <= end_inclusive)

        result = await db.execute(base_stmt)
        row = result.one()

        total_customers = row[0] or 0
        repeat_customers = int(row[1] or 0)
        rpr_percentage = round((repeat_customers / total_customers) * 100, 2) if total_customers > 0 else 0.0

        data = {
            "total_customers": total_customers,
            "repeat_customers": repeat_customers,
            "rpr_percentage": rpr_percentage,
            "one_time_customers": total_customers - repeat_customers,
            "createdAt": None,
        }
    else:
        # Return pre-computed snapshot
        stmt = (
            select(RepeatPurchaseRate)
            .order_by(RepeatPurchaseRate.createdAt.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        record = result.scalars().first()

        if not record:
            data = {
                "total_customers": 0,
                "repeat_customers": 0,
                "rpr_percentage": 0.0,
                "one_time_customers": 0,
                "createdAt": None,
            }
        else:
            data = {
                "total_customers": record.total_customers,
                "repeat_customers": record.repeat_customers,
                "rpr_percentage": record.rpr_percentage,
                "one_time_customers": record.total_customers - record.repeat_customers,
                "createdAt": record.createdAt.isoformat() if record.createdAt else None,
            }

    return success_response(data=data, path=str(request.url.path))


@router.get("/history")
async def get_rpr_history(
    request: Request,
    limit: int = 30,
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get historical RPR snapshots (for trend charting)."""
    stmt = (
        select(RepeatPurchaseRate)
        .order_by(RepeatPurchaseRate.createdAt.desc())
        .limit(min(limit, 90))
    )

    result = await db.execute(stmt)
    records = result.scalars().all()

    data = [
        {
            "total_customers": r.total_customers,
            "repeat_customers": r.repeat_customers,
            "rpr_percentage": r.rpr_percentage,
            "createdAt": r.createdAt.isoformat() if r.createdAt else None,
        }
        for r in reversed(records)  # oldest first for chart rendering
    ]

    return success_response(data=data, path=str(request.url.path))
