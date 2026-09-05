"""Meta Pixel Events router — fetches event/conversion data from Meta Marketing API.

GET /meta-events — returns pixel conversion events (Purchase, Add to Cart, etc.)
    aggregated from the account-level insights `actions` field.

This is a LIVE query to Meta API — no analytics DB table needed.
Uses the same META_ADS_ACCESS_TOKEN and META_ADS_ACCOUNT_ID as other Meta routers.
"""

import logging
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, Request, Query
from app.schemas.responses import success_response, error_response
from app.dependencies import require_permission
from app.config import get_settings
import httpx

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/meta-events",
    tags=["Meta Pixel Events"],
    dependencies=[Depends(require_permission("events"))],
)

# ── Mapping: Meta action_type → human-readable display name ──
ACTION_TYPE_MAP = {
    "offsite_conversion.fb_pixel_purchase": "Purchases",
    "offsite_conversion.fb_pixel_add_to_cart": "Add to Cart",
    "offsite_conversion.fb_pixel_initiate_checkout": "Initiate Checkout",
    "offsite_conversion.fb_pixel_view_content": "View Content",
    "offsite_conversion.fb_pixel_search": "Search",
    "offsite_conversion.fb_pixel_add_payment_info": "Add Payment Info",
    "offsite_conversion.fb_pixel_lead": "Leads",
    "offsite_conversion.fb_pixel_complete_registration": "Complete Registration",
    "link_click": "Link Clicks",
    "landing_page_view": "Landing Page Views",
    "page_engagement": "Page Engagement",
    "post_engagement": "Post Engagement",
    "video_view": "Video Views",
    "onsite_conversion.messaging_conversation_started_7d": "Conversations Started",
}

# Priority order for display (events we care about most appear first)
DISPLAY_ORDER = [
    "Purchases",
    "Add to Cart",
    "Initiate Checkout",
    "View Content",
    "Search",
    "Add Payment Info",
    "Leads",
    "Complete Registration",
    "Link Clicks",
    "Landing Page Views",
    "Page Engagement",
    "Post Engagement",
    "Video Views",
    "Conversations Started",
]


def _generate_demo_events(start_date: date, end_date: date) -> dict:
    """Deterministic synthetic Meta Pixel event data for the demo build —
    same shape as a real Marketing API response, no network call."""
    import random

    # Funnel-shaped daily volumes: each stage a portion of the one above it.
    stage_specs = [
        ("offsite_conversion.fb_pixel_view_content", "View Content", 900, 1500, 1.0),
        ("offsite_conversion.fb_pixel_add_to_cart", "Add to Cart", 0, 0, 0.32),
        ("offsite_conversion.fb_pixel_initiate_checkout", "Initiate Checkout", 0, 0, 0.55),
        ("offsite_conversion.fb_pixel_add_payment_info", "Add Payment Info", 0, 0, 0.7),
        ("offsite_conversion.fb_pixel_purchase", "Purchases", 0, 0, 0.6),
        ("offsite_conversion.fb_pixel_search", "Search", 300, 600, 1.0),
        ("link_click", "Link Clicks", 1400, 2600, 1.0),
        ("landing_page_view", "Landing Page Views", 1100, 2000, 1.0),
        ("page_engagement", "Page Engagement", 2000, 3600, 1.0),
        ("post_engagement", "Post Engagement", 400, 900, 1.0),
        ("video_view", "Video Views", 600, 1400, 1.0),
        ("onsite_conversion.messaging_conversation_started_7d", "Conversations Started", 20, 70, 1.0),
    ]

    rng = random.Random(42)
    events: dict[str, dict] = {}
    day = start_date
    while day <= end_date:
        weekday_mult = 1.25 if day.weekday() >= 5 else 1.0
        base_views = rng.randint(900, 1500) * weekday_mult
        prev_count = base_views
        for action_type, display_name, lo, hi, ratio in stage_specs:
            if lo or hi:
                count = int(rng.randint(lo, hi) * weekday_mult)
                prev_count = count if action_type.endswith("view_content") else prev_count
            else:
                count = max(0, int(prev_count * ratio * rng.uniform(0.85, 1.15)))
                prev_count = count
            avg_value = 850.0 if "purchase" in action_type else 0.0
            value = round(count * avg_value * rng.uniform(0.8, 1.2), 2) if avg_value else 0.0

            info = events.setdefault(action_type, {
                "display_name": display_name, "total_count": 0, "total_value": 0.0, "daily": [],
            })
            info["total_count"] += count
            info["total_value"] += value
            info["daily"].append({"date": day.isoformat(), "count": count, "value": round(value, 2)})
        day += timedelta(days=1)

    return events


async def _fetch_meta_events(
    start_date: date, end_date: date
) -> dict:
    """Fetch account-level insights with actions breakdown from Meta Marketing API.

    Returns dict of { action_type: { display_name, total_count, daily: [{date, count}] } }
    """
    settings = get_settings()

    if settings.DEMO_MODE:
        return _generate_demo_events(start_date, end_date)

    access_token = settings.META_ADS_ACCESS_TOKEN
    account_id = settings.META_ADS_ACCOUNT_ID

    if not access_token or not account_id:
        logger.warning("[META_EVENTS] META_ADS_ACCESS_TOKEN or META_ADS_ACCOUNT_ID not set")
        return {}

    url = f"https://graph.facebook.com/v21.0/{account_id}/insights"

    params = {
        "access_token": access_token,
        "fields": "actions,action_values",
        "time_range": f'{{"since":"{start_date.isoformat()}","until":"{end_date.isoformat()}"}}',
        "time_increment": 1,  # Daily breakdown
        "level": "account",
        "limit": 500,
    }

    events: dict[str, dict] = {}

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            while True:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                result = resp.json()

                for row in result.get("data", []):
                    row_date = row.get("date_start", "")
                    actions = row.get("actions", [])
                    action_values = row.get("action_values", [])

                    # Build value lookup for this row
                    value_lookup: dict[str, float] = {}
                    for av in action_values:
                        at = av.get("action_type", "")
                        value_lookup[at] = float(av.get("value", 0))

                    for action in actions:
                        action_type = action.get("action_type", "")
                        display_name = ACTION_TYPE_MAP.get(action_type)
                        if not display_name:
                            continue  # Skip unknown action types

                        count = int(action.get("value", 0))
                        value = value_lookup.get(action_type, 0.0)

                        if action_type not in events:
                            events[action_type] = {
                                "display_name": display_name,
                                "total_count": 0,
                                "total_value": 0.0,
                                "daily": [],
                            }

                        events[action_type]["total_count"] += count
                        events[action_type]["total_value"] += value
                        events[action_type]["daily"].append({
                            "date": row_date,
                            "count": count,
                            "value": round(value, 2),
                        })

                # Handle pagination
                paging = result.get("paging", {})
                next_url = paging.get("next")
                if next_url:
                    url = next_url
                    params = {}
                else:
                    break

        logger.info(f"[META_EVENTS] Fetched {len(events)} event types from Meta API")

    except httpx.HTTPStatusError as e:
        logger.error(f"[META_EVENTS] Meta API HTTP error {e.response.status_code}: {e.response.text[:500]}")
    except httpx.RequestError as e:
        logger.error(f"[META_EVENTS] Meta API request error: {e}")
    except Exception as e:
        logger.error(f"[META_EVENTS] Unexpected error: {e}")

    return events


@router.get("")
async def get_meta_events(
    request: Request,
    start_date: str | None = Query(None, description="Start date YYYY-MM-DD"),
    end_date: str | None = Query(None, description="End date YYYY-MM-DD"),
):
    """Get Meta Pixel event data from the Marketing API."""
    try:
        # ── Date range handling ──
        if start_date and end_date:
            try:
                d_start = datetime.strptime(start_date, "%Y-%m-%d").date()
                d_end = datetime.strptime(end_date, "%Y-%m-%d").date()
            except ValueError:
                return error_response(
                    message="Invalid date format. Use YYYY-MM-DD.",
                    status_code=400,
                    path=str(request.url.path),
                )
        else:
            d_end = date.today() - timedelta(days=1)
            d_start = d_end - timedelta(days=29)

        # ── Fetch events from Meta ──
        raw_events = await _fetch_meta_events(d_start, d_end)

        if not raw_events:
            return success_response(
                data={
                    "events": [],
                    "summary": {
                        "total_events": 0,
                        "total_event_types": 0,
                        "total_value": 0.0,
                        "date_range": {
                            "start": d_start.isoformat(),
                            "end": d_end.isoformat(),
                        },
                    },
                },
                message="No Meta events data available. Check META_ADS credentials.",
                path=str(request.url.path),
            )

        # ── Build response ──
        events_list = []
        total_events = 0
        total_value = 0.0

        for action_type, info in raw_events.items():
            total_events += info["total_count"]
            total_value += info["total_value"]

            # Sort daily data chronologically
            daily_sorted = sorted(info["daily"], key=lambda d: d["date"])

            events_list.append({
                "event_name": info["display_name"],
                "action_type": action_type,
                "total_count": info["total_count"],
                "total_value": round(info["total_value"], 2),
                "daily": daily_sorted,
            })

        # Sort by display priority
        def sort_key(e):
            try:
                return DISPLAY_ORDER.index(e["event_name"])
            except ValueError:
                return 999
        events_list.sort(key=sort_key)

        # Compute percentage share
        for event in events_list:
            event["percentage"] = (
                round((event["total_count"] / total_events) * 100, 2)
                if total_events > 0 else 0.0
            )

        return success_response(
            data={
                "events": events_list,
                "summary": {
                    "total_events": total_events,
                    "total_event_types": len(events_list),
                    "total_value": round(total_value, 2),
                    "purchases": next(
                        (e["total_count"] for e in events_list if e["event_name"] == "Purchases"), 0
                    ),
                    "add_to_cart": next(
                        (e["total_count"] for e in events_list if e["event_name"] == "Add to Cart"), 0
                    ),
                    "view_content": next(
                        (e["total_count"] for e in events_list if e["event_name"] == "View Content"), 0
                    ),
                    "date_range": {
                        "start": d_start.isoformat(),
                        "end": d_end.isoformat(),
                    },
                },
            },
            path=str(request.url.path),
        )

    except Exception as e:
        logger.error(f"[META_EVENTS] Query failed: {e}", exc_info=True)
        return error_response(
            message=f"Failed to load Meta events: {str(e)}",
            path=str(request.url.path),
        )
