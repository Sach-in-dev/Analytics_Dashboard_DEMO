"""UTM daily action — port of utm-query-today-action.ts."""

import logging
from urllib.parse import parse_qs, urlencode
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.utils.date import get_date, get_timezone, is_current_day
from app.models.analytics import (
    UtmSourceDaily, UtmMediumDaily, UtmCampaignDaily,
    UtmTermDaily, UtmContentDaily,
)
from app.config import get_settings
from app.redis_service import redis_get, redis_set

logger = logging.getLogger(__name__)

UMAMI_TOKEN_KEY = "umami:auth:token"
TOKEN_TTL = 24 * 60 * 60  # 24 hours


async def _get_umami_token() -> str:
    settings = get_settings()
    token = await redis_get(UMAMI_TOKEN_KEY)
    if token:
        return token

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://{settings.UMAMI_ENDPOINT}/api/auth/login",
            json={"username": settings.UMAMI_USERNAME, "password": settings.UMAMI_PASSWORD},
        )
        resp.raise_for_status()
        token = resp.json()["token"]
        await redis_set(UMAMI_TOKEN_KEY, token, TOKEN_TTL)
        return token


def _process_utm_data(raw: dict) -> dict:
    result = {}
    mapping = {
        "utm_source": "sources",
        "utm_medium": "mediums",
        "utm_campaign": "campaigns",
        "utm_term": "terms",
        "utm_content": "contents"
    }

    for umami_key, result_key in mapping.items():
        data = raw.get(umami_key, [])
        total_views = sum(item.get("views", 0) for item in data)
        items = []
        for item in data:
            v = item.get("views", 0)
            percentage = round((v / total_views) * 100) if total_views > 0 else 0
            items.append({"key": item.get("utm") or "None", "views": v, "percentage": percentage})
        
        # Sort by views descending
        items.sort(key=lambda x: x["views"], reverse=True)
        result[result_key] = items

    result["totalViews"] = sum(x["views"] for x in result.get("sources", []))
    return result


async def fetch_and_store_utm_daily(
    analytics_db: AsyncSession, timezone: str, date: str,
) -> dict:
    settings = get_settings()
    tz = get_timezone(timezone)
    date_range = get_date(date=date, timezone=timezone)

    token = await _get_umami_token()
    request_body = {
        "type": "utm",
        "filters": {},
        "dateRange": {
            "startDate": date_range["start_of_day"].isoformat() + "Z",
            "endDate": date_range["end_of_day"].isoformat() + "Z",
            "offset": 0, "num": 24, "unit": "hour", "value": "24hour",
        },
        "parameters": {
            "startDate": date_range["start_of_day"].isoformat() + "Z",
            "endDate": date_range["end_of_day"].isoformat() + "Z",
        },
        "websiteId": settings.UMAMI_WEBSITE_ID,
        "timezone": tz,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"https://{settings.UMAMI_ENDPOINT}/api/reports/utm",
            json=request_body,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        resp.raise_for_status()
        raw = resp.json()

    processed = _process_utm_data(raw)
    start_of_day = date_range["start_of_day"]

    # Store in DB
    model_map = {
        "sources": UtmSourceDaily, "mediums": UtmMediumDaily,
        "campaigns": UtmCampaignDaily, "terms": UtmTermDaily, "contents": UtmContentDaily,
    }
    for utm_type, model in model_map.items():
        for item in processed[utm_type]:
            await analytics_db.execute(
                delete(model).where(model.date == start_of_day, model.key == item["key"])
            )
            analytics_db.add(model(date=start_of_day, key=item["key"], views=item["views"], percentage=item["percentage"]))
    await analytics_db.commit()
    logger.info(f"Stored UTM daily data for date: {date}")
    return processed


async def get_utm_data_for_date(
    analytics_db: AsyncSession, timezone: str, date: str,
) -> dict | None:
    date_range = get_date(date=date, timezone=timezone)
    start = date_range["start_of_day"]
    end = date_range["end_of_day"]

    models = {
        "sources": UtmSourceDaily, "mediums": UtmMediumDaily,
        "campaigns": UtmCampaignDaily, "terms": UtmTermDaily,
        "contents": UtmContentDaily,
    }
    result = {}
    for key, model in models.items():
        stmt = select(model).where(model.date >= start, model.date <= end).order_by(model.views.desc())
        rows = (await analytics_db.execute(stmt)).scalars().all()
        result[key] = [{"key": r.key, "views": r.views, "percentage": r.percentage} for r in rows]

    if not result["sources"]:
        return None

    result["totalViews"] = sum(s["views"] for s in result["sources"])
    return result
