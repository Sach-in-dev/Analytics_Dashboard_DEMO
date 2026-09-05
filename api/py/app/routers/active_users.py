"""Active Users router — aggregates daily/monthly searches, visitors, and orders."""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import datetime, timedelta
import json
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission

router = APIRouter(prefix="/active-users", tags=["ActiveUsers"], dependencies=[Depends(require_permission("active_users"))])


def _to_date(value):
    """Raw text() queries return a native datetime on Postgres but a plain
    string on SQLite — normalize either to a date object."""
    if isinstance(value, str):
        value = datetime.strptime(value.split(".")[0], "%Y-%m-%d %H:%M:%S")
    return value.date()


@router.get("")
async def get_active_users(
    request: Request,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_analytics_db),
):
    # Dialect-portable rewrite: build the date spine in Python and pull each
    # metric with a plain GROUP BY (no generate_series/TO_CHAR/CAST-to-date,
    # which are Postgres-only) instead of one combined CTE query.
    orders_query = text("""
        SELECT date, SUM("dailyOrdersCount") as orders
        FROM daily_orders
        WHERE date >= :start_dt AND date <= :end_dt
        GROUP BY date
    """)
    searches_query = text("""
        SELECT date, SUM(unique_searchers) as searches
        FROM daily_search_metrics
        WHERE date >= :start_dt AND date <= :end_dt
        GROUP BY date
    """)
    visitors_query = text("""
        SELECT date, SUM(unique_visitors) as visitors
        FROM daily_visitor_metrics
        WHERE date >= :start_dt AND date <= :end_dt
        GROUP BY date
    """)

    # Fetch latest search analytics snapshot for user-type breakdown
    snapshot_query = text("""
        SELECT new_vs_returning_data
        FROM search_analytics_snapshot
        ORDER BY snapshot_date DESC
        LIMIT 1
    """)

    start_dt_obj = datetime.strptime(f"{start_date} 00:00:00", "%Y-%m-%d %H:%M:%S")
    end_dt_obj = datetime.strptime(f"{end_date} 23:59:59", "%Y-%m-%d %H:%M:%S")

    params = {"start_dt": start_dt_obj, "end_dt": end_dt_obj}
    orders_by_date = {_to_date(r[0]): int(r[1] or 0) for r in (await db.execute(orders_query, params)).fetchall()}
    searches_by_date = {_to_date(r[0]): int(r[1] or 0) for r in (await db.execute(searches_query, params)).fetchall()}
    visitors_by_date = {_to_date(r[0]): int(r[1] or 0) for r in (await db.execute(visitors_query, params)).fetchall()}

    records = []
    day = start_dt_obj.date()
    while day <= end_dt_obj.date():
        records.append((
            day.strftime("%Y-%m-%d"),
            searches_by_date.get(day, 0),
            visitors_by_date.get(day, 0),
            orders_by_date.get(day, 0),
        ))
        day += timedelta(days=1)

    snap_result = await db.execute(snapshot_query)
    snap_row = snap_result.fetchone()
    new_vs_returning = snap_row[0] if snap_row and snap_row[0] else []
    # A raw text() query returns JSON columns pre-decoded on Postgres but as
    # a raw JSON string on SQLite — decode defensively either way.
    if isinstance(new_vs_returning, str):
        new_vs_returning = json.loads(new_vs_returning)

    # Build user_type summary from snapshot JSONB
    user_type_summary = []
    for entry in new_vs_returning:
        user_type_summary.append({
            "user_type": entry.get("user_type"),
            "brand_searches": entry.get("brand_searches", 0),
            "brand_search_pct": entry.get("brand_search_pct", 0.0),
            "concern_searches": entry.get("concern_searches", 0),
            "concern_search_pct": entry.get("concern_search_pct", 0.0),
        })

    data = []
    for r in records:
        data.append({
            "date": r[0],
            "searches": r[1],
            "visitors": r[2],
            "orders": r[3],
        })

    summary = {
        "total_searches": sum(d["searches"] or 0 for d in data),
        "total_visitors": sum(d["visitors"] or 0 for d in data),
        "total_orders": sum(d["orders"] or 0 for d in data),
    }

    return success_response(
        data=data,
        meta={"user_type_summary": user_type_summary, "summary": summary},
        path=str(request.url.path),
    )
