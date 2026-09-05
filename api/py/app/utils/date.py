"""Date utility functions — direct port of NestJS src/modules/common/methods/date.ts."""

import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


def get_timezone(timezone: str | None = None) -> str:
    default_tz = os.environ.get("TIMEZONE", "Asia/Kolkata")
    return timezone or default_tz


def get_date(date: str | None = None, timezone: str | None = None):
    """Return start_of_day and end_of_day in UTC for the given local date in the target timezone."""
    tz = ZoneInfo(get_timezone(timezone))

    if date:
        dt = datetime.fromisoformat(date)
    else:
        dt = datetime.now(tz)

    # Get the date parts in the target timezone
    if dt.tzinfo is None:
        local_dt = dt.replace(tzinfo=tz)
    else:
        local_dt = dt.astimezone(tz)

    start_of_day_local = local_dt.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day_local = local_dt.replace(hour=23, minute=59, second=59, microsecond=999000)

    # Convert to UTC for DB storage
    start_of_day = start_of_day_local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
    end_of_day = end_of_day_local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)

    return {"start_of_day": start_of_day, "end_of_day": end_of_day}


def is_current_day(date: str, timezone: str | None = None) -> bool:
    tz = ZoneInfo(get_timezone(timezone))
    now = datetime.now(tz)
    provided = datetime.fromisoformat(date)
    if provided.tzinfo is None:
        provided = provided.replace(tzinfo=tz)
    else:
        provided = provided.astimezone(tz)
    return (
        now.year == provided.year
        and now.month == provided.month
        and now.day == provided.day
    )


def get_month_range(year: int, month: int, timezone: str | None = None):
    """Return start_of_month and end_of_month in UTC for the given month in the target timezone."""
    tz = ZoneInfo(get_timezone(timezone))

    # First day of the month at 00:00:00
    start_local = datetime(year, month, 1, 0, 0, 0, tzinfo=tz)

    # Last day of the month
    if month == 12:
        next_month = datetime(year + 1, 1, 1, tzinfo=tz)
    else:
        next_month = datetime(year, month + 1, 1, tzinfo=tz)
    end_local = next_month - timedelta(microseconds=1)

    start_of_month = start_local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
    end_of_month = end_local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)

    return {"start_of_month": start_of_month, "end_of_month": end_of_month}


def is_current_month(year: int, month: int, timezone: str | None = None) -> bool:
    tz = ZoneInfo(get_timezone(timezone))
    now = datetime.now(tz)
    return now.year == year and now.month == month


def get_yesterday_date(timezone: str | None = None) -> str:
    """Get yesterday's date in YYYY-MM-DD format for the specified timezone."""
    tz = ZoneInfo(get_timezone(timezone))
    now = datetime.now(tz)
    yesterday = now - timedelta(days=1)
    return yesterday.strftime("%Y-%m-%d")


def yesterday_date(timezone: str | None = None):
    """Return yesterday as a `date` object in the specified timezone.
    Used to enforce the policy that today's (partial / in-progress) data
    is never exposed by any metric endpoint."""
    tz = ZoneInfo(get_timezone(timezone))
    return (datetime.now(tz) - timedelta(days=1)).date()


def clamp_date_str_to_yesterday(value: str | None, timezone: str | None = None) -> str | None:
    """Clamp an incoming YYYY-MM-DD string to yesterday if it's today or later.
    Pass-through for malformed input — let the receiving handler raise."""
    if not value:
        return value
    try:
        provided = datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return value
    cap = yesterday_date(timezone)
    return cap.strftime("%Y-%m-%d") if provided > cap else value


def get_previous_month(timezone: str | None = None) -> dict:
    """Get the previous month's year and month (1-12) for the specified timezone."""
    tz = ZoneInfo(get_timezone(timezone))
    now = datetime.now(tz)
    if now.month == 1:
        return {"year": now.year - 1, "month": 12}
    return {"year": now.year, "month": now.month - 1}


def get_today_date(timezone: str | None = None) -> str:
    tz = ZoneInfo(get_timezone(timezone))
    return datetime.now(tz).strftime("%Y-%m-%d")


def get_current_month(timezone: str | None = None) -> dict:
    tz = ZoneInfo(get_timezone(timezone))
    now = datetime.now(tz)
    return {"year": now.year, "month": now.month}
