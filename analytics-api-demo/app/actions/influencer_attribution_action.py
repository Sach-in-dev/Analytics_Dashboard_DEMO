"""Influencer Attribution Action — Umami visitor tracking only.

Pipeline:
  1. Query Umami API for UTM traffic data (last 31 days, day by day)
  2. Identify influencer-related UTM sources (ig, instagram, youtube,
     linktree, wishlink, and any non-standard/non-ad-platform source)
  3. Aggregate views + visitors per (date, influencer_name)
  4. Upsert into influencer_attribution_metrics (analytics DB)

Only needs Umami credentials + analytics DB. No prod DB required.
"""

import logging
from datetime import datetime, timezone, timedelta, date as dt_date
from zoneinfo import ZoneInfo
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.config import get_settings
from app.redis_service import redis_get, redis_set

logger = logging.getLogger(__name__)

UMAMI_TOKEN_KEY = "umami:auth:token"
TOKEN_TTL = 24 * 60 * 60

# UTM sources that represent influencer / creator traffic
INFLUENCER_SOURCES = {
    "ig", "instagram", "youtube", "linktree", "wishlink", "lehlah",
}

# Major ad / email / internal platforms — EXCLUDE from influencer
EXCLUDED_SOURCES = {
    "direct", "organic", "fb", "facebook", "google", "google ads",
    "klaviyo", "whatsapp broadcast", "whatsapp broadcast flow",
    "whatasapp broadcast", "whatsapp", "email campaign", "3demail campaign",
    "broadcast", "an", "th", "paid ads", "chatgpt.com", "perplexity",
    "blogpost", "bbblog", "bblog", "blog", "beauty barn blog",
    "bb team", "fb-sitelink", "fb-websitekeyinfo", "none", "",
}

INFLUENCER_KEYWORDS = ["influencer", "creator", "collab", "ambassador", "wishlink"]


async def _get_umami_token() -> str:
    """Get or refresh Umami auth token."""
    settings = get_settings()
    token = await redis_get(UMAMI_TOKEN_KEY)
    if token:
        return token

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"https://{settings.UMAMI_ENDPOINT}/api/auth/login",
            json={"username": settings.UMAMI_USERNAME, "password": settings.UMAMI_PASSWORD},
        )
        resp.raise_for_status()
        token = resp.json()["token"]
        await redis_set(UMAMI_TOKEN_KEY, token, TOKEN_TTL)
        return token


async def _fetch_umami_utm_for_date(target_date: dt_date) -> dict:
    """Fetch UTM breakdown from Umami for a specific date."""
    settings = get_settings()
    tz = ZoneInfo("Asia/Kolkata")
    start_dt = datetime(target_date.year, target_date.month, target_date.day, tzinfo=tz)
    end_dt = start_dt + timedelta(days=1) - timedelta(seconds=1)

    token = await _get_umami_token()
    body = {
        "type": "utm",
        "filters": {},
        "dateRange": {
            "startDate": start_dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "endDate": end_dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "offset": 0, "num": 24, "unit": "hour", "value": "24hour",
        },
        "parameters": {
            "startDate": start_dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "endDate": end_dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        },
        "websiteId": settings.UMAMI_WEBSITE_ID,
        "timezone": "Asia/Kolkata",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"https://{settings.UMAMI_ENDPOINT}/api/reports/utm",
            json=body,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        resp.raise_for_status()
        return resp.json()


def _is_influencer_source(source: str) -> bool:
    """Check if a utm_source represents influencer traffic."""
    s = source.lower().strip()
    if s in INFLUENCER_SOURCES:
        return True
    if s in EXCLUDED_SOURCES:
        return False
    if any(kw in s for kw in INFLUENCER_KEYWORDS):
        return True
    # Exclude numeric ad-IDs (e.g. '120247...')
    if s.isdigit() or (len(s) > 15 and s.replace(" ", "").isdigit()):
        return False
    # Exclude garbled / encoded strings
    if any(c in s for c in ["=", "&", "?"]):
        return False
    # Remaining non-standard sources are likely influencer codes
    return True


def _derive_influencer_name(source: str) -> str:
    """Derive a clean influencer display name from utm_source."""
    s = source.strip()
    sl = s.lower()

    if sl in ("ig", "instagram"):
        return "Instagram"
    if sl == "youtube":
        return "YouTube"
    if sl == "linktree":
        return "Linktree"
    if sl == "wishlink":
        return "Wishlink"

    # Strip common prefixes
    for prefix in ["influencer_", "creator_", "collab_", "ambassador_",
                    "influencer-", "creator-", "collab-", "ambassador-"]:
        if sl.startswith(prefix):
            s = s[len(prefix):]
            break

    return s.title() if s else "Unknown"


async def process_influencer_attribution(analytics_db: AsyncSession, start_dt: dt_date = None, end_dt: dt_date = None):
    """Influencer visitor tracking: Umami UTM traffic → analytics DB.

    Fetches daily UTM data from Umami, filters for influencer sources,
    and stores view/visitor counts per influencer per day.

    Fields mapped:
      - total_orders     → total page views from this influencer source
      - unique_customers → unique visitors
      - total_revenue    → 0 (visitor-only tracking)
      - avg_order_value  → 0
    """
    logger.info("[INFLUENCER] Starting influencer visitor tracking from Umami")

    if start_dt and end_dt:
        start_date = start_dt
        end_date = end_dt
    else:
        today = dt_date.today()
        start_date = today - timedelta(days=31)
        end_date = today

    influencer_data: dict[tuple, dict] = {}  # (date, name) → {views, visitors}

    target_date = start_date
    while target_date <= end_date:

        try:
            raw = await _fetch_umami_utm_for_date(target_date)
        except Exception as e:
            logger.warning(f"[INFLUENCER] Umami fetch failed for {target_date}: {e}")
            target_date += timedelta(days=1)
            continue

        for item in raw.get("utm_source", []):
            source = (item.get("utm") or "").strip()
            views = item.get("views", 0)
            visitors = item.get("visitors", 0)

            if not source or not _is_influencer_source(source):
                continue

            name = _derive_influencer_name(source)
            key = (target_date, name)

            if key not in influencer_data:
                influencer_data[key] = {"views": 0, "visitors": 0}

            influencer_data[key]["views"] += views
            influencer_data[key]["visitors"] += visitors

        target_date += timedelta(days=1)

    logger.info(f"[INFLUENCER] Found {len(influencer_data)} (date, influencer) combos")

    if not influencer_data:
        logger.warning("[INFLUENCER] No influencer traffic found in Umami")
        return

    # ── Upsert into analytics DB ──
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    upsert_count = 0

    for (row_date, influencer_name), data in influencer_data.items():
        await analytics_db.execute(
            text("""
                INSERT INTO influencer_attribution_metrics
                    (id, date, influencer_name, total_orders, total_revenue,
                     unique_customers, avg_order_value,
                     "createdAt", "updatedAt")
                VALUES
                    (gen_random_uuid()::text, :date, :name,
                     :views, 0, :visitors, 0, :now, :now)
                ON CONFLICT (date, influencer_name) DO UPDATE SET
                    total_orders     = EXCLUDED.total_orders,
                    total_revenue    = EXCLUDED.total_revenue,
                    unique_customers = EXCLUDED.unique_customers,
                    avg_order_value  = EXCLUDED.avg_order_value,
                    "updatedAt"      = EXCLUDED."updatedAt"
            """),
            {
                "date": row_date,
                "name": influencer_name,
                "views": data["views"],
                "visitors": data["visitors"],
                "now": now,
            },
        )
        upsert_count += 1

    await analytics_db.commit()

    total_views = sum(d["views"] for d in influencer_data.values())
    unique_names = len(set(k[1] for k in influencer_data.keys()))
    logger.info(
        f"[INFLUENCER] Done: {upsert_count} rows, "
        f"{unique_names} influencers, {total_views:,} total views"
    )
