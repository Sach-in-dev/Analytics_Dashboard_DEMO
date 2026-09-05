"""UTM monthly action — port of utm-query-monthly-action.ts."""

import logging
from datetime import datetime
import httpx
from urllib.parse import parse_qs
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.utils.date import get_month_range, get_timezone, is_current_month
from app.models.analytics import (
    UtmSourceMonthly, UtmMediumMonthly, UtmCampaignMonthly,
    UtmTermMonthly, UtmContentMonthly,
)
from app.config import get_settings
from app.actions.utm_daily_action import _get_umami_token, _process_utm_data

logger = logging.getLogger(__name__)


async def fetch_and_store_utm_monthly(
    analytics_db: AsyncSession, timezone: str, year: int, month: int,
) -> dict:
    settings = get_settings()
    tz = get_timezone(timezone)
    month_range = get_month_range(year, month, timezone)
    days_in_month = (datetime(year, month + 1, 1) - datetime(year, month, 1)).days if month < 12 else 31

    token = await _get_umami_token()
    request_body = {
        "type": "utm",
        "filters": {},
        "dateRange": {
            "startDate": month_range["start_of_month"].isoformat() + "Z",
            "endDate": month_range["end_of_month"].isoformat() + "Z",
            "offset": 0, "num": days_in_month, "unit": "day",
            "value": f"{days_in_month}day",
        },
        "parameters": {
            "startDate": month_range["start_of_month"].isoformat() + "Z",
            "endDate": month_range["end_of_month"].isoformat() + "Z",
        },
        "websiteId": settings.UMAMI_WEBSITE_ID,
        "timezone": tz,
    }

    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(
            f"https://{settings.UMAMI_ENDPOINT}/api/reports/utm",
            json=request_body,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        resp.raise_for_status()
        raw = resp.json()

    processed = _process_utm_data(raw)

    model_map = {
        "sources": UtmSourceMonthly, "mediums": UtmMediumMonthly,
        "campaigns": UtmCampaignMonthly, "terms": UtmTermMonthly,
        "contents": UtmContentMonthly,
    }
    for utm_type, model in model_map.items():
        for item in processed[utm_type]:
            await analytics_db.execute(
                delete(model).where(model.year == year, model.month == month, model.key == item["key"])
            )
            analytics_db.add(model(year=year, month=month, key=item["key"], views=item["views"], percentage=item["percentage"]))
    await analytics_db.commit()
    logger.info(f"Stored UTM monthly data for {year}-{month}")
    return processed


async def get_utm_data_for_month(
    analytics_db: AsyncSession, year: int, month: int,
) -> dict | None:
    models = {
        "sources": UtmSourceMonthly, "mediums": UtmMediumMonthly,
        "campaigns": UtmCampaignMonthly, "terms": UtmTermMonthly,
        "contents": UtmContentMonthly,
    }
    result = {}
    for key, model in models.items():
        stmt = select(model).where(model.year == year, model.month == month).order_by(model.views.desc())
        rows = (await analytics_db.execute(stmt)).scalars().all()
        result[key] = [{"key": r.key, "views": r.views, "percentage": r.percentage} for r in rows]

    if not result["sources"]:
        return None

    result["totalViews"] = sum(s["views"] for s in result["sources"])
    return result
