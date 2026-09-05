"""RFM Segments router — exposes customer RFM segmentation data from the analytics database."""

from datetime import datetime
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import CustomerRfmSegment

router = APIRouter(
    prefix="/rfm-segments",
    tags=["Customer RFM Segments"],
    dependencies=[Depends(require_permission("rfm"))],
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
async def get_rfm_segments(
    request: Request,
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    segment: str | None = Query(None, description="Filter by segment name"),
    sort_by: str = Query("monetary", description="Sort field: monetary, frequency, recency_days"),
    sort_order: str = Query("desc", description="Sort direction: asc, desc"),
    start_date: str | None = Query(None, description="Filter: last order on or after (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="Filter: last order on or before (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get paginated RFM segments with optional filtering and sorting."""

    # Base query
    stmt = select(CustomerRfmSegment)
    count_stmt = select(func.count(CustomerRfmSegment.id))

    # Filter by segment
    if segment:
        stmt = stmt.where(CustomerRfmSegment.segment == segment)
        count_stmt = count_stmt.where(CustomerRfmSegment.segment == segment)

    # Filter by date range
    stmt = _apply_date_filter(stmt, start_date, end_date)
    count_stmt = _apply_date_filter(count_stmt, start_date, end_date)

    # Sorting
    sort_column_map = {
        "monetary": CustomerRfmSegment.monetary,
        "frequency": CustomerRfmSegment.frequency,
        "recency_days": CustomerRfmSegment.recency_days,
        "r_score": CustomerRfmSegment.r_score,
        "f_score": CustomerRfmSegment.f_score,
        "m_score": CustomerRfmSegment.m_score,
    }
    sort_col = sort_column_map.get(sort_by, CustomerRfmSegment.monetary)

    if sort_order == "asc":
        stmt = stmt.order_by(sort_col.asc())
    else:
        stmt = stmt.order_by(sort_col.desc())

    # Total count
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0
    total_pages = (total + limit - 1) // limit if total > 0 else 0

    # Pagination
    offset = (page - 1) * limit
    stmt = stmt.offset(offset).limit(limit)

    result = await db.execute(stmt)
    records = result.scalars().all()

    return success_response(
        data=[_serialize(r) for r in records],
        path=str(request.url.path),
        meta={
            "total": total,
            "page": page,
            "limit": limit,
            "totalPages": total_pages,
        },
    )


@router.get("/summary")
async def get_rfm_summary(
    request: Request,
    start_date: str | None = Query(None, description="Filter: last order on or after (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="Filter: last order on or before (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get segment distribution summary (count per segment)."""
    base_filter = select(
        CustomerRfmSegment.segment,
        func.count(CustomerRfmSegment.id).label("count"),
        func.avg(CustomerRfmSegment.monetary).label("avg_monetary"),
        func.avg(CustomerRfmSegment.frequency).label("avg_frequency"),
        func.avg(CustomerRfmSegment.recency_days).label("avg_recency"),
    )

    base_filter = _apply_date_filter(base_filter, start_date, end_date)

    stmt = (
        base_filter
        .group_by(CustomerRfmSegment.segment)
        .order_by(func.count(CustomerRfmSegment.id).desc())
    )

    result = await db.execute(stmt)
    rows = result.fetchall()

    total_customers = sum(row[1] for row in rows)

    data = {
        "total_customers": total_customers,
        "segments": [
            {
                "segment": row[0],
                "count": row[1],
                "percentage": round((row[1] / total_customers * 100), 1) if total_customers > 0 else 0,
                "avg_monetary": round(float(row[2] or 0), 2),
                "avg_frequency": round(float(row[3] or 0), 1),
                "avg_recency_days": round(float(row[4] or 0), 0),
            }
            for row in rows
        ],
    }

    return success_response(data=data, path=str(request.url.path))


def _serialize(r: CustomerRfmSegment) -> dict:
    return {
        "id": r.id,
        "email": r.email,
        "recency_days": r.recency_days,
        "frequency": r.frequency,
        "monetary": r.monetary,
        "r_score": r.r_score,
        "f_score": r.f_score,
        "m_score": r.m_score,
        "segment": r.segment,
        "last_order_date": r.last_order_date.isoformat() if r.last_order_date else None,
        "createdAt": r.createdAt.isoformat() if r.createdAt else None,
    }
