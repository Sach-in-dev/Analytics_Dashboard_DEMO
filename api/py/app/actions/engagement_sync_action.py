"""Engagement sync — pulls one day of engagement stats from Umami and caches
it in daily_engagement_metrics, so the Engagement page reads from the DB (fast)
like every other metric instead of hitting the slow Umami API live."""

import logging
import time
import httpx
from datetime import datetime
from sqlalchemy import text
from app.config import get_settings
from app.database import AnalyticsSessionLocal
from app.models.analytics import gen_uuid

logger = logging.getLogger(__name__)

# In-memory token cache — avoids re-authing on every day of a backfill loop.
_token = ""
_token_ts = 0.0
_TOKEN_TTL = 3600  # 1 hour


async def _umami_token() -> str:
    global _token, _token_ts
    if _token and (time.time() - _token_ts) < _TOKEN_TTL:
        return _token
    s = get_settings()
    async with httpx.AsyncClient(timeout=20.0) as c:
        r = await c.post(
            f"https://{s.UMAMI_ENDPOINT}/api/auth/login",
            json={"username": s.UMAMI_USERNAME, "password": s.UMAMI_PASSWORD},
        )
        r.raise_for_status()
        _token = r.json().get("token", "")
        _token_ts = time.time()
        return _token


def _val(v):
    """Umami can return a flat int or {'value': N} — handle both."""
    if isinstance(v, dict):
        return v.get("value", 0)
    return v or 0


async def sync_daily_engagement(target_date: str):
    """Fetch one day of engagement stats from Umami and upsert into
    daily_engagement_metrics. A single-day window responds fast (~1-2s)."""
    s = get_settings()
    if not s.UMAMI_WEBSITE_ID or not s.UMAMI_ENDPOINT:
        logger.warning("[engagement-sync] Umami not configured — skipping")
        return

    start_dt = datetime.strptime(f"{target_date} 00:00:00", "%Y-%m-%d %H:%M:%S")
    end_dt = datetime.strptime(f"{target_date} 23:59:59", "%Y-%m-%d %H:%M:%S")
    start_ms = int(start_dt.timestamp() * 1000)
    end_ms = int(end_dt.timestamp() * 1000)
    date_only = datetime.strptime(target_date, "%Y-%m-%d")

    url = f"https://{s.UMAMI_ENDPOINT}/api/websites/{s.UMAMI_WEBSITE_ID}/stats"
    token = await _umami_token()
    async with httpx.AsyncClient(timeout=60.0) as c:
        resp = await c.get(
            url, params={"startAt": start_ms, "endAt": end_ms},
            headers={"Authorization": f"Bearer {token}"},
        )
        if resp.status_code == 401:
            global _token, _token_ts
            _token = ""
            _token_ts = 0.0
            token = await _umami_token()
            resp = await c.get(
                url, params={"startAt": start_ms, "endAt": end_ms},
                headers={"Authorization": f"Bearer {token}"},
            )
        resp.raise_for_status()
        st = resp.json()

    pageviews = int(_val(st.get("pageviews", 0)))
    sessions = int(_val(st.get("visits", st.get("sessions", 0))))
    visitors = int(_val(st.get("visitors", 0)))
    bounces = int(_val(st.get("bounces", 0)))
    total_time = float(_val(st.get("totaltime", 0)))

    async with AnalyticsSessionLocal() as db:
        exists = await db.execute(
            text("SELECT id FROM daily_engagement_metrics WHERE date = :d"),
            {"d": date_only},
        )
        rid = exists.scalar()
        if rid:
            await db.execute(
                text("""
                    UPDATE daily_engagement_metrics
                    SET pageviews = :pv, sessions = :se, visitors = :vi,
                        bounces = :bo, total_time_seconds = :tt
                    WHERE id = :id
                """),
                {"pv": pageviews, "se": sessions, "vi": visitors,
                 "bo": bounces, "tt": total_time, "id": rid},
            )
        else:
            await db.execute(
                text("""
                    INSERT INTO daily_engagement_metrics
                        (id, date, pageviews, sessions, visitors, bounces, total_time_seconds, "createdAt")
                    VALUES (:id, :date, :pv, :se, :vi, :bo, :tt, :ca)
                """),
                {"id": gen_uuid(), "date": date_only, "pv": pageviews, "se": sessions,
                 "vi": visitors, "bo": bounces, "tt": total_time, "ca": datetime.utcnow()},
            )
        await db.commit()

    logger.info(f"[engagement-sync] {target_date}: pv={pageviews} sess={sessions} vis={visitors}")
