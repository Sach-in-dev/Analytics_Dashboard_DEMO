"""Return Reason Action — fetches returned/refunded order data from prod DB,
extracts reason codes, aggregates reason-wise metrics per day,
and upserts into the analytics DB (return_reason_metrics).

Reason codes are derived from the `cancel_reason` field on the order table.
Orders with status = RETURNED or REFUNDED are included.
If no reason is available, the code falls back to 'UNKNOWN'.
"""

import logging
from datetime import datetime, timezone, date, timedelta
from app.utils.date import get_date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)

# Canonical reason codes — maps raw DB values to normalized labels
REASON_MAP = {
    "DAMAGED": "Damaged Product",
    "DAMAGED_PRODUCT": "Damaged Product",
    "SIZE_ISSUE": "Size Issue",
    "WRONG_ITEM": "Wrong Item Delivered",
    "WRONG_ITEM_DELIVERED": "Wrong Item Delivered",
    "QUALITY_ISSUE": "Quality Issue",
    "QUALITY": "Quality Issue",
    "LATE_DELIVERY": "Late Delivery",
    "DELAYED_DELIVERY": "Late Delivery",
    "CHANGED_MIND": "Customer Changed Mind",
    "CUSTOMER_CHANGED_MIND": "Customer Changed Mind",
    "NOT_AS_DESCRIBED": "Not As Described",
    "ALLERGIC_REACTION": "Allergic Reaction",
    "EXPIRED": "Expired Product",
    "BETTER_PRICE": "Found Better Price",
    "DUPLICATE_ORDER": "Duplicate Order",
    "OTHER": "Other",
    "UNKNOWN": "Unknown",
}


def _normalize_reason(raw: str | None) -> tuple[str, str]:
    """Normalize a raw reason string into (reason_code, reason_text)."""
    if not raw or not raw.strip():
        return ("UNKNOWN", "Unknown")

    code = raw.strip().upper().replace(" ", "_").replace("-", "_")

    # Try direct match first
    if code in REASON_MAP:
        return (code, REASON_MAP[code])

    # Fuzzy match via substrings
    lower = raw.lower().strip()
    if "damage" in lower:
        return ("DAMAGED", "Damaged Product")
    if "size" in lower:
        return ("SIZE_ISSUE", "Size Issue")
    if "wrong" in lower:
        return ("WRONG_ITEM", "Wrong Item Delivered")
    if "quality" in lower:
        return ("QUALITY_ISSUE", "Quality Issue")
    if "late" in lower or "delay" in lower:
        return ("LATE_DELIVERY", "Late Delivery")
    if "mind" in lower or "changed" in lower:
        return ("CHANGED_MIND", "Customer Changed Mind")
    if "descri" in lower:
        return ("NOT_AS_DESCRIBED", "Not As Described")
    if "allerg" in lower:
        return ("ALLERGIC_REACTION", "Allergic Reaction")
    if "expire" in lower:
        return ("EXPIRED", "Expired Product")
    if "price" in lower:
        return ("BETTER_PRICE", "Found Better Price")
    if "duplicate" in lower:
        return ("DUPLICATE_ORDER", "Duplicate Order")

    # Fallback: use the raw value as code, title-case as text
    return (code[:50], raw.strip().title()[:100])


async def process_return_reasons(prod_db: AsyncSession, analytics_db: AsyncSession):
    """Full Return Reason pipeline: fetch returned/refunded orders from prod → aggregate by reason → upsert.

    Recomputes the last 30 days to capture late status changes.
    """
    logger.info("[RETURN_REASON] Starting return reason metrics processing")

    today = date.today()

    for i in range(1, 32):
        target_date = today - timedelta(days=i)
        await _process_day(prod_db, analytics_db, target_date)

    logger.info("[RETURN_REASON] Completed return reason metrics processing (last 30 days)")


async def _process_day(
    prod_db: AsyncSession,
    analytics_db: AsyncSession,
    target_date: date,
):
    """Compute return reason metrics for a specific date and upsert into analytics DB."""
    date_range = get_date(date=target_date.isoformat())
    start_time = date_range["start_of_day"]
    end_time = date_range["end_of_day"]

    # Step 1: Fetch all returned/refunded orders for the day with reason + total
    result = await prod_db.execute(
        text("""
            SELECT
                metadata->>'cancel_reason' as cancel_reason,
                total
            FROM "order"
            WHERE status IN ('RETURNED', 'REFUNDED')
              AND COALESCE(paid_at, created_at) >= :start_time
              AND COALESCE(paid_at, created_at) <= :end_time
        """),
        {
            "start_time": start_time,
            "end_time": end_time,
        },
    )
    rows = result.all()

    if not rows:
        return

    # Step 2: Aggregate by reason_code
    reason_agg: dict[str, dict] = {}
    total_cases_all = 0

    for row in rows:
        raw_reason = row[0]
        order_total = float(row[1]) if row[1] else 0.0
        code, text_label = _normalize_reason(raw_reason)

        if code not in reason_agg:
            reason_agg[code] = {
                "reason_text": text_label,
                "total_cases": 0,
                "total_revenue_loss": 0.0,
            }
        reason_agg[code]["total_cases"] += 1
        reason_agg[code]["total_revenue_loss"] += order_total
        total_cases_all += 1

    # Step 3: Calculate percentages and upsert
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    for code, metrics in reason_agg.items():
        percentage = round((metrics["total_cases"] / total_cases_all) * 100, 2) if total_cases_all > 0 else 0.0

        await analytics_db.execute(
            text("""
                INSERT INTO return_reason_metrics
                    (id, date, reason_code, reason_text, total_cases,
                     total_revenue_loss, percentage, "createdAt", "updatedAt")
                VALUES
                    (gen_random_uuid()::text, :date, :reason_code, :reason_text,
                     :total_cases, :total_revenue_loss, :percentage, :now, :now)
                ON CONFLICT (date, reason_code) DO UPDATE SET
                    reason_text = EXCLUDED.reason_text,
                    total_cases = EXCLUDED.total_cases,
                    total_revenue_loss = EXCLUDED.total_revenue_loss,
                    percentage = EXCLUDED.percentage,
                    "updatedAt" = EXCLUDED."updatedAt"
            """),
            {
                "date": target_date,
                "reason_code": code,
                "reason_text": metrics["reason_text"],
                "total_cases": metrics["total_cases"],
                "total_revenue_loss": round(metrics["total_revenue_loss"], 2),
                "percentage": percentage,
                "now": now,
            }
        )

    await analytics_db.commit()

    total_loss = sum(m["total_revenue_loss"] for m in reason_agg.values())
    logger.info(
        f"[RETURN_REASON] {target_date}: {len(reason_agg)} reasons, "
        f"{total_cases_all} total cases, ₹{total_loss:,.0f} revenue loss"
    )
