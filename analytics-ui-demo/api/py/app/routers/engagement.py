"""Engagement Metrics router — Session Duration from Umami API."""

import httpx
import logging
import asyncio
from datetime import datetime
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_analytics_db
from app.schemas.responses import success_response, error_response
from app.dependencies import require_permission
from app.config import get_settings
from app.models.analytics import DailyEngagementMetrics

logger = logging.getLogger(__name__)

# ── Token cache — avoids re-authing on every request ──
_umami_token: str = ""
_umami_token_ts: float = 0.0
_TOKEN_TTL = 3600  # 1 hour


async def _get_umami_token(base_url: str, username: str, password: str) -> str:
    """Get a valid Umami bearer token, using cache when possible. Retries up to 3x."""
    global _umami_token, _umami_token_ts
    import time
    if _umami_token and (time.time() - _umami_token_ts) < _TOKEN_TTL:
        return _umami_token

    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                r = await client.post(
                    f"{base_url}/api/auth/login",
                    json={"username": username, "password": password},
                )
                if r.status_code == 200:
                    token = r.json().get("token", "")
                    if token:
                        _umami_token = token
                        _umami_token_ts = time.time()
                        return token
                logger.warning(f"Umami auth attempt {attempt+1}: status {r.status_code}")
        except Exception as e:
            logger.warning(f"Umami auth attempt {attempt+1} error: {e}")
        if attempt < 2:
            await asyncio.sleep(1.5)

    logger.error("Umami auth failed after 3 attempts")
    return ""

router = APIRouter(
    prefix="/engagement",
    tags=["Engagement"],
    dependencies=[Depends(require_permission("engagement"))],
)


def _val(v):
    """Umami can return flat int or {'value': N} — handle both."""
    if isinstance(v, dict):
        return v.get("value", 0)
    return v or 0


async def _fetch_umami_pageviews(start_date: str, end_date: str) -> dict:
    """Fetch session metrics from Umami API, chunked by 30-day windows to avoid timeouts."""
    settings = get_settings()
    if not settings.UMAMI_WEBSITE_ID or not settings.UMAMI_ENDPOINT:
        return {}

    from datetime import datetime, timedelta
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date + " 23:59:59", "%Y-%m-%d %H:%M:%S")
    base_url = f"https://{settings.UMAMI_ENDPOINT}"
    website_id = settings.UMAMI_WEBSITE_ID

    # Authenticate with retry + caching
    bearer = await _get_umami_token(base_url, settings.UMAMI_USERNAME, settings.UMAMI_PASSWORD)
    if not bearer:
        return {}

    headers = {"Authorization": f"Bearer {bearer}"}

    # Split date range into 30-day chunks (Umami serializes heavy aggregation
    # queries, so chunks are fetched sequentially — concurrency just overloads it).
    totals = {"pageviews": 0, "sessions": 0, "visitors": 0, "bounces": 0, "total_time": 0}
    success = 0
    chunk_start = start_dt
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            while chunk_start < end_dt:
                chunk_end = min(chunk_start + timedelta(days=30), end_dt)
                start_ms = int(chunk_start.timestamp() * 1000)
                end_ms = int(chunk_end.timestamp() * 1000)

                resp = await client.get(
                    f"{base_url}/api/websites/{website_id}/stats",
                    params={"startAt": start_ms, "endAt": end_ms},
                    headers=headers,
                )

                # Token expired — refresh and retry once
                if resp.status_code == 401:
                    global _umami_token, _umami_token_ts
                    _umami_token = ""
                    _umami_token_ts = 0.0
                    bearer = await _get_umami_token(base_url, settings.UMAMI_USERNAME, settings.UMAMI_PASSWORD)
                    if bearer:
                        headers = {"Authorization": f"Bearer {bearer}"}
                        resp = await client.get(
                            f"{base_url}/api/websites/{website_id}/stats",
                            params={"startAt": start_ms, "endAt": end_ms},
                            headers=headers,
                        )

                if resp.status_code == 200:
                    s = resp.json()
                    totals["pageviews"] += _val(s.get("pageviews", 0))
                    totals["sessions"]  += _val(s.get("visits", s.get("sessions", 0)))
                    totals["visitors"]  += _val(s.get("visitors", 0))
                    totals["bounces"]   += _val(s.get("bounces", 0))
                    totals["total_time"] += _val(s.get("totaltime", 0))
                    success += 1
                else:
                    logger.warning(f"Umami chunk {chunk_start.date()} returned {resp.status_code}")

                chunk_start = chunk_end + timedelta(seconds=1)

        return totals if success else {}
    except Exception as e:
        logger.error(f"Umami fetch error: {e!r}")
        return totals if success else {}


async def _fetch_umami_trend(start_date: str, end_date: str) -> dict:
    """Fetch daily session and pageview trend from Umami API."""
    settings = get_settings()
    if not settings.UMAMI_WEBSITE_ID or not settings.UMAMI_ENDPOINT:
        return {"pageviews": [], "sessions": []}

    from datetime import datetime, timedelta
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date + " 23:59:59", "%Y-%m-%d %H:%M:%S")
    base_url = f"https://{settings.UMAMI_ENDPOINT}"
    website_id = settings.UMAMI_WEBSITE_ID

    bearer = await _get_umami_token(base_url, settings.UMAMI_USERNAME, settings.UMAMI_PASSWORD)
    if not bearer:
        return {"pageviews": [], "sessions": []}

    headers = {"Authorization": f"Bearer {bearer}"}
    
    all_pageviews = []
    all_sessions = []

    chunk_start = start_dt
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            while chunk_start < end_dt:
                chunk_end = min(chunk_start + timedelta(days=30), end_dt)
                start_ms = int(chunk_start.timestamp() * 1000)
                end_ms = int(chunk_end.timestamp() * 1000)

                resp = await client.get(
                    f"{base_url}/api/websites/{website_id}/pageviews",
                    params={"startAt": start_ms, "endAt": end_ms, "unit": "day", "timezone": "Asia/Kolkata"},
                    headers=headers,
                )

                # Token expired — refresh and retry once
                if resp.status_code == 401:
                    global _umami_token, _umami_token_ts
                    _umami_token = ""
                    _umami_token_ts = 0.0
                    bearer = await _get_umami_token(base_url, settings.UMAMI_USERNAME, settings.UMAMI_PASSWORD)
                    if bearer:
                        headers = {"Authorization": f"Bearer {bearer}"}
                        resp = await client.get(
                            f"{base_url}/api/websites/{website_id}/pageviews",
                            params={"startAt": start_ms, "endAt": end_ms, "unit": "day", "timezone": "Asia/Kolkata"},
                            headers=headers,
                        )

                if resp.status_code == 200:
                    data = resp.json()
                    all_pageviews.extend(data.get("pageviews", []))
                    all_sessions.extend(data.get("sessions", []))
                else:
                    logger.warning(f"Umami trend fetch returned {resp.status_code}")

                chunk_start = chunk_end + timedelta(seconds=1)

        return {"pageviews": all_pageviews, "sessions": all_sessions}
    except Exception as e:
        logger.error(f"Umami trend fetch error: {e!r}")
        return {"pageviews": all_pageviews, "sessions": all_sessions}


@router.get("")
async def get_engagement(
    request: Request,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_analytics_db),
):
    """Session duration and engagement metrics — read from the cached
    daily_engagement_metrics table (populated from Umami by the
    `engagement-daily` backfill), so this is fast for any date range."""
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date + " 23:59:59", "%Y-%m-%d %H:%M:%S")

    rows_stmt = (
        select(
            DailyEngagementMetrics.date,
            DailyEngagementMetrics.pageviews,
            DailyEngagementMetrics.sessions,
            DailyEngagementMetrics.visitors,
            DailyEngagementMetrics.bounces,
            DailyEngagementMetrics.total_time_seconds,
        )
        .where(
            DailyEngagementMetrics.date >= start_dt,
            DailyEngagementMetrics.date <= end_dt,
        )
        .order_by(DailyEngagementMetrics.date.asc())
    )
    rows = (await db.execute(rows_stmt)).all()

    pageviews = sum(int(r[1]) for r in rows)
    sessions = sum(int(r[2]) for r in rows)
    visitors = sum(int(r[3]) for r in rows)
    bounces = sum(int(r[4]) for r in rows)
    total_time_seconds = sum(float(r[5]) for r in rows)

    avg_session_duration_s = round(total_time_seconds / sessions, 1) if sessions else 0.0
    avg_pages_per_session = round(pageviews / sessions, 2) if sessions else 0.0
    bounce_rate = round((bounces / sessions) * 100, 1) if sessions else 0.0

    daily_trend = [
        {
            "date": r[0].strftime("%Y-%m-%d"),
            "pageviews": int(r[1]),
            "sessions": int(r[2]),
        }
        for r in rows
    ]

    return success_response(
        data={
            "sessions": sessions,
            "visitors": visitors,
            "pageviews": pageviews,
            "bounces": bounces,
            "avg_session_duration_seconds": avg_session_duration_s,
            "avg_session_duration_formatted": f"{int(avg_session_duration_s // 60)}m {int(avg_session_duration_s % 60)}s",
            "avg_pages_per_session": avg_pages_per_session,
            "bounce_rate_pct": bounce_rate,
            "daily_trend": daily_trend,
            "source": "umami" if rows else "unavailable",
            "summary": {
                "sessions": sessions,
                "visitors": visitors,
                "pageviews": pageviews,
                "bounces": bounces,
                "avg_session_duration_seconds": avg_session_duration_s,
                "avg_pages_per_session": avg_pages_per_session,
                "bounce_rate_pct": bounce_rate,
            },
        },
        path=str(request.url.path),
    )
