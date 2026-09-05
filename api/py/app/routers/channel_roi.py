"""Channel ROI router — exposes channel-level ROI/ROAS analytics.
Supports date filtering and spend management. Reads only from analytics DB.
"""

from datetime import date, datetime
from fastapi import APIRouter, Depends, Request, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, text
from app.database import get_analytics_db
from app.schemas.responses import success_response, error_response
from app.dependencies import require_permission
from app.models.analytics import ChannelRoiMetrics, ChannelSpendConfig

router = APIRouter(
    prefix="/channel-roi",
    tags=["Channel ROI"],
    dependencies=[Depends(require_permission("channel_roi"))],
)


def _parse_date(date_str: str | None) -> date | None:
    """Parse YYYY-MM-DD string to date, returns None on failure."""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return None


@router.get("")
async def get_channel_roi(
    request: Request,
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get channel ROI summary + per-channel breakdown + daily trend."""
    start = _parse_date(start_date)
    end = _parse_date(end_date)

    # ── Base filter builder ──
    def _apply_filters(stmt):
        if start:
            stmt = stmt.where(ChannelRoiMetrics.date >= start)
        if end:
            stmt = stmt.where(ChannelRoiMetrics.date <= end)
        return stmt

    # ── Summary: aggregated totals ──
    summary_stmt = select(
        func.coalesce(func.sum(ChannelRoiMetrics.total_revenue), 0).label("total_revenue"),
        func.coalesce(func.sum(ChannelRoiMetrics.total_spend), 0).label("total_spend"),
        func.coalesce(func.sum(ChannelRoiMetrics.total_orders), 0).label("total_orders"),
    )
    summary_stmt = _apply_filters(summary_stmt)
    result = await db.execute(summary_stmt)
    row = result.one()

    total_revenue = float(row[0])
    total_spend = float(row[1])
    total_orders = int(row[2])

    # Compute overall ROI and ROAS
    overall_roi = round((total_revenue - total_spend) / total_spend, 2) if total_spend > 0 else 0.0
    overall_roas = round(total_revenue / total_spend, 2) if total_spend > 0 else 0.0

    # ── Per-channel breakdown ──
    channel_stmt = (
        select(
            ChannelRoiMetrics.channel,
            func.sum(ChannelRoiMetrics.total_revenue).label("total_revenue"),
            func.sum(ChannelRoiMetrics.total_spend).label("total_spend"),
            func.sum(ChannelRoiMetrics.total_orders).label("total_orders"),
            func.sum(ChannelRoiMetrics.unique_users).label("unique_users"),
        )
        .group_by(ChannelRoiMetrics.channel)
        .having(func.sum(ChannelRoiMetrics.total_orders) > 0)
        .order_by(desc("total_revenue"))
    )
    channel_stmt = _apply_filters(channel_stmt)
    channel_result = await db.execute(channel_stmt)
    channel_rows = channel_result.all()

    channels = []
    best_channel = None
    best_roi = float("-inf")

    for r in channel_rows:
        ch_revenue = float(r[1])
        ch_spend = float(r[2])
        ch_orders = int(r[3])
        ch_users = int(r[4])
        ch_roi = round((ch_revenue - ch_spend) / ch_spend, 2) if ch_spend > 0 else 0.0
        ch_roas = round(ch_revenue / ch_spend, 2) if ch_spend > 0 else 0.0
        ch_aov = round(ch_revenue / ch_orders, 2) if ch_orders > 0 else 0.0

        channel_entry = {
            "channel": r[0],
            "total_revenue": round(ch_revenue, 2),
            "total_spend": round(ch_spend, 2),
            "roi": ch_roi,
            "roas": ch_roas,
            "total_orders": ch_orders,
            "unique_users": ch_users,
            "aov": ch_aov,
        }
        channels.append(channel_entry)

        if ch_roi > best_roi:
            best_roi = ch_roi
            best_channel = r[0]

    # ── Daily trend data ──
    trend_stmt = (
        select(
            ChannelRoiMetrics.date,
            func.sum(ChannelRoiMetrics.total_revenue).label("total_revenue"),
            func.sum(ChannelRoiMetrics.total_spend).label("total_spend"),
            func.sum(ChannelRoiMetrics.total_orders).label("total_orders"),
        )
        .group_by(ChannelRoiMetrics.date)
        .order_by(ChannelRoiMetrics.date)
    )
    trend_stmt = _apply_filters(trend_stmt)
    trend_result = await db.execute(trend_stmt)
    trend_rows = trend_result.all()

    trend = []
    for t in trend_rows:
        t_revenue = float(t[1])
        t_spend = float(t[2])
        t_roi = round((t_revenue - t_spend) / t_spend, 2) if t_spend > 0 else 0.0
        trend.append({
            "date": t[0].isoformat(),
            "total_revenue": round(t_revenue, 2),
            "total_spend": round(t_spend, 2),
            "roi": t_roi,
            "total_orders": int(t[3]),
        })

    summary = {
        "total_revenue": round(total_revenue, 2),
        "total_spend": round(total_spend, 2),
        "overall_roi": overall_roi,
        "overall_roas": overall_roas,
        "total_orders": total_orders,
        "best_channel": best_channel or "N/A",
        "best_channel_roi": round(best_roi, 2) if best_roi != float("-inf") else 0.0,
    }

    data = {
        "summary": summary,
        "channels": channels,
        "trend": trend,
    }

    return success_response(data=data, path=str(request.url.path))


# ── Spend Config Endpoints ──

class SpendEntry(BaseModel):
    date: str
    channel: str
    spend: float


@router.get("/spend")
async def get_spend_config(
    request: Request,
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Get current spend configuration entries."""
    start = _parse_date(start_date)
    end = _parse_date(end_date)

    stmt = select(
        ChannelSpendConfig.date,
        ChannelSpendConfig.channel,
        ChannelSpendConfig.spend,
    ).order_by(ChannelSpendConfig.date.desc(), ChannelSpendConfig.channel)

    if start:
        stmt = stmt.where(ChannelSpendConfig.date >= start)
    if end:
        stmt = stmt.where(ChannelSpendConfig.date <= end)

    result = await db.execute(stmt)
    rows = result.all()

    entries = [
        {"date": r[0].isoformat(), "channel": r[1], "spend": round(float(r[2]), 2)}
        for r in rows
    ]

    return success_response(data={"entries": entries, "count": len(entries)}, path=str(request.url.path))


@router.post("/spend")
async def set_spend_config(
    request: Request,
    entry: SpendEntry,
    db: AsyncSession = Depends(get_analytics_db),
):
    """Set spend for a channel on a specific date (upsert)."""
    target_date = _parse_date(entry.date)
    if not target_date:
        return error_response(message="Invalid date format. Use YYYY-MM-DD.", path=str(request.url.path), status_code=400)

    if entry.spend < 0:
        return error_response(message="Spend cannot be negative.", path=str(request.url.path), status_code=400)

    from datetime import timezone as tz
    import uuid
    now = datetime.now(tz.utc).replace(tzinfo=None)

    # gen_random_uuid() is a Postgres-only function — generate the id in
    # Python instead so this insert works on any SQL dialect.
    await db.execute(
        text("""
            INSERT INTO channel_spend_config
                (id, date, channel, spend, "createdAt", "updatedAt")
            VALUES
                (:id, :date, :channel, :spend, :now, :now)
            ON CONFLICT (date, channel) DO UPDATE SET
                spend = EXCLUDED.spend,
                "updatedAt" = EXCLUDED."updatedAt"
        """),
        {
            "id": str(uuid.uuid4()),
            "date": target_date,
            "channel": entry.channel.strip(),
            "spend": round(entry.spend, 2),
            "now": now,
        },
    )
    await db.commit()

    return success_response(
        data={"date": target_date.isoformat(), "channel": entry.channel.strip(), "spend": round(entry.spend, 2)},
        path=str(request.url.path),
        message="Spend config updated successfully",
    )
