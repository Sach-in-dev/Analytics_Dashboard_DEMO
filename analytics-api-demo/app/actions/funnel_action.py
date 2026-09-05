"""Customer Funnel Metrics Action — fetches DAILY engagement counts from prod DB.

Each daily snapshot captures activity for THAT SPECIFIC DATE only:
  1. Total Users   — website visitors (unique IPs) on that date
  2. Open Users    — customers who created a cart on that date
  3. Click Users   — customers with cart items added on that date
  4. Converted     — customers who completed an order on that date
  + Rates computed from the day's numbers.
"""

import logging
from datetime import datetime, timezone, timedelta, date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


def _safe_rate(numerator: int, denominator: int) -> float:
    """Compute percentage rate, returning 0 on division-by-zero."""
    if denominator == 0:
        return 0.0
    return round((numerator / denominator) * 100, 2)


async def process_funnel_metrics(
    prod_db: AsyncSession,
    analytics_db: AsyncSession,
    target_date: date | None = None,
):
    """Compute funnel metrics for a single day and upsert into analytics DB."""
    if target_date is None:
        target_date = (datetime.now(timezone.utc) - timedelta(days=1)).date()

    day_start = datetime.combine(target_date, datetime.min.time())
    day_end = datetime.combine(target_date, datetime.max.time())

    logger.info(f"[FUNNEL] Processing funnel metrics for {target_date}")

    params = {"day_start": day_start, "day_end": day_end}

    # ── Step 1: Base audience tracking (Unique Visitors) ──
    total_r = await prod_db.execute(
        text("""
            SELECT COUNT(DISTINCT ip)::bigint
            FROM public.visitors
            WHERE created_at >= :day_start AND created_at <= :day_end
        """),
        params,
    )
    total_users = int(total_r.scalar() or 0)

    # ── Step 2: Customers who created a cart on this date ──
    open_r = await prod_db.execute(
        text("""
            SELECT COUNT(DISTINCT cu.email)::bigint
            FROM public.cart c
            JOIN public.customers cu ON cu.id = c.customer_id
            WHERE cu.email IS NOT NULL AND cu.email != ''
              AND c.created_at >= :day_start AND c.created_at <= :day_end
        """),
        params,
    )
    open_users = int(open_r.scalar() or 0)

    # ── Step 3: Customers who added items to cart on this date ──
    click_r = await prod_db.execute(
        text("""
            SELECT COUNT(DISTINCT cu.email)::bigint
            FROM public.cart c
            JOIN public.customers cu ON cu.id = c.customer_id
            JOIN public.line_item li ON li.cart_id = c.id
            WHERE cu.email IS NOT NULL AND cu.email != ''
              AND c.created_at >= :day_start AND c.created_at <= :day_end
        """),
        params,
    )
    click_users = int(click_r.scalar() or 0)

    # ── Step 4: Customers who attempted checkout but payment failed ──
    # Failed payment typically means an order was created but payment wasn't successful.
    pf_r = await prod_db.execute(
        text("""
            SELECT COUNT(DISTINCT email)::bigint
            FROM "order"
            WHERE paid_at IS NULL AND status NOT IN ('DELIVERED', 'COMPLETED')
              AND email IS NOT NULL AND email != ''
              AND created_at >= :day_start AND created_at <= :day_end
        """),
        params,
    )
    payment_failure_users = int(pf_r.scalar() or 0)

    # ── Step 5: Customers who completed an order on this date ──
    conv_r = await prod_db.execute(
        text("""
            SELECT COUNT(DISTINCT email)::bigint
            FROM "order"
            WHERE (paid_at IS NOT NULL OR status IN ('DELIVERED', 'COMPLETED'))
              AND email IS NOT NULL AND email != ''
              AND created_at >= :day_start AND created_at <= :day_end
        """),
        params,
    )
    converted_users = int(conv_r.scalar() or 0)

    # ── Step 6: Enforce Funnel Logical Constraints ──
    # Due to patchy visitor tracking and cross-day conversions (cart yesterday -> buy today),
    # ensure that the funnel descends logically to prevent >100% metrics in the UI.
    click_users = max(click_users, converted_users + payment_failure_users)
    open_users = max(open_users, click_users)
    total_users = max(total_users, open_users)

    # ── Step 7: Compute daily rates ──
    open_rate = _safe_rate(open_users, total_users)
    click_rate = _safe_rate(click_users, open_users)
    conversion_rate = _safe_rate(converted_users, click_users)

    logger.info(
        f"[FUNNEL] {target_date} → Registered: {total_users}, "
        f"Carts: {open_users}, AddToCart: {click_users}, "
        f"PaymentFailed: {payment_failure_users}, Converted: {converted_users}"
    )

    # ── Step 8: Upsert into analytics DB ──
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await analytics_db.execute(
        text("""
            INSERT INTO customer_funnel_metrics
                (id, date, total_users, open_users, click_users, payment_failure_users, converted_users,
                 open_rate, click_rate, conversion_rate, "createdAt", "updatedAt")
            VALUES
                (gen_random_uuid()::text, :date, :total_users, :open_users,
                 :click_users, :payment_failure_users, :converted_users, :open_rate, :click_rate,
                 :conversion_rate, :now, :now)
            ON CONFLICT (date) DO UPDATE SET
                total_users = EXCLUDED.total_users,
                open_users = EXCLUDED.open_users,
                click_users = EXCLUDED.click_users,
                payment_failure_users = EXCLUDED.payment_failure_users,
                converted_users = EXCLUDED.converted_users,
                open_rate = EXCLUDED.open_rate,
                click_rate = EXCLUDED.click_rate,
                conversion_rate = EXCLUDED.conversion_rate,
                "updatedAt" = EXCLUDED."updatedAt"
        """),
        {
            "date": target_date,
            "total_users": total_users,
            "open_users": open_users,
            "click_users": click_users,
            "payment_failure_users": payment_failure_users,
            "converted_users": converted_users,
            "open_rate": open_rate,
            "click_rate": click_rate,
            "conversion_rate": conversion_rate,
            "now": now,
        },
    )
    await analytics_db.commit()
    logger.info(f"[FUNNEL] Successfully upserted daily snapshot for {target_date}")
