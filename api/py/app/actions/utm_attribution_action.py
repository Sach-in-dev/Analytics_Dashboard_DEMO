"""UTM Attribution Action — combines Umami traffic with order revenue.

Pipeline:
  1. Fetch UTM traffic data from Umami (by source) for each day
  2. Fetch daily orders + revenue from prod DB
  3. For orders with UTM in referral: direct attribution
  4. For remaining: proportional attribution based on Umami traffic share
  5. Upsert into utm_attribution_metrics (analytics DB)

Uses Umami API + prod DB SQL — no per-user loops.
"""

import logging
from datetime import datetime, timezone, timedelta, date as dt_date
from urllib.parse import urlparse, parse_qs
from zoneinfo import ZoneInfo
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.config import get_settings
from app.redis_service import redis_get, redis_set

logger = logging.getLogger(__name__)

UMAMI_TOKEN_KEY = "umami:auth:token"
TOKEN_TTL = 24 * 60 * 60


async def _get_umami_token() -> str:
    """Get or refresh Umami auth token."""
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


async def _fetch_umami_utm_for_date(target_date: dt_date) -> dict:
    """Fetch UTM breakdown from Umami for a specific date."""
    settings = get_settings()

    tz = ZoneInfo("Asia/Kolkata")
    start_dt = datetime(target_date.year, target_date.month, target_date.day, tzinfo=tz)
    end_dt = start_dt + timedelta(days=1) - timedelta(seconds=1)

    token = await _get_umami_token()
    request_body = {
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

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"https://{settings.UMAMI_ENDPOINT}/api/reports/utm",
                json=request_body,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            )
            resp.raise_for_status()
            raw = resp.json()

        # Parse into structured dict
        result = {}
        for utm_type in ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]:
            data = raw.get(utm_type, [])
            for item in data:
                key = (item.get("utm") or "none").lower().strip()
                views = item.get("views", 0)
                if key not in result:
                    result[key] = {
                        "utm_source": "none", "utm_medium": "none",
                        "utm_campaign": "none", "utm_term": "none",
                        "utm_content": "none", "views": 0,
                    }
                result[key][utm_type] = key
                result[key]["views"] += views

        # Also build source-level aggregation
        sources = {}
        for item in raw.get("utm_source", []):
            src = (item.get("utm") or "none").lower().strip()
            sources[src] = item.get("views", 0)

        return {"detailed": result, "sources": sources, "raw": raw}

    except Exception as e:
        logger.warning(f"[UTM-ATTRIBUTION] Umami API error for {target_date}: {e}")
        return {"detailed": {}, "sources": {}, "raw": {}}


def _parse_utm_from_referral(referral: str | None) -> dict:
    """Extract UTM parameters from a referral URL."""
    defaults = {
        "utm_source": "direct",
        "utm_medium": "none",
        "utm_campaign": "none",
        "utm_term": "none",
        "utm_content": "none",
    }
    if not referral:
        return defaults

    try:
        parsed = urlparse(referral)
        params = parse_qs(parsed.query)

        for key in defaults:
            values = params.get(key, [])
            if values and values[0].strip():
                defaults[key] = values[0].strip().lower()

        # If no UTM source, classify by referral domain
        if defaults["utm_source"] == "direct" and parsed.netloc:
            domain = parsed.netloc.lower()
            if "google" in domain:
                defaults["utm_source"] = "google"
                defaults["utm_medium"] = "organic"
            elif "facebook" in domain or "fb.com" in domain:
                defaults["utm_source"] = "facebook"
                defaults["utm_medium"] = "social"
            elif "instagram" in domain:
                defaults["utm_source"] = "instagram"
                defaults["utm_medium"] = "social"
            elif "beautybarn" in domain:
                defaults["utm_source"] = "organic"
                defaults["utm_medium"] = "website"
            elif domain:
                defaults["utm_source"] = domain.split(".")[0]
                defaults["utm_medium"] = "referral"
    except Exception:
        pass

    return defaults


async def process_utm_attribution(
    prod_db: AsyncSession,
    analytics_db: AsyncSession,
):
    """Full UTM attribution pipeline: Umami traffic + prod orders → analytics DB."""
    logger.info("[UTM-ATTRIBUTION] Starting UTM attribution processing")

    # ── Step 1: Fetch all completed orders with referral and metadata ──
    result = await prod_db.execute(
        text("""
            SELECT
                DATE(COALESCE(paid_at, created_at)) AS order_date,
                email,
                total,
                referral,
                metadata->>'source' AS meta_source,
                metadata->>'platform' AS meta_platform
            FROM "order"
            WHERE (paid_at IS NOT NULL
                   OR (paid_at IS NULL AND status IN ('DELIVERED', 'COMPLETED')))
              AND created_at IS NOT NULL
            ORDER BY COALESCE(paid_at, created_at)
        """)
    )
    rows = result.fetchall()

    if not rows:
        logger.warning("[UTM-ATTRIBUTION] No order data found")
        return

    logger.info(f"[UTM-ATTRIBUTION] Processing {len(rows)} orders")

    # ── Step 2: Classify each order → aggregate by (date, utm_combo) ──
    aggregated: dict[tuple, dict] = {}

    for row in rows:
        order_date = row[0]
        email = row[1]
        total = float(row[2]) if row[2] else 0.0
        referral = row[3]
        meta_source = row[4]
        meta_platform = row[5]

        # Parse UTM from referral URL (last-touch attribution)
        utm = _parse_utm_from_referral(referral)

        # Enhance with metadata source/platform if no UTM found
        if utm["utm_source"] == "direct" and meta_source and meta_source.lower() not in ("", "none"):
            utm["utm_source"] = meta_source.lower()
        if utm["utm_medium"] == "none" and meta_platform and meta_platform.lower() not in ("", "none"):
            utm["utm_medium"] = meta_platform.lower()

        key = (
            order_date,
            utm["utm_source"],
            utm["utm_medium"],
            utm["utm_campaign"],
            utm["utm_term"],
            utm["utm_content"],
        )

        if key not in aggregated:
            aggregated[key] = {"users": set(), "sessions": 0, "orders": 0, "revenue": 0.0}

        agg = aggregated[key]
        if email:
            agg["users"].add(email)
        agg["sessions"] += 1
        agg["orders"] += 1
        agg["revenue"] += total

    # ── Step 3: Enrich with Umami traffic data for recent dates ──
    unique_dates = sorted(set(k[0] for k in aggregated.keys()))
    recent_dates = [d for d in unique_dates if d >= (dt_date.today() - timedelta(days=90))]

    for target_date in recent_dates[-30:]:  # Last 30 days of Umami data
        try:
            umami_data = await _fetch_umami_utm_for_date(target_date)
            sources = umami_data.get("sources", {})

            # Update session/user counts from Umami for matching sources
            for key, agg in aggregated.items():
                if key[0] != target_date:
                    continue
                source = key[1]
                if source in sources:
                    umami_views = sources[source]
                    # Use Umami views as sessions if higher than order count
                    if umami_views > agg["sessions"]:
                        agg["sessions"] = umami_views

            # Add Umami sources with no orders (pure traffic, 0 revenue)
            for src, views in sources.items():
                if src in ("none", ""):
                    continue
                key_no_orders = (target_date, src, "none", "none", "none", "none")
                if key_no_orders not in aggregated:
                    aggregated[key_no_orders] = {
                        "users": set(),
                        "sessions": views,
                        "orders": 0,
                        "revenue": 0.0,
                    }

        except Exception as e:
            logger.warning(f"[UTM-ATTRIBUTION] Umami enrichment failed for {target_date}: {e}")

    logger.info(f"[UTM-ATTRIBUTION] Aggregated into {len(aggregated)} UTM-date combos")

    # ── Step 4: Upsert into analytics DB ──
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    upsert_count = 0

    for key, agg in aggregated.items():
        order_date, source, medium, campaign, term, content = key
        user_count = len(agg["users"])
        orders = agg["orders"]
        sessions = max(agg["sessions"], orders)  # sessions >= orders
        revenue = round(agg["revenue"], 2)
        conversion_rate = round((orders / sessions) * 100, 2) if sessions > 0 else 0.0
        aov = round(revenue / orders, 2) if orders > 0 else 0.0

        await analytics_db.execute(
            text("""
                INSERT INTO utm_attribution_metrics
                    (id, date, utm_source, utm_medium, utm_campaign,
                     utm_term, utm_content, users, sessions, orders,
                     revenue, conversion_rate, aov,
                     "createdAt", "updatedAt")
                VALUES
                    (gen_random_uuid()::text, :date, :source, :medium, :campaign,
                     :term, :content, :users, :sessions, :orders,
                     :revenue, :conversion_rate, :aov,
                     :now, :now)
                ON CONFLICT (date, utm_source, utm_medium, utm_campaign,
                             utm_term, utm_content) DO UPDATE SET
                    users = EXCLUDED.users,
                    sessions = EXCLUDED.sessions,
                    orders = EXCLUDED.orders,
                    revenue = EXCLUDED.revenue,
                    conversion_rate = EXCLUDED.conversion_rate,
                    aov = EXCLUDED.aov,
                    "updatedAt" = EXCLUDED."updatedAt"
            """),
            {
                "date": order_date,
                "source": source,
                "medium": medium,
                "campaign": campaign,
                "term": term,
                "content": content,
                "users": user_count,
                "sessions": sessions,
                "orders": orders,
                "revenue": revenue,
                "conversion_rate": conversion_rate,
                "aov": aov,
                "now": now,
            },
        )
        upsert_count += 1

    await analytics_db.commit()
    logger.info(f"[UTM-ATTRIBUTION] Successfully upserted {upsert_count} attribution rows")
