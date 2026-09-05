"""Monthly order action — port of monthly-order.action.ts (1264 lines).
Uses the exact same CTE pattern as daily_order_action.py but for year/month ranges.
"""

import logging
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, delete
from app.utils.date import get_month_range
from app.models.analytics import MonthlyOrders

logger = logging.getLogger(__name__)


async def calculate_monthly_orders(
    prod_db: AsyncSession, timezone: str, year: int, month: int
) -> dict | None:
    month_range = get_month_range(year, month, timezone)
    start = month_range["start_of_month"]
    end = month_range["end_of_month"]

    logger.info(f"Calculating monthly orders for {year}-{month}, timezone: {timezone}")
    logger.info(f"Date range - Start: {start.isoformat()}, End: {end.isoformat()}")

    # Diagnostic check
    diag = await prod_db.execute(
        text("""
            SELECT
                COUNT(*)\:\:bigint as total_count,
                COUNT(*) FILTER (WHERE paid_at IS NOT NULL)\:\:bigint as with_paid_at,
                COUNT(*) FILTER (WHERE paid_at IS NULL)\:\:bigint as without_paid_at
            FROM "order"
            WHERE (
                (paid_at >= :start\:\:timestamp AND paid_at <= :end_date\:\:timestamp)
                OR
                (paid_at IS NULL AND status IN ('DELIVERED', 'COMPLETED')
                 AND created_at >= :start\:\:timestamp AND created_at <= :end_date\:\:timestamp)
            )
        """),
        {"start": start, "end_date": end},
    )
    diag_row = diag.mappings().first()
    if not diag_row or int(diag_row["total_count"] or 0) == 0:
        logger.warning(f"No orders found for {year}-{month}, returning zeros")
        return _get_empty_monthly_data(year, month)

    # Main CTE query — same pattern as daily_order_action.py
    result = await prod_db.execute(
        text("""
            WITH customer_first_order AS (
                SELECT customer_id, MIN(COALESCE(paid_at, created_at)) as first_order_at
                FROM "order"
                WHERE paid_at IS NOT NULL OR status IN ('DELIVERED', 'COMPLETED')
                GROUP BY customer_id
            ),
            order_classification AS (
                SELECT
                    o.id, o.customer_id, COALESCE(o.paid_at, o.created_at) as effective_date,
                    o.total, o.discount_total, o.shipping_total, o.sub_total, o.redeemed_points,
                    o.metadata->>'source' as order_source,
                    CASE WHEN o.metadata->>'source' = 'website' THEN 'web' ELSE 'app' END as platform,
                    CASE
                        WHEN cfo.first_order_at IS NOT NULL
                            AND cfo.first_order_at >= :start\:\:timestamp
                            AND cfo.first_order_at <= :end_date\:\:timestamp
                        THEN true ELSE false
                    END as is_new_customer
                FROM "order" o
                LEFT JOIN customer_first_order cfo ON o.customer_id = cfo.customer_id
                WHERE (
                    (o.paid_at >= :start\:\:timestamp AND o.paid_at <= :end_date\:\:timestamp)
                    OR
                    (o.paid_at IS NULL AND o.status IN ('DELIVERED', 'COMPLETED')
                     AND o.created_at >= :start\:\:timestamp AND o.created_at <= :end_date\:\:timestamp)
                )
            )
            SELECT
                COUNT(*)\:\:bigint as monthly_orders_count,
                COALESCE(SUM(total), 0)\:\:bigint as total,
                COALESCE(SUM(discount_total), 0)\:\:bigint as discount_total,
                COALESCE(SUM(shipping_total), 0)\:\:bigint as shipping_total,
                COALESCE(SUM(sub_total), 0)\:\:bigint as sub_total,
                COALESCE(SUM(redeemed_points), 0)\:\:numeric as redeemed_points,

                COUNT(*) FILTER (WHERE is_new_customer)\:\:bigint as new_customer_orders_count,
                COALESCE(SUM(total) FILTER (WHERE is_new_customer), 0)\:\:bigint as new_customer_total,
                CASE WHEN COUNT(*) FILTER (WHERE is_new_customer) > 0
                    THEN ROUND((SUM(total) FILTER (WHERE is_new_customer)\:\:numeric / COUNT(*) FILTER (WHERE is_new_customer))\:\:numeric, 2) ELSE 0 END as new_customer_aov,

                COUNT(*) FILTER (WHERE NOT is_new_customer)\:\:bigint as returning_customer_orders_count,
                COALESCE(SUM(total) FILTER (WHERE NOT is_new_customer), 0)\:\:bigint as returning_customer_total,
                CASE WHEN COUNT(*) FILTER (WHERE NOT is_new_customer) > 0
                    THEN ROUND((SUM(total) FILTER (WHERE NOT is_new_customer)\:\:numeric / COUNT(*) FILTER (WHERE NOT is_new_customer))\:\:numeric, 2) ELSE 0 END as returning_customer_aov,

                COUNT(*) FILTER (WHERE discount_total > 0)\:\:bigint as orders_with_discount_count,
                COUNT(*) FILTER (WHERE discount_total = 0 OR discount_total IS NULL)\:\:bigint as orders_without_discount_count,
                COUNT(*) FILTER (WHERE redeemed_points > 0)\:\:bigint as orders_with_redeemed_points_count,
                COUNT(*) FILTER (WHERE redeemed_points = 0 OR redeemed_points IS NULL)\:\:bigint as orders_without_redeemed_points_count,

                -- Web platform
                COUNT(*) FILTER (WHERE platform = 'web')\:\:bigint as web_orders_count,
                COALESCE(SUM(total) FILTER (WHERE platform = 'web'), 0)\:\:bigint as web_total,
                CASE WHEN COUNT(*) FILTER (WHERE platform = 'web') > 0
                    THEN ROUND((SUM(total) FILTER (WHERE platform = 'web')\:\:numeric / COUNT(*) FILTER (WHERE platform = 'web'))\:\:numeric, 2) ELSE 0 END as web_aov,
                COUNT(*) FILTER (WHERE platform = 'web' AND is_new_customer)\:\:bigint as web_new_customer_orders_count,
                COALESCE(SUM(total) FILTER (WHERE platform = 'web' AND is_new_customer), 0)\:\:bigint as web_new_customer_total,
                COUNT(*) FILTER (WHERE platform = 'web' AND NOT is_new_customer)\:\:bigint as web_returning_customer_orders_count,
                COALESCE(SUM(total) FILTER (WHERE platform = 'web' AND NOT is_new_customer), 0)\:\:bigint as web_returning_customer_total,

                -- App platform
                COUNT(*) FILTER (WHERE platform = 'app')\:\:bigint as app_orders_count,
                COALESCE(SUM(total) FILTER (WHERE platform = 'app'), 0)\:\:bigint as app_total,
                CASE WHEN COUNT(*) FILTER (WHERE platform = 'app') > 0
                    THEN ROUND((SUM(total) FILTER (WHERE platform = 'app')\:\:numeric / COUNT(*) FILTER (WHERE platform = 'app'))\:\:numeric, 2) ELSE 0 END as app_aov,
                COUNT(*) FILTER (WHERE platform = 'app' AND is_new_customer)\:\:bigint as app_new_customer_orders_count,
                COALESCE(SUM(total) FILTER (WHERE platform = 'app' AND is_new_customer), 0)\:\:bigint as app_new_customer_total,
                COUNT(*) FILTER (WHERE platform = 'app' AND NOT is_new_customer)\:\:bigint as app_returning_customer_orders_count,
                COALESCE(SUM(total) FILTER (WHERE platform = 'app' AND NOT is_new_customer), 0)\:\:bigint as app_returning_customer_total

            FROM order_classification
        """),
        {"start": start, "end_date": end},
    )

    row = result.mappings().first()
    if not row:
        return _get_empty_monthly_data(year, month)

    aov = round(int(row["total"] or 0) / max(int(row["monthly_orders_count"] or 1), 1))

    return {
        "year": year, "month": month,
        "monthlyOrdersCount": int(row["monthly_orders_count"] or 0),
        "total": int(row["total"] or 0),
        "discountTotal": int(row["discount_total"] or 0),
        "shippingTotal": int(row["shipping_total"] or 0),
        "subTotal": int(row["sub_total"] or 0),
        "redeemedPoints": int(row["redeemed_points"] or 0),
        "aov": aov,
        "newCustomerOrdersCount": int(row["new_customer_orders_count"] or 0),
        "newCustomerTotal": int(row["new_customer_total"] or 0),
        "newCustomerAov": float(row["new_customer_aov"] or 0),
        "returningCustomerOrdersCount": int(row["returning_customer_orders_count"] or 0),
        "returningCustomerTotal": int(row["returning_customer_total"] or 0),
        "returningCustomerAov": float(row["returning_customer_aov"] or 0),
        "webOrdersCount": int(row["web_orders_count"] or 0),
        "webTotal": int(row["web_total"] or 0),
        "webAov": float(row["web_aov"] or 0),
        "appOrdersCount": int(row["app_orders_count"] or 0),
        "appTotal": int(row["app_total"] or 0),
        "appAov": float(row["app_aov"] or 0),
    }


async def store_monthly_orders(
    prod_db: AsyncSession, analytics_db: AsyncSession,
    timezone: str, year: int, month: int,
):
    data = await calculate_monthly_orders(prod_db, timezone, year, month)
    if not data:
        return

    await analytics_db.execute(
        delete(MonthlyOrders).where(
            MonthlyOrders.year == year, MonthlyOrders.month == month,
        )
    )
    analytics_db.add(MonthlyOrders(
        year=year, month=month,
        monthlyOrdersCount=data["monthlyOrdersCount"],
        total=data["total"], discountTotal=data["discountTotal"],
        shippingTotal=data["shippingTotal"], subTotal=data["subTotal"],
        redeemedPoints=data["redeemedPoints"], aov=data["aov"],
        new_customer_orders_count=data["newCustomerOrdersCount"],
        new_customer_total=data["newCustomerTotal"],
        new_customer_aov=data.get("newCustomerAov", 0),
        returning_customer_orders_count=data["returningCustomerOrdersCount"],
        returning_customer_total=data["returningCustomerTotal"],
        returning_customer_aov=data.get("returningCustomerAov", 0),
        web_orders_count=data["webOrdersCount"],
        web_total=data["webTotal"], web_aov=data.get("webAov", 0),
        app_orders_count=data["appOrdersCount"],
        app_total=data["appTotal"], app_aov=data.get("appAov", 0),
    ))
    await analytics_db.commit()
    logger.info(f"Stored monthly orders for {year}-{month}")


def _get_empty_monthly_data(year: int, month: int) -> dict:
    return {
        "year": year, "month": month, "monthlyOrdersCount": 0,
        "total": 0, "discountTotal": 0, "shippingTotal": 0,
        "subTotal": 0, "redeemedPoints": 0, "aov": 0,
        "newCustomerOrdersCount": 0, "newCustomerTotal": 0, "newCustomerAov": 0,
        "returningCustomerOrdersCount": 0, "returningCustomerTotal": 0, "returningCustomerAov": 0,
        "webOrdersCount": 0, "webTotal": 0, "webAov": 0,
        "appOrdersCount": 0, "appTotal": 0, "appAov": 0,
    }
