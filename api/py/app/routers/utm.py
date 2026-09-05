"""UTM router — unified endpoints with dynamic date ranges and pagination."""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import datetime
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.utils.pagination import Paginate
from app.models.analytics import (
    UtmSourceDaily, UtmMediumDaily, UtmCampaignDaily, UtmTermDaily, UtmContentDaily
)

router = APIRouter(prefix="/utm", tags=["UTM"], dependencies=[Depends(require_permission("utm"))])

_models_map = {
    "source": UtmSourceDaily,
    "medium": UtmMediumDaily,
    "campaign": UtmCampaignDaily,
    "term": UtmTermDaily,
    "content": UtmContentDaily
}

@router.get("")
async def get_utm(
    request: Request,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    utm_type: str = Query("source", description="source, medium, campaign, term, content"),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_analytics_db),
):
    if utm_type not in _models_map:
        return success_response(data=[], meta={"total": 0, "page": 1, "lastPage": 1}, message="Invalid utm_type", path=str(request.url.path))

    model = _models_map[utm_type]
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)

    # 1. Total count
    subq = (
        select(model.key)
        .where(model.date >= start_dt, model.date <= end_dt)
        .group_by(model.key)
        .subquery()
    )
    count_stmt = select(func.count()).select_from(subq)
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    # 2. Results
    paginator = Paginate(page=page, limit=limit)
    
    stmt = (
        select(
            model.key,
            func.sum(model.views).label("total_views")
        )
        .where(model.date >= start_dt, model.date <= end_dt)
        .group_by(model.key)
        .order_by(desc("total_views"))
        .offset(paginator.offset)
        .limit(paginator.limit)
    )
    
    result = await db.execute(stmt)
    rows = result.all()

    data = [{"key": row[0], "views": row[1]} for row in rows]

    # Window-wide totals (not just this page) — powers the Period Comparison card.
    total_views_stmt = select(func.coalesce(func.sum(model.views), 0)).where(
        model.date >= start_dt, model.date <= end_dt
    )
    total_views = (await db.execute(total_views_stmt)).scalar() or 0

    resp = paginator.response(data, total)
    meta = {**resp["meta"], "summary": {"total_views": int(total_views), "unique_keys": int(total)}}
    return success_response(data=resp["data"], meta=meta, path=str(request.url.path))
