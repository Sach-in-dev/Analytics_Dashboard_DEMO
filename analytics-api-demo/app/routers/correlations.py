"""Correlations (What Sells Together) router — queries pre-computed analytics tables."""

import math
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission

router = APIRouter(prefix="/correlations", tags=["Correlations"], dependencies=[Depends(require_permission("correlations"))])


@router.get("/summary")
async def get_correlation_summary(
    request: Request,
    start_date: str = Query(None, description="Start date (YYYY-MM-DD) — ignored, uses pre-computed data"),
    end_date: str = Query(None, description="End date (YYYY-MM-DD) — ignored, uses pre-computed data"),
    db: AsyncSession = Depends(get_analytics_db)
):
    """Get bundling summary from pre-computed correlation_summary table."""
    result = await db.execute(
        text("""
            SELECT total_active_orders, multi_item_orders, bundling_percentage,
                   period_start, period_end
            FROM correlation_summary
            ORDER BY "createdAt" DESC
            LIMIT 1
        """)
    )
    row = result.fetchone()

    if not row:
        data = {
            "total_active_orders": 0,
            "multi_item_orders": 0,
            "bundling_percentage": 0
        }
    else:
        data = {
            "total_active_orders": row[0],
            "multi_item_orders": row[1],
            "bundling_percentage": row[2]
        }

    return success_response(data=data, path=str(request.url.path))


@router.get("/frequent-pairs")
async def get_frequent_pairs(
    request: Request,
    start_date: str = Query(None, description="Start date (YYYY-MM-DD) — ignored, uses pre-computed data"),
    end_date: str = Query(None, description="End date (YYYY-MM-DD) — ignored, uses pre-computed data"),
    page: int = Query(1, description="Page number"),
    limit: int = Query(10, description="Items per page"),
    db: AsyncSession = Depends(get_analytics_db)
):
    """Get frequent product pairs from pre-computed product_pair_correlations table."""
    offset = (page - 1) * limit

    count_res = await db.execute(
        text("SELECT COUNT(*) FROM product_pair_correlations")
    )
    total = count_res.scalar() or 0

    result = await db.execute(
        text("""
            SELECT product_a_title, product_b_title, co_occurrences
            FROM product_pair_correlations
            ORDER BY co_occurrences DESC
            LIMIT :limit OFFSET :offset
        """),
        {"limit": limit, "offset": offset}
    )
    rows = result.fetchall()

    data = []
    for r in rows:
        data.append({
            "product_a": r[0],
            "product_b": r[1],
            "co_occurrences": r[2]
        })

    return success_response(
        data=data,
        path=str(request.url.path),
        meta={"total": total, "lastPage": math.ceil(total / limit) if total else 1}
    )
