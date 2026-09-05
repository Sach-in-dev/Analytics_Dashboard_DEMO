"""Marketing Cost per Order Action — fetches Meta Ads total spend and
prod DB order counts to compute Cost per Order = Spend / Orders per day.

Pipeline:
  1. Fetch total daily spend from Meta Marketing API (graph.facebook.com)
  2. Fetch total paid/delivered orders per day from prod DB
  3. Compute cost_per_order = total_spend / total_orders
  4. Upsert into marketing_cost_per_order (analytics DB)

Recomputes the last 30 days on each run to capture late data changes.
"""

import logging
import httpx
from datetime import datetime, timezone, date, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.config import get_settings

logger = logging.getLogger(__name__)


async def _fetch_meta_daily_spend(
    start_date: date, end_date: date
) -> dict[date, float]:
    """Fetch total daily spend from Meta Marketing API.

    Returns dict: {date → total_spend}
    """
    settings = get_settings()
    access_token = settings.META_ADS_ACCESS_TOKEN
    account_id = settings.META_ADS_ACCOUNT_ID

    if not access_token or not account_id:
        logger.warning("[MARKETING_COST] META_ADS_ACCESS_TOKEN or META_ADS_ACCOUNT_ID not set, skipping")
        return {}

    url = f"https://graph.facebook.com/v21.0/{account_id}/insights"
    daily_spend: dict[date, float] = {}

    params = {
        "access_token": access_token,
        "fields": "spend",
        "time_range": f'{{"since":"{start_date.isoformat()}","until":"{end_date.isoformat()}"}}',
        "time_increment": 1,  # Daily breakdown
        "level": "account",   # Account-level (total spend, not per campaign)
        "limit": 500,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            while True:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                result = resp.json()

                for row in result.get("data", []):
                    spend = float(row.get("spend", 0))
                    row_date_str = row.get("date_start", "")
                    try:
                        row_date = datetime.strptime(row_date_str, "%Y-%m-%d").date()
                    except ValueError:
                        continue

                    daily_spend[row_date] = daily_spend.get(row_date, 0.0) + spend

                # Handle pagination
                paging = result.get("paging", {})
                next_url = paging.get("next")
                if next_url:
                    url = next_url
                    params = {}
                else:
                    break

        logger.info(f"[MARKETING_COST] Fetched {len(daily_spend)} days of spend from Meta API")

    except httpx.HTTPStatusError as e:
        logger.error(f"[MARKETING_COST] Meta API HTTP error {e.response.status_code}: {e.response.text[:500]}")
    except httpx.RequestError as e:
        logger.error(f"[MARKETING_COST] Meta API request error: {e}")
    except Exception as e:
        logger.error(f"[MARKETING_COST] Meta API unexpected error: {e}")

    return daily_spend


async def process_marketing_cost(prod_db: AsyncSession, analytics_db: AsyncSession, start_dt: date = None, end_dt: date = None):
    """Full Marketing Cost per Order pipeline: Meta spend + prod orders → marketing_cost_per_order.

    Recomputes the last 30 days to capture late data changes, unless explicit dates are provided.
    """
    logger.info("[MARKETING_COST] Starting marketing cost per order processing")

    if start_dt and end_dt:
        start_date = start_dt
        end_date = end_dt
    else:
        today = date.today()
        start_date = today - timedelta(days=31)
        end_date = today - timedelta(days=1)

    # ── Step 1: Fetch daily spend from Meta API ──
    daily_spend = await _fetch_meta_daily_spend(start_date, end_date)

    if not daily_spend:
        logger.warning("[MARKETING_COST] No Meta spend data found, skipping")
        return

    # ── Step 2: Fetch daily order counts from prod DB ──
    orders_result = await prod_db.execute(
        text("""
            SELECT
                COALESCE(paid_at, created_at)::date AS order_date,
                COUNT(*) AS total_orders
            FROM "order"
            WHERE (paid_at IS NOT NULL OR status IN ('COMPLETED', 'DELIVERED'))
              AND COALESCE(paid_at, created_at)::date >= :start_date
              AND COALESCE(paid_at, created_at)::date <= :end_date
            GROUP BY 1
        """),
        {"start_date": start_date, "end_date": end_date},
    )
    daily_orders: dict[date, int] = {}
    for row in orders_result.all():
        daily_orders[row[0]] = int(row[1])

    logger.info(f"[MARKETING_COST] Fetched {len(daily_orders)} days of orders from prod DB")

    # ── Step 3: Compute cost per order and upsert ──
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    upsert_count = 0

    # Process all dates that have either spend or orders
    all_dates = set(daily_spend.keys()) | set(daily_orders.keys())

    for row_date in sorted(all_dates):
        spend = round(daily_spend.get(row_date, 0.0), 2)
        orders = daily_orders.get(row_date, 0)
        cost_per_order = round(spend / orders, 2) if orders > 0 else 0.0

        await analytics_db.execute(
            text("""
                INSERT INTO marketing_cost_per_order
                    (id, date, total_spend, total_orders, cost_per_order,
                     "createdAt", "updatedAt")
                VALUES
                    (gen_random_uuid()::text, :date, :total_spend,
                     :total_orders, :cost_per_order, :now, :now)
                ON CONFLICT (date) DO UPDATE SET
                    total_spend = EXCLUDED.total_spend,
                    total_orders = EXCLUDED.total_orders,
                    cost_per_order = EXCLUDED.cost_per_order,
                    "updatedAt" = EXCLUDED."updatedAt"
            """),
            {
                "date": row_date,
                "total_spend": spend,
                "total_orders": orders,
                "cost_per_order": cost_per_order,
                "now": now,
            },
        )
        upsert_count += 1

    await analytics_db.commit()

    total_spend = sum(daily_spend.values())
    total_orders = sum(daily_orders.values())
    avg_cpo = round(total_spend / total_orders, 2) if total_orders > 0 else 0
    logger.info(
        f"[MARKETING_COST] Completed: {upsert_count} rows upserted, "
        f"₹{total_spend:,.0f} total spend, {total_orders} orders, "
        f"₹{avg_cpo} avg cost/order"
    )
