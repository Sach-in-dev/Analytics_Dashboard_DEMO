"""Customer Lifetime Value (CLV) router — reads from customer_clv_snapshot in analytics DB."""

import math
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, func
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import CustomerClvSnapshot

router = APIRouter(
    prefix="/clv",
    tags=["CLV"],
    dependencies=[Depends(require_permission("clv"))],
)


@router.get("")
async def get_clv(
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    sort_by: str = Query("total_spend", description="total_spend | order_count | first_purchase_date | last_purchase_date | mom_growth_pct"),
    sort_order: str = Query("desc", description="asc | desc"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Per-customer CLV: total spend, first/last purchase date, order count, MoM growth."""
    allowed_sorts = {"total_spend", "order_count", "first_purchase_date", "last_purchase_date", "mom_growth_pct", "avg_order_value"}
    sort_col = getattr(CustomerClvSnapshot, sort_by if sort_by in allowed_sorts else "total_spend")
    order_fn = sort_col.desc() if sort_order.lower() != "asc" else sort_col.asc()

    # Total count
    count_stmt = select(func.count(CustomerClvSnapshot.id))
    count_res = await db.execute(count_stmt)
    total = int(count_res.scalar() or 0)

    # Summary stats
    summary_stmt = select(
        func.count(CustomerClvSnapshot.id),
        func.sum(CustomerClvSnapshot.total_spend),
        func.avg(CustomerClvSnapshot.avg_order_value),
        func.avg(CustomerClvSnapshot.order_count),
    )
    summary_res = await db.execute(summary_stmt)
    s = summary_res.one()
    summary = {
        "total_customers": int(s[0] or 0),
        "total_revenue": round(float(s[1] or 0), 2),
        "avg_order_value": round(float(s[2] or 0), 2),
        "avg_orders_per_customer": round(float(s[3] or 0), 1),
    }

    # Paginated data
    offset = (page - 1) * limit
    stmt = select(CustomerClvSnapshot).order_by(order_fn).offset(offset).limit(limit)
    result = await db.execute(stmt)
    rows = result.scalars().all()

    data = [
        {
            "customer_id": r.customer_id,
            "customer_name": r.customer_name or "",
            "email": r.email or "",
            "order_count": r.order_count,
            "total_spend": round(float(r.total_spend), 2),
            "avg_order_value": round(float(r.avg_order_value), 2),
            "first_purchase_date": str(r.first_purchase_date) if r.first_purchase_date else None,
            "last_purchase_date": str(r.last_purchase_date) if r.last_purchase_date else None,
            "prev_month_orders": r.prev_month_orders,
            "curr_month_orders": r.curr_month_orders,
            "mom_growth_pct": round(float(r.mom_growth_pct), 1) if r.mom_growth_pct is not None else None,
        }
        for r in rows
    ]

    return success_response(
        data=data,
        path=str(request.url.path),
        meta={
            "total": total,
            "page": page,
            "limit": limit,
            "lastPage": math.ceil(total / limit) if total else 1,
            "summary": summary,
        },
    )
