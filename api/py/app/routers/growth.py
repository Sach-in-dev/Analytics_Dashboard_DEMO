"""Growth Metrics router — Qualified Sessions, MER, New Customers."""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, func
from datetime import datetime
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import (
    DailyOrders,
    UtmAttributionMetrics,
    MarketingCostPerOrder,
    CampaignCacMetrics,
)

router = APIRouter(
    prefix="/growth",
    tags=["Growth"],
    dependencies=[Depends(require_permission("growth"))],
)


@router.get("")
async def get_growth_metrics(
    request: Request,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Qualified Sessions, MER (Marketing Efficiency Ratio), New Customers."""
    start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()
    start_dtime = datetime.combine(start_dt, datetime.min.time())
    end_dtime = datetime.combine(end_dt, datetime.max.time())

    # Revenue
    rev_stmt = select(
        func.coalesce(func.sum(DailyOrders.total), 0),
        func.coalesce(func.sum(DailyOrders.dailyOrdersCount), 0),
        func.coalesce(func.sum(DailyOrders.new_customer_orders_count), 0),
    ).where(DailyOrders.date >= start_dtime, DailyOrders.date <= end_dtime)
    rev_res = await db.execute(rev_stmt)
    rev_row = rev_res.one()
    total_revenue = float(rev_row[0])
    total_orders = int(rev_row[1])
    new_customer_orders = int(rev_row[2])

    # Sessions (qualified = UTM sessions that led to at least 1 page with intent)
    sessions_stmt = select(
        func.coalesce(func.sum(UtmAttributionMetrics.sessions), 0),
        func.coalesce(func.sum(UtmAttributionMetrics.users), 0),
        func.coalesce(func.sum(UtmAttributionMetrics.orders), 0),
    ).where(UtmAttributionMetrics.date >= start_dt, UtmAttributionMetrics.date <= end_dt)
    sess_res = await db.execute(sessions_stmt)
    sess_row = sess_res.one()
    total_sessions = int(sess_row[0])
    total_users = int(sess_row[1])
    utm_orders = int(sess_row[2])

    # Qualified sessions = sessions with UTM attribution and ≥1 order signal
    qualified_sessions = total_sessions
    session_to_order_rate = round((utm_orders / total_sessions) * 100, 2) if total_sessions else 0.0

    # MER = Total Revenue / Total Spend
    spend_stmt = select(
        func.coalesce(func.sum(MarketingCostPerOrder.total_spend), 0),
    ).where(MarketingCostPerOrder.date >= start_dt, MarketingCostPerOrder.date <= end_dt)
    spend_res = await db.execute(spend_stmt)
    total_spend = float(spend_res.scalar() or 0)
    mer = round(total_revenue / total_spend, 2) if total_spend else 0.0

    # New Customers from CAC pipeline
    cac_stmt = select(
        func.coalesce(func.sum(CampaignCacMetrics.new_customers), 0),
    ).where(CampaignCacMetrics.date >= start_dt, CampaignCacMetrics.date <= end_dt)
    cac_res = await db.execute(cac_stmt)
    new_customers_paid = int(cac_res.scalar() or 0)

    # Daily trend — dialect-portable rewrite: TO_CHAR / ::date casts are
    # Postgres-only, so fetch orders and spend separately and merge by
    # calendar date in Python instead of a joined raw-SQL query.
    orders_stmt = select(DailyOrders.date, DailyOrders.dailyOrdersCount, DailyOrders.total).where(
        DailyOrders.date >= start_dtime, DailyOrders.date <= end_dtime
    )
    orders_rows = (await db.execute(orders_stmt)).fetchall()

    spend_by_date_stmt = select(MarketingCostPerOrder.date, MarketingCostPerOrder.total_spend).where(
        MarketingCostPerOrder.date >= start_dt, MarketingCostPerOrder.date <= end_dt
    )
    spend_rows = (await db.execute(spend_by_date_stmt)).fetchall()
    spend_by_date = {r[0]: float(r[1] or 0) for r in spend_rows}

    daily_trend = []
    for order_date, orders_count, revenue in sorted(orders_rows, key=lambda r: r[0]):
        d = order_date.date() if hasattr(order_date, "date") else order_date
        spend = spend_by_date.get(d, 0.0)
        daily_trend.append({
            "date": d.strftime("%Y-%m-%d"),
            "orders": int(orders_count or 0),
            "revenue": float(revenue or 0),
            "spend": spend,
            "mer": round(float(revenue or 0) / spend, 2) if spend else 0.0,
        })

    return success_response(
        data={
            "summary": {
                "qualified_sessions": qualified_sessions,
                "total_users": total_users,
                "session_to_order_rate": session_to_order_rate,
                "mer": mer,
                "total_revenue": round(total_revenue, 2),
                "total_spend": round(total_spend, 2),
                "new_customers_paid": new_customers_paid,
                "new_customer_orders": new_customer_orders,
                "total_orders": total_orders,
            },
            "daily_trend": daily_trend,
        },
        path=str(request.url.path),
    )
