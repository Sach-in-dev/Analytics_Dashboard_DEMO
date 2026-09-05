"""Searches router — exposes search metrics from the analytics database."""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from datetime import datetime
import json
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
from app.models.analytics import DailySearchMetrics, MonthlySearchMetrics

router = APIRouter(prefix="/searches", tags=["Searches"], dependencies=[Depends(require_permission("searches"))])


@router.get("")
async def get_searches(
    request: Request,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    interval: str | None = Query(None, description="Granularity: daily or monthly"),
    db: AsyncSession = Depends(get_analytics_db),
):
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    if interval == "monthly":
        start_year, start_month = start_dt.year, start_dt.month
        end_year, end_month = end_dt.year, end_dt.month

        start_str = f"{start_year}-{start_month:02d}"
        end_str = f"{end_year}-{end_month:02d}"

        stmt = select(MonthlySearchMetrics).where(
            func.concat(func.cast(MonthlySearchMetrics.year, str), '-', func.lpad(func.cast(MonthlySearchMetrics.month, str), 2, '0')) >= start_str,
            func.concat(func.cast(MonthlySearchMetrics.year, str), '-', func.lpad(func.cast(MonthlySearchMetrics.month, str), 2, '0')) <= end_str,
        ).order_by(MonthlySearchMetrics.year.asc(), MonthlySearchMetrics.month.asc())

        result = await db.execute(stmt)
        records = result.scalars().all()

        rows = [_serialize_monthly(r) for r in records]
        return success_response(data=rows, meta={"summary": _searches_summary(rows)}, path=str(request.url.path))
    else:
        stmt = select(DailySearchMetrics).where(
            DailySearchMetrics.date >= start_dt,
            DailySearchMetrics.date <= end_dt
        ).order_by(DailySearchMetrics.date.asc())

        result = await db.execute(stmt)
        records = result.scalars().all()

        rows = [_serialize_daily(r) for r in records]
        return success_response(data=rows, meta={"summary": _searches_summary(rows)}, path=str(request.url.path))


def _searches_summary(rows: list[dict]) -> dict:
    """Scalar totals over the window — powers the Period Comparison card."""
    return {
        "total_searches": sum(r.get("total_searches") or 0 for r in rows),
        "unique_searchers": sum(r.get("unique_searchers") or 0 for r in rows),
        "with_results": sum(r.get("with_results") or 0 for r in rows),
        "zero_results": sum(r.get("zero_results") or 0 for r in rows),
    }


def _serialize_daily(r: DailySearchMetrics) -> dict:
    return {
        "id": r.id,
        "date": r.date.strftime("%Y-%m-%d") if r.date else None,
        "total_searches": r.total_searches,
        "unique_searchers": r.unique_searchers,
        "with_results": r.with_results,
        "zero_results": r.zero_results,
        "interval": "daily"
    }

def _serialize_monthly(r: MonthlySearchMetrics) -> dict:
    return {
        "id": r.id,
        "date": f"{r.year}-{r.month:02d}",
        "total_searches": r.total_searches,
        "unique_searchers": r.unique_searchers,
        "with_results": r.with_results,
        "zero_results": r.zero_results,
        "interval": "monthly"
    }


@router.get("/keywords")
async def get_top_keywords(
    request: Request,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get top search keywords from analytics DB (pre-synced from prod)."""
    start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()

    # Case-insensitive merge — "Cosrx" / "cosrx" / "COSRX" collapse into one row.
    # Display label is the most-frequent original-case variant in the window.
    # Dialect-portable rewrite: ARRAY_AGG + array indexing is Postgres-only,
    # so pick the most-frequent original-case spelling in Python instead.
    query = text("""
        SELECT LOWER(TRIM(keyword)) AS norm, keyword AS original, SUM(count) AS variant_count
        FROM search_top_keywords
        WHERE date >= :start_dt AND date <= :end_dt
        GROUP BY LOWER(TRIM(keyword)), keyword
    """)

    result = await db.execute(query, {"start_dt": start_dt, "end_dt": end_dt})
    rows = result.fetchall()

    by_norm: dict = {}
    for norm, original, variant_count in rows:
        agg = by_norm.setdefault(norm, {"total_count": 0, "best_label": original, "best_count": -1})
        agg["total_count"] += int(variant_count or 0)
        if int(variant_count or 0) > agg["best_count"]:
            agg["best_count"] = int(variant_count or 0)
            agg["best_label"] = original

    data = sorted(
        ({"keyword": a["best_label"], "count": a["total_count"]} for a in by_norm.values()),
        key=lambda d: -d["count"],
    )[:10]
    return success_response(data=data, path=str(request.url.path))


@router.get("/analytics")
async def get_search_analytics(
    request: Request,
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get latest search analytics snapshot (all 9 sections)."""
    # Note: the '[]'::jsonb casts from the original query are dropped here
    # (Postgres-only cast syntax) — row[9]/row[10] already fall back to []
    # in Python below when NULL, so behavior is unchanged.
    query = text("""
        SELECT snapshot_date, top_keywords_data, zero_result_data, low_result_data,
               high_exit_data, brand_volume_data, category_demand_data,
               attributes_frequency_data, new_vs_returning_data,
               high_intent_demand_data, not_purchased_data
        FROM search_analytics_snapshot
        ORDER BY snapshot_date DESC
        LIMIT 1
    """)

    result = await db.execute(query)
    row = result.fetchone()

    if not row:
        return success_response(data={
            "snapshot_date": None,
            "top_keywords": [],
            "zero_result": [],
            "low_result": [],
            "high_exit": [],
            "brand_volume": [],
            "category_demand": [],
            "attributes_frequency": [],
            "new_vs_returning": [],
            "high_intent_demand": [],
            "not_purchased_products": [],
        }, path=str(request.url.path))

    # A raw text() query returns JSON columns pre-decoded on Postgres but as
    # raw JSON strings on SQLite — decode defensively either way.
    def _j(value):
        return json.loads(value) if isinstance(value, str) else (value or [])

    row = [row[0]] + [_j(v) for v in row[1:]]

    top_keywords = row[1] or []
    zero_result = row[2] or []
    # Exclude zero-result keywords that also appear in top keywords
    top_kw_norms = {kw["keyword"].lower().strip() for kw in top_keywords if isinstance(kw, dict) and "keyword" in kw}
    zero_result = [z for z in zero_result if isinstance(z, dict) and z.get("keyword", "").lower().strip() not in top_kw_norms]

    return success_response(data={
        "snapshot_date": str(row[0]),
        "top_keywords": top_keywords,
        "zero_result": zero_result,
        "low_result": row[3] or [],
        "high_exit": row[4] or [],
        "brand_volume": row[5] or [],
        "category_demand": row[6] or [],
        "attributes_frequency": row[7] or [],
        "new_vs_returning": row[8] or [],
        "high_intent_demand": row[9] or [],
        "not_purchased_products": row[10] or [],
    }, path=str(request.url.path))
