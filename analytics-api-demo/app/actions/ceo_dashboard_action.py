"""CEO Dashboard Snapshot Action — computes 6 dynamic metrics from prod DB.

Runs daily as a cron job. Queries the production database to compute:
  1. Avg Delivery Time   — mean(delivered_at - created_at) for delivered orders
  2. SLA %               — % orders delivered within 3 days
  3. Hero SKU Sell-through — top-10 SKU sell rate = units_sold / (units_sold + current_inventory)
  4. Inventory Coverage Days — total_inventory / avg_daily_units_sold (last 30d)
  5. Email Revenue Share  — % of revenue from orders with email/klaviyo referral
  6. RTO Rate             — % of delivered orders that were cancelled/returned/refunded

Results are upserted into `ceo_dashboard_snapshots` in the analytics DB.
"""

import logging
from datetime import datetime, timezone, timedelta, date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)

SLA_THRESHOLD_DAYS = 3  # Orders delivered within 3 days = on-time


async def process_ceo_dashboard_snapshot(
    prod_db: AsyncSession,
    analytics_db: AsyncSession,
    target_date: date | None = None,
):
    """Compute all 5 CEO dashboard metrics for a given date and upsert."""
    if target_date is None:
        target_date = (datetime.now(timezone.utc) - timedelta(days=1)).date()

    logger.info(f"[CEO-SNAPSHOT] Computing metrics for {target_date}")

    # Use a 7-day window ending on target_date for weekly metrics
    week_end = datetime.combine(target_date, datetime.max.time())
    week_start = datetime.combine(target_date - timedelta(days=6), datetime.min.time())

    # ═══════════════════════════════════════════════════════════
    # 1. AVG DELIVERY TIME + SLA %
    # From `order` table — orders with delivered_at not null
    # ═══════════════════════════════════════════════════════════
    delivery_result = await prod_db.execute(
        text("""
            SELECT
                COUNT(*) AS total_delivered,
                COALESCE(AVG(EXTRACT(EPOCH FROM (delivered_at - created_at)) / 86400.0), 0) AS avg_days,
                COUNT(*) FILTER (
                    WHERE EXTRACT(EPOCH FROM (delivered_at - created_at)) / 86400.0 <= :sla_days
                ) AS within_sla
            FROM "order"
            WHERE delivered_at IS NOT NULL
              AND status NOT IN ('CANCELLED', 'REFUNDED')
              AND created_at >= :week_start
              AND created_at <= :week_end
        """),
        {
            "sla_days": SLA_THRESHOLD_DAYS,
            "week_start": week_start,
            "week_end": week_end,
        },
    )
    del_row = delivery_result.one()
    total_delivered = int(del_row[0])
    avg_delivery_days = round(float(del_row[1]), 1) if total_delivered > 0 else 0.0
    within_sla = int(del_row[2])
    sla_pct = round((within_sla / total_delivered) * 100, 1) if total_delivered > 0 else 0.0

    logger.info(
        f"[CEO-SNAPSHOT] Delivery: avg={avg_delivery_days}d, "
        f"SLA={sla_pct}% ({within_sla}/{total_delivered})"
    )

    # ═══════════════════════════════════════════════════════════
    # 2. HERO SKU SELL-THROUGH (Top 10 by volume)
    # sell-through = units_sold / (units_sold + current_inventory)
    # ═══════════════════════════════════════════════════════════
    hero_result = await prod_db.execute(
        text("""
            WITH top_skus AS (
                SELECT
                    oi.variant_id,
                    SUM(oi.quantity) AS units_sold
                FROM order_item oi
                JOIN "order" o ON o.id = oi.order_id
                WHERE o.status NOT IN ('CANCELLED', 'REFUNDED')
                  AND o.created_at >= :month_start
                  AND o.created_at <= :week_end
                  AND oi.variant_id IS NOT NULL
                GROUP BY oi.variant_id
                ORDER BY units_sold DESC
                LIMIT 10
            )
            SELECT
                COALESCE(AVG(
                    CASE
                        WHEN (ts.units_sold + COALESCE(pv.inventory_quantity, 0)) > 0
                        THEN (ts.units_sold::float / (ts.units_sold + COALESCE(pv.inventory_quantity, 0))) * 100
                        ELSE 0
                    END
                ), 0) AS avg_sellthrough
            FROM top_skus ts
            LEFT JOIN product_variants pv ON pv.id = ts.variant_id
        """),
        {
            "month_start": datetime.combine(target_date - timedelta(days=29), datetime.min.time()),
            "week_end": week_end,
        },
    )
    hero_sku_sellthrough = round(float(hero_result.scalar() or 0), 1)

    logger.info(f"[CEO-SNAPSHOT] Hero SKU sell-through: {hero_sku_sellthrough}%")

    # ═══════════════════════════════════════════════════════════
    # 3. INVENTORY COVERAGE DAYS
    # total_inventory / avg_daily_units_sold (last 30 days)
    # ═══════════════════════════════════════════════════════════
    # Total current inventory
    inv_result = await prod_db.execute(
        text("""
            SELECT COALESCE(SUM(inventory_quantity), 0)
            FROM product_variants
            WHERE deleted_at IS NULL AND manage_inventory = true
        """)
    )
    total_inventory = int(inv_result.scalar() or 0)

    # Avg daily units sold (last 30 days)
    velocity_result = await prod_db.execute(
        text("""
            SELECT COALESCE(SUM(oi.quantity), 0) AS total_sold
            FROM order_item oi
            JOIN "order" o ON o.id = oi.order_id
            WHERE o.status NOT IN ('CANCELLED', 'REFUNDED')
              AND o.created_at >= :thirty_days_ago
              AND o.created_at <= :week_end
        """),
        {
            "thirty_days_ago": datetime.combine(target_date - timedelta(days=29), datetime.min.time()),
            "week_end": week_end,
        },
    )
    total_sold_30d = int(velocity_result.scalar() or 0)
    avg_daily_sold = total_sold_30d / 30.0 if total_sold_30d > 0 else 0

    inventory_coverage_days = round(total_inventory / avg_daily_sold, 1) if avg_daily_sold > 0 else 0.0

    logger.info(
        f"[CEO-SNAPSHOT] Inventory coverage: {inventory_coverage_days} days "
        f"(stock={total_inventory}, daily_velocity={avg_daily_sold:.1f})"
    )

    # ═══════════════════════════════════════════════════════════
    # 4. EMAIL REVENUE SHARE
    # % of revenue from orders attributed to email/klaviyo
    # ═══════════════════════════════════════════════════════════
    email_result = await prod_db.execute(
        text("""
            SELECT
                COALESCE(SUM(total), 0) AS total_revenue,
                COALESCE(SUM(
                    CASE
                        WHEN LOWER(COALESCE(referral, '')) LIKE '%%klaviyo%%'
                          OR LOWER(COALESCE(referral, '')) LIKE '%%email%%'
                          OR LOWER(COALESCE(referral, '')) LIKE '%%newsletter%%'
                          OR LOWER(COALESCE(referral, '')) LIKE '%%mail%%'
                        THEN total
                        ELSE 0
                    END
                ), 0) AS email_revenue
            FROM "order"
            WHERE status NOT IN ('CANCELLED', 'REFUNDED')
              AND (paid_at IS NOT NULL OR status IN ('DELIVERED', 'COMPLETED'))
              AND created_at >= :week_start
              AND created_at <= :week_end
        """),
        {"week_start": week_start, "week_end": week_end},
    )
    email_row = email_result.one()
    total_revenue_val = float(email_row[0])
    email_attributed_revenue = float(email_row[1])

    email_revenue_share = round(
        (email_attributed_revenue / total_revenue_val) * 100, 1
    ) if total_revenue_val > 0 else 0.0

    logger.info(
        f"[CEO-SNAPSHOT] Email revenue share: {email_revenue_share}% "
        f"(email=₹{email_attributed_revenue:.0f} / total=₹{total_revenue_val:.0f})"
    )

    # ═══════════════════════════════════════════════════════════
    # 5. RTO RATE
    # Delivered orders that were cancelled/returned/refunded
    # ═══════════════════════════════════════════════════════════
    rto_result = await prod_db.execute(
        text("""
            SELECT
                COUNT(*) FILTER (WHERE delivered_at IS NOT NULL) AS total_delivered_all,
                COUNT(*) FILTER (
                    WHERE delivered_at IS NOT NULL
                      AND status IN ('CANCELLED', 'RETURNED', 'REFUNDED')
                ) AS rto_count
            FROM "order"
            WHERE created_at >= :week_start
              AND created_at <= :week_end
        """),
        {"week_start": week_start, "week_end": week_end},
    )
    rto_row = rto_result.one()
    rto_delivered = int(rto_row[0])
    rto_orders = int(rto_row[1])
    rto_rate = round((rto_orders / rto_delivered) * 100, 1) if rto_delivered > 0 else 0.0

    logger.info(
        f"[CEO-SNAPSHOT] RTO rate: {rto_rate}% "
        f"({rto_orders}/{rto_delivered} delivered orders returned)"
    )

    # ═══════════════════════════════════════════════════════════
    # UPSERT INTO ANALYTICS DB
    # ═══════════════════════════════════════════════════════════
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await analytics_db.execute(
        text("""
            INSERT INTO ceo_dashboard_snapshots
                (id, snapshot_date,
                 avg_delivery_days, sla_pct, orders_delivered, orders_within_sla,
                 hero_sku_sellthrough, inventory_coverage_days,
                 email_revenue_share, email_attributed_revenue, total_revenue,
                 rto_rate, rto_orders,
                 "createdAt", "updatedAt")
            VALUES
                (gen_random_uuid()::text, :snapshot_date,
                 :avg_delivery_days, :sla_pct, :orders_delivered, :orders_within_sla,
                 :hero_sku_sellthrough, :inventory_coverage_days,
                 :email_revenue_share, :email_attributed_revenue, :total_revenue,
                 :rto_rate, :rto_orders,
                 :now, :now)
            ON CONFLICT (snapshot_date) DO UPDATE SET
                avg_delivery_days = EXCLUDED.avg_delivery_days,
                sla_pct = EXCLUDED.sla_pct,
                orders_delivered = EXCLUDED.orders_delivered,
                orders_within_sla = EXCLUDED.orders_within_sla,
                hero_sku_sellthrough = EXCLUDED.hero_sku_sellthrough,
                inventory_coverage_days = EXCLUDED.inventory_coverage_days,
                email_revenue_share = EXCLUDED.email_revenue_share,
                email_attributed_revenue = EXCLUDED.email_attributed_revenue,
                total_revenue = EXCLUDED.total_revenue,
                rto_rate = EXCLUDED.rto_rate,
                rto_orders = EXCLUDED.rto_orders,
                "updatedAt" = EXCLUDED."updatedAt"
        """),
        {
            "snapshot_date": target_date,
            "avg_delivery_days": avg_delivery_days,
            "sla_pct": sla_pct,
            "orders_delivered": total_delivered,
            "orders_within_sla": within_sla,
            "hero_sku_sellthrough": hero_sku_sellthrough,
            "inventory_coverage_days": inventory_coverage_days,
            "email_revenue_share": email_revenue_share,
            "email_attributed_revenue": email_attributed_revenue,
            "total_revenue": total_revenue_val,
            "rto_rate": rto_rate,
            "rto_orders": rto_orders,
            "now": now,
        },
    )
    await analytics_db.commit()

    logger.info(f"[CEO-SNAPSHOT] Successfully upserted snapshot for {target_date}")
