"""CalculateDailyOrderAction — port of daily-order.action.ts.
Uses raw SQL against prod-db, stores results in analytics-db via SQLAlchemy.
"""

import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, delete
from app.utils.date import get_date
from app.models.analytics import DailyOrders

logger = logging.getLogger(__name__)


def _empty_daily_order_data() -> dict:
    """Return zeroed-out daily order data dict."""
    keys = [
        "total", "discountTotal", "shippingTotal", "subTotal", "redeemedPoints",
        "dailyOrdersCount", "aov",
        "newCustomerOrdersCount", "newCustomerTotal", "newCustomerAov",
        "newCustomerDiscountTotal", "newCustomerShippingTotal", "newCustomerSubTotal",
        "newCustomerRedeemedPoints",
        "returningCustomerOrdersCount", "returningCustomerTotal", "returningCustomerAov",
        "returningCustomerDiscountTotal", "returningCustomerShippingTotal",
        "returningCustomerSubTotal", "returningCustomerRedeemedPoints",
        "ordersWithDiscountCount", "ordersWithoutDiscountCount",
        "newCustomerOrdersWithDiscountCount", "newCustomerOrdersWithoutDiscountCount",
        "returningCustomerOrdersWithDiscountCount", "returningCustomerOrdersWithoutDiscountCount",
        "ordersWithRedeemedPointsCount", "ordersWithoutRedeemedPointsCount",
        "newCustomerOrdersWithRedeemedPointsCount", "newCustomerOrdersWithoutRedeemedPointsCount",
        "returningCustomerOrdersWithRedeemedPointsCount", "returningCustomerOrdersWithoutRedeemedPointsCount",
        "webOrdersCount", "webTotal", "webAov", "webDiscountTotal", "webShippingTotal",
        "webSubTotal", "webRedeemedPoints",
        "webNewCustomerOrdersCount", "webNewCustomerTotal", "webNewCustomerAov",
        "webNewCustomerDiscountTotal", "webNewCustomerShippingTotal", "webNewCustomerSubTotal",
        "webNewCustomerRedeemedPoints",
        "webReturningCustomerOrdersCount", "webReturningCustomerTotal", "webReturningCustomerAov",
        "webReturningCustomerDiscountTotal", "webReturningCustomerShippingTotal",
        "webReturningCustomerSubTotal", "webReturningCustomerRedeemedPoints",
        "webOrdersWithDiscountCount", "webOrdersWithoutDiscountCount",
        "webNewCustomerOrdersWithDiscountCount", "webNewCustomerOrdersWithoutDiscountCount",
        "webReturningCustomerOrdersWithDiscountCount", "webReturningCustomerOrdersWithoutDiscountCount",
        "webOrdersWithRedeemedPointsCount", "webOrdersWithoutRedeemedPointsCount",
        "webNewCustomerOrdersWithRedeemedPointsCount", "webNewCustomerOrdersWithoutRedeemedPointsCount",
        "webReturningCustomerOrdersWithRedeemedPointsCount", "webReturningCustomerOrdersWithoutRedeemedPointsCount",
        "appOrdersCount", "appTotal", "appAov", "appDiscountTotal", "appShippingTotal",
        "appSubTotal", "appRedeemedPoints",
        "appNewCustomerOrdersCount", "appNewCustomerTotal", "appNewCustomerAov",
        "appNewCustomerDiscountTotal", "appNewCustomerShippingTotal", "appNewCustomerSubTotal",
        "appNewCustomerRedeemedPoints",
        "appReturningCustomerOrdersCount", "appReturningCustomerTotal", "appReturningCustomerAov",
        "appReturningCustomerDiscountTotal", "appReturningCustomerShippingTotal",
        "appReturningCustomerSubTotal", "appReturningCustomerRedeemedPoints",
        "appOrdersWithDiscountCount", "appOrdersWithoutDiscountCount",
        "appNewCustomerOrdersWithDiscountCount", "appNewCustomerOrdersWithoutDiscountCount",
        "appReturningCustomerOrdersWithDiscountCount", "appReturningCustomerOrdersWithoutDiscountCount",
        "appOrdersWithRedeemedPointsCount", "appOrdersWithoutRedeemedPointsCount",
        "appNewCustomerOrdersWithRedeemedPointsCount", "appNewCustomerOrdersWithoutRedeemedPointsCount",
        "appReturningCustomerOrdersWithRedeemedPointsCount", "appReturningCustomerOrdersWithoutRedeemedPointsCount",
    ]
    return {k: 0 for k in keys}


async def calculate_daily_orders(
    prod_db: AsyncSession,
    timezone: str,
    date: str,
) -> dict:
    """Execute the raw SQL query against prod-db and return calculated daily orders data."""
    logger.info(f"Calculating daily orders for date: {date}, timezone: {timezone}")

    date_range = get_date(date=date, timezone=timezone)
    start_of_day = date_range["start_of_day"]
    end_of_day = date_range["end_of_day"]

    logger.info(f"Date range - Start: {start_of_day.isoformat()}, End: {end_of_day.isoformat()}")

    # Check if there are any orders
    check_result = await prod_db.execute(
        text("""
            SELECT
                COUNT(*)\:\:bigint as total_count
            FROM "order"
            WHERE (
                (paid_at >= :start_of_day\:\:timestamp AND paid_at <= :end_of_day\:\:timestamp)
                OR
                (paid_at IS NULL AND status IN ('DELIVERED', 'COMPLETED')
                 AND created_at >= :start_of_day\:\:timestamp AND created_at <= :end_of_day\:\:timestamp)
            )
        """),
        {"start_of_day": start_of_day, "end_of_day": end_of_day},
    )
    total_count = check_result.scalar() or 0

    if total_count == 0:
        logger.warning(f"No orders found for date {date}, returning zeros")
        return _empty_daily_order_data()

    # Main CTE query — identical to the NestJS version
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
                    o.id, o.customer_id,
                    COALESCE(o.paid_at, o.created_at) as effective_date,
                    o.total, o.discount_total, o.shipping_total, o.sub_total, o.redeemed_points,
                    CASE WHEN o.metadata->>'source' = 'website' THEN 'web' ELSE 'app' END as platform,
                    CASE
                        WHEN cfo.first_order_at IS NOT NULL
                            AND cfo.first_order_at >= :start_of_day\:\:timestamp
                            AND cfo.first_order_at <= :end_of_day\:\:timestamp
                        THEN true ELSE false
                    END as is_new_customer
                FROM "order" o
                LEFT JOIN customer_first_order cfo ON o.customer_id = cfo.customer_id
                WHERE (
                    (o.paid_at >= :start_of_day\:\:timestamp AND o.paid_at <= :end_of_day\:\:timestamp)
                    OR (o.paid_at IS NULL AND o.status IN ('DELIVERED', 'COMPLETED')
                        AND o.created_at >= :start_of_day\:\:timestamp AND o.created_at <= :end_of_day\:\:timestamp)
                )
            )
            SELECT
                COUNT(*)\:\:bigint as daily_orders_count,
                SUM(total)\:\:bigint as total,
                SUM(discount_total)\:\:bigint as discount_total,
                SUM(shipping_total)\:\:bigint as shipping_total,
                SUM(sub_total)\:\:bigint as sub_total,
                SUM(redeemed_points)\:\:numeric as redeemed_points,
                COUNT(*) FILTER (WHERE is_new_customer)\:\:bigint as new_customer_orders_count,
                SUM(total) FILTER (WHERE is_new_customer)\:\:bigint as new_customer_total,
                CASE WHEN COUNT(*) FILTER (WHERE is_new_customer) > 0
                    THEN ROUND((SUM(total) FILTER (WHERE is_new_customer)\:\:numeric / COUNT(*) FILTER (WHERE is_new_customer))\:\:numeric, 2)
                    ELSE 0 END as new_customer_aov,
                SUM(discount_total) FILTER (WHERE is_new_customer)\:\:bigint as new_customer_discount_total,
                SUM(shipping_total) FILTER (WHERE is_new_customer)\:\:bigint as new_customer_shipping_total,
                SUM(sub_total) FILTER (WHERE is_new_customer)\:\:bigint as new_customer_sub_total,
                SUM(redeemed_points) FILTER (WHERE is_new_customer)\:\:numeric as new_customer_redeemed_points,
                COUNT(*) FILTER (WHERE NOT is_new_customer)\:\:bigint as returning_customer_orders_count,
                SUM(total) FILTER (WHERE NOT is_new_customer)\:\:bigint as returning_customer_total,
                CASE WHEN COUNT(*) FILTER (WHERE NOT is_new_customer) > 0
                    THEN ROUND((SUM(total) FILTER (WHERE NOT is_new_customer)\:\:numeric / COUNT(*) FILTER (WHERE NOT is_new_customer))\:\:numeric, 2)
                    ELSE 0 END as returning_customer_aov,
                SUM(discount_total) FILTER (WHERE NOT is_new_customer)\:\:bigint as returning_customer_discount_total,
                SUM(shipping_total) FILTER (WHERE NOT is_new_customer)\:\:bigint as returning_customer_shipping_total,
                SUM(sub_total) FILTER (WHERE NOT is_new_customer)\:\:bigint as returning_customer_sub_total,
                SUM(redeemed_points) FILTER (WHERE NOT is_new_customer)\:\:numeric as returning_customer_redeemed_points,
                COUNT(*) FILTER (WHERE discount_total > 0)\:\:bigint as orders_with_discount_count,
                COUNT(*) FILTER (WHERE discount_total = 0 OR discount_total IS NULL)\:\:bigint as orders_without_discount_count,
                COUNT(*) FILTER (WHERE is_new_customer AND discount_total > 0)\:\:bigint as ncwdc,
                COUNT(*) FILTER (WHERE is_new_customer AND (discount_total = 0 OR discount_total IS NULL))\:\:bigint as ncwodc,
                COUNT(*) FILTER (WHERE NOT is_new_customer AND discount_total > 0)\:\:bigint as rcwdc,
                COUNT(*) FILTER (WHERE NOT is_new_customer AND (discount_total = 0 OR discount_total IS NULL))\:\:bigint as rcwodc,
                COUNT(*) FILTER (WHERE redeemed_points > 0)\:\:bigint as orders_with_redeemed_points_count,
                COUNT(*) FILTER (WHERE redeemed_points = 0 OR redeemed_points IS NULL)\:\:bigint as orders_without_redeemed_points_count,
                COUNT(*) FILTER (WHERE is_new_customer AND redeemed_points > 0)\:\:bigint as ncwrpc,
                COUNT(*) FILTER (WHERE is_new_customer AND (redeemed_points = 0 OR redeemed_points IS NULL))\:\:bigint as ncworpc,
                COUNT(*) FILTER (WHERE NOT is_new_customer AND redeemed_points > 0)\:\:bigint as rcwrpc,
                COUNT(*) FILTER (WHERE NOT is_new_customer AND (redeemed_points = 0 OR redeemed_points IS NULL))\:\:bigint as rcworpc,
                -- Web
                COUNT(*) FILTER (WHERE platform = 'web')\:\:bigint as web_orders_count,
                SUM(total) FILTER (WHERE platform = 'web')\:\:bigint as web_total,
                CASE WHEN COUNT(*) FILTER (WHERE platform = 'web') > 0
                    THEN ROUND((SUM(total) FILTER (WHERE platform = 'web')\:\:numeric / COUNT(*) FILTER (WHERE platform = 'web'))\:\:numeric, 2) ELSE 0 END as web_aov,
                SUM(discount_total) FILTER (WHERE platform = 'web')\:\:bigint as web_discount_total,
                SUM(shipping_total) FILTER (WHERE platform = 'web')\:\:bigint as web_shipping_total,
                SUM(sub_total) FILTER (WHERE platform = 'web')\:\:bigint as web_sub_total,
                SUM(redeemed_points) FILTER (WHERE platform = 'web')\:\:numeric as web_redeemed_points,
                COUNT(*) FILTER (WHERE platform = 'web' AND is_new_customer)\:\:bigint as web_nc_orders,
                SUM(total) FILTER (WHERE platform = 'web' AND is_new_customer)\:\:bigint as web_nc_total,
                CASE WHEN COUNT(*) FILTER (WHERE platform = 'web' AND is_new_customer) > 0
                    THEN ROUND((SUM(total) FILTER (WHERE platform = 'web' AND is_new_customer)\:\:numeric / COUNT(*) FILTER (WHERE platform = 'web' AND is_new_customer))\:\:numeric, 2) ELSE 0 END as web_nc_aov,
                SUM(discount_total) FILTER (WHERE platform = 'web' AND is_new_customer)\:\:bigint as web_nc_dt,
                SUM(shipping_total) FILTER (WHERE platform = 'web' AND is_new_customer)\:\:bigint as web_nc_st,
                SUM(sub_total) FILTER (WHERE platform = 'web' AND is_new_customer)\:\:bigint as web_nc_subt,
                SUM(redeemed_points) FILTER (WHERE platform = 'web' AND is_new_customer)\:\:numeric as web_nc_rp,
                COUNT(*) FILTER (WHERE platform = 'web' AND NOT is_new_customer)\:\:bigint as web_rc_orders,
                SUM(total) FILTER (WHERE platform = 'web' AND NOT is_new_customer)\:\:bigint as web_rc_total,
                CASE WHEN COUNT(*) FILTER (WHERE platform = 'web' AND NOT is_new_customer) > 0
                    THEN ROUND((SUM(total) FILTER (WHERE platform = 'web' AND NOT is_new_customer)\:\:numeric / COUNT(*) FILTER (WHERE platform = 'web' AND NOT is_new_customer))\:\:numeric, 2) ELSE 0 END as web_rc_aov,
                SUM(discount_total) FILTER (WHERE platform = 'web' AND NOT is_new_customer)\:\:bigint as web_rc_dt,
                SUM(shipping_total) FILTER (WHERE platform = 'web' AND NOT is_new_customer)\:\:bigint as web_rc_st,
                SUM(sub_total) FILTER (WHERE platform = 'web' AND NOT is_new_customer)\:\:bigint as web_rc_subt,
                SUM(redeemed_points) FILTER (WHERE platform = 'web' AND NOT is_new_customer)\:\:numeric as web_rc_rp,
                COUNT(*) FILTER (WHERE platform = 'web' AND discount_total > 0)\:\:bigint as web_wdc,
                COUNT(*) FILTER (WHERE platform = 'web' AND (discount_total = 0 OR discount_total IS NULL))\:\:bigint as web_wodc,
                COUNT(*) FILTER (WHERE platform = 'web' AND is_new_customer AND discount_total > 0)\:\:bigint as web_nc_wdc,
                COUNT(*) FILTER (WHERE platform = 'web' AND is_new_customer AND (discount_total = 0 OR discount_total IS NULL))\:\:bigint as web_nc_wodc,
                COUNT(*) FILTER (WHERE platform = 'web' AND NOT is_new_customer AND discount_total > 0)\:\:bigint as web_rc_wdc,
                COUNT(*) FILTER (WHERE platform = 'web' AND NOT is_new_customer AND (discount_total = 0 OR discount_total IS NULL))\:\:bigint as web_rc_wodc,
                COUNT(*) FILTER (WHERE platform = 'web' AND redeemed_points > 0)\:\:bigint as web_wrpc,
                COUNT(*) FILTER (WHERE platform = 'web' AND (redeemed_points = 0 OR redeemed_points IS NULL))\:\:bigint as web_worpc,
                COUNT(*) FILTER (WHERE platform = 'web' AND is_new_customer AND redeemed_points > 0)\:\:bigint as web_nc_wrpc,
                COUNT(*) FILTER (WHERE platform = 'web' AND is_new_customer AND (redeemed_points = 0 OR redeemed_points IS NULL))\:\:bigint as web_nc_worpc,
                COUNT(*) FILTER (WHERE platform = 'web' AND NOT is_new_customer AND redeemed_points > 0)\:\:bigint as web_rc_wrpc,
                COUNT(*) FILTER (WHERE platform = 'web' AND NOT is_new_customer AND (redeemed_points = 0 OR redeemed_points IS NULL))\:\:bigint as web_rc_worpc,
                -- App
                COUNT(*) FILTER (WHERE platform = 'app')\:\:bigint as app_orders_count,
                SUM(total) FILTER (WHERE platform = 'app')\:\:bigint as app_total,
                CASE WHEN COUNT(*) FILTER (WHERE platform = 'app') > 0
                    THEN ROUND((SUM(total) FILTER (WHERE platform = 'app')\:\:numeric / COUNT(*) FILTER (WHERE platform = 'app'))\:\:numeric, 2) ELSE 0 END as app_aov,
                SUM(discount_total) FILTER (WHERE platform = 'app')\:\:bigint as app_discount_total,
                SUM(shipping_total) FILTER (WHERE platform = 'app')\:\:bigint as app_shipping_total,
                SUM(sub_total) FILTER (WHERE platform = 'app')\:\:bigint as app_sub_total,
                SUM(redeemed_points) FILTER (WHERE platform = 'app')\:\:numeric as app_redeemed_points,
                COUNT(*) FILTER (WHERE platform = 'app' AND is_new_customer)\:\:bigint as app_nc_orders,
                SUM(total) FILTER (WHERE platform = 'app' AND is_new_customer)\:\:bigint as app_nc_total,
                CASE WHEN COUNT(*) FILTER (WHERE platform = 'app' AND is_new_customer) > 0
                    THEN ROUND((SUM(total) FILTER (WHERE platform = 'app' AND is_new_customer)\:\:numeric / COUNT(*) FILTER (WHERE platform = 'app' AND is_new_customer))\:\:numeric, 2) ELSE 0 END as app_nc_aov,
                SUM(discount_total) FILTER (WHERE platform = 'app' AND is_new_customer)\:\:bigint as app_nc_dt,
                SUM(shipping_total) FILTER (WHERE platform = 'app' AND is_new_customer)\:\:bigint as app_nc_st,
                SUM(sub_total) FILTER (WHERE platform = 'app' AND is_new_customer)\:\:bigint as app_nc_subt,
                SUM(redeemed_points) FILTER (WHERE platform = 'app' AND is_new_customer)\:\:numeric as app_nc_rp,
                COUNT(*) FILTER (WHERE platform = 'app' AND NOT is_new_customer)\:\:bigint as app_rc_orders,
                SUM(total) FILTER (WHERE platform = 'app' AND NOT is_new_customer)\:\:bigint as app_rc_total,
                CASE WHEN COUNT(*) FILTER (WHERE platform = 'app' AND NOT is_new_customer) > 0
                    THEN ROUND((SUM(total) FILTER (WHERE platform = 'app' AND NOT is_new_customer)\:\:numeric / COUNT(*) FILTER (WHERE platform = 'app' AND NOT is_new_customer))\:\:numeric, 2) ELSE 0 END as app_rc_aov,
                SUM(discount_total) FILTER (WHERE platform = 'app' AND NOT is_new_customer)\:\:bigint as app_rc_dt,
                SUM(shipping_total) FILTER (WHERE platform = 'app' AND NOT is_new_customer)\:\:bigint as app_rc_st,
                SUM(sub_total) FILTER (WHERE platform = 'app' AND NOT is_new_customer)\:\:bigint as app_rc_subt,
                SUM(redeemed_points) FILTER (WHERE platform = 'app' AND NOT is_new_customer)\:\:numeric as app_rc_rp,
                COUNT(*) FILTER (WHERE platform = 'app' AND discount_total > 0)\:\:bigint as app_wdc,
                COUNT(*) FILTER (WHERE platform = 'app' AND (discount_total = 0 OR discount_total IS NULL))\:\:bigint as app_wodc,
                COUNT(*) FILTER (WHERE platform = 'app' AND is_new_customer AND discount_total > 0)\:\:bigint as app_nc_wdc,
                COUNT(*) FILTER (WHERE platform = 'app' AND is_new_customer AND (discount_total = 0 OR discount_total IS NULL))\:\:bigint as app_nc_wodc,
                COUNT(*) FILTER (WHERE platform = 'app' AND NOT is_new_customer AND discount_total > 0)\:\:bigint as app_rc_wdc,
                COUNT(*) FILTER (WHERE platform = 'app' AND NOT is_new_customer AND (discount_total = 0 OR discount_total IS NULL))\:\:bigint as app_rc_wodc,
                COUNT(*) FILTER (WHERE platform = 'app' AND redeemed_points > 0)\:\:bigint as app_wrpc,
                COUNT(*) FILTER (WHERE platform = 'app' AND (redeemed_points = 0 OR redeemed_points IS NULL))\:\:bigint as app_worpc,
                COUNT(*) FILTER (WHERE platform = 'app' AND is_new_customer AND redeemed_points > 0)\:\:bigint as app_nc_wrpc,
                COUNT(*) FILTER (WHERE platform = 'app' AND is_new_customer AND (redeemed_points = 0 OR redeemed_points IS NULL))\:\:bigint as app_nc_worpc,
                COUNT(*) FILTER (WHERE platform = 'app' AND NOT is_new_customer AND redeemed_points > 0)\:\:bigint as app_rc_wrpc,
                COUNT(*) FILTER (WHERE platform = 'app' AND NOT is_new_customer AND (redeemed_points = 0 OR redeemed_points IS NULL))\:\:bigint as app_rc_worpc
            FROM order_classification
        """),
        {"start_of_day": start_of_day, "end_of_day": end_of_day},
    )
    row = result.mappings().fetchone()
    if not row:
        return _empty_daily_order_data()

    daily_count = int(row["daily_orders_count"] or 0)
    total = int(row["total"] or 0)

    return {
        "total": total,
        "discountTotal": int(row["discount_total"] or 0),
        "shippingTotal": int(row["shipping_total"] or 0),
        "subTotal": int(row["sub_total"] or 0),
        "redeemedPoints": int(row["redeemed_points"] or 0),
        "dailyOrdersCount": daily_count,
        "aov": total / daily_count if daily_count > 0 else 0,
        "newCustomerOrdersCount": int(row["new_customer_orders_count"] or 0),
        "newCustomerTotal": int(row["new_customer_total"] or 0),
        "newCustomerAov": float(row["new_customer_aov"] or 0),
        "newCustomerDiscountTotal": int(row["new_customer_discount_total"] or 0),
        "newCustomerShippingTotal": int(row["new_customer_shipping_total"] or 0),
        "newCustomerSubTotal": int(row["new_customer_sub_total"] or 0),
        "newCustomerRedeemedPoints": int(row["new_customer_redeemed_points"] or 0),
        "returningCustomerOrdersCount": int(row["returning_customer_orders_count"] or 0),
        "returningCustomerTotal": int(row["returning_customer_total"] or 0),
        "returningCustomerAov": float(row["returning_customer_aov"] or 0),
        "returningCustomerDiscountTotal": int(row["returning_customer_discount_total"] or 0),
        "returningCustomerShippingTotal": int(row["returning_customer_shipping_total"] or 0),
        "returningCustomerSubTotal": int(row["returning_customer_sub_total"] or 0),
        "returningCustomerRedeemedPoints": int(row["returning_customer_redeemed_points"] or 0),
        "ordersWithDiscountCount": int(row["orders_with_discount_count"] or 0),
        "ordersWithoutDiscountCount": int(row["orders_without_discount_count"] or 0),
        "newCustomerOrdersWithDiscountCount": int(row["ncwdc"] or 0),
        "newCustomerOrdersWithoutDiscountCount": int(row["ncwodc"] or 0),
        "returningCustomerOrdersWithDiscountCount": int(row["rcwdc"] or 0),
        "returningCustomerOrdersWithoutDiscountCount": int(row["rcwodc"] or 0),
        "ordersWithRedeemedPointsCount": int(row["orders_with_redeemed_points_count"] or 0),
        "ordersWithoutRedeemedPointsCount": int(row["orders_without_redeemed_points_count"] or 0),
        "newCustomerOrdersWithRedeemedPointsCount": int(row["ncwrpc"] or 0),
        "newCustomerOrdersWithoutRedeemedPointsCount": int(row["ncworpc"] or 0),
        "returningCustomerOrdersWithRedeemedPointsCount": int(row["rcwrpc"] or 0),
        "returningCustomerOrdersWithoutRedeemedPointsCount": int(row["rcworpc"] or 0),
        # Web
        "webOrdersCount": int(row["web_orders_count"] or 0),
        "webTotal": int(row["web_total"] or 0),
        "webAov": float(row["web_aov"] or 0),
        "webDiscountTotal": int(row["web_discount_total"] or 0),
        "webShippingTotal": int(row["web_shipping_total"] or 0),
        "webSubTotal": int(row["web_sub_total"] or 0),
        "webRedeemedPoints": int(row["web_redeemed_points"] or 0),
        "webNewCustomerOrdersCount": int(row["web_nc_orders"] or 0),
        "webNewCustomerTotal": int(row["web_nc_total"] or 0),
        "webNewCustomerAov": float(row["web_nc_aov"] or 0),
        "webNewCustomerDiscountTotal": int(row["web_nc_dt"] or 0),
        "webNewCustomerShippingTotal": int(row["web_nc_st"] or 0),
        "webNewCustomerSubTotal": int(row["web_nc_subt"] or 0),
        "webNewCustomerRedeemedPoints": int(row["web_nc_rp"] or 0),
        "webReturningCustomerOrdersCount": int(row["web_rc_orders"] or 0),
        "webReturningCustomerTotal": int(row["web_rc_total"] or 0),
        "webReturningCustomerAov": float(row["web_rc_aov"] or 0),
        "webReturningCustomerDiscountTotal": int(row["web_rc_dt"] or 0),
        "webReturningCustomerShippingTotal": int(row["web_rc_st"] or 0),
        "webReturningCustomerSubTotal": int(row["web_rc_subt"] or 0),
        "webReturningCustomerRedeemedPoints": int(row["web_rc_rp"] or 0),
        "webOrdersWithDiscountCount": int(row["web_wdc"] or 0),
        "webOrdersWithoutDiscountCount": int(row["web_wodc"] or 0),
        "webNewCustomerOrdersWithDiscountCount": int(row["web_nc_wdc"] or 0),
        "webNewCustomerOrdersWithoutDiscountCount": int(row["web_nc_wodc"] or 0),
        "webReturningCustomerOrdersWithDiscountCount": int(row["web_rc_wdc"] or 0),
        "webReturningCustomerOrdersWithoutDiscountCount": int(row["web_rc_wodc"] or 0),
        "webOrdersWithRedeemedPointsCount": int(row["web_wrpc"] or 0),
        "webOrdersWithoutRedeemedPointsCount": int(row["web_worpc"] or 0),
        "webNewCustomerOrdersWithRedeemedPointsCount": int(row["web_nc_wrpc"] or 0),
        "webNewCustomerOrdersWithoutRedeemedPointsCount": int(row["web_nc_worpc"] or 0),
        "webReturningCustomerOrdersWithRedeemedPointsCount": int(row["web_rc_wrpc"] or 0),
        "webReturningCustomerOrdersWithoutRedeemedPointsCount": int(row["web_rc_worpc"] or 0),
        # App
        "appOrdersCount": int(row["app_orders_count"] or 0),
        "appTotal": int(row["app_total"] or 0),
        "appAov": float(row["app_aov"] or 0),
        "appDiscountTotal": int(row["app_discount_total"] or 0),
        "appShippingTotal": int(row["app_shipping_total"] or 0),
        "appSubTotal": int(row["app_sub_total"] or 0),
        "appRedeemedPoints": int(row["app_redeemed_points"] or 0),
        "appNewCustomerOrdersCount": int(row["app_nc_orders"] or 0),
        "appNewCustomerTotal": int(row["app_nc_total"] or 0),
        "appNewCustomerAov": float(row["app_nc_aov"] or 0),
        "appNewCustomerDiscountTotal": int(row["app_nc_dt"] or 0),
        "appNewCustomerShippingTotal": int(row["app_nc_st"] or 0),
        "appNewCustomerSubTotal": int(row["app_nc_subt"] or 0),
        "appNewCustomerRedeemedPoints": int(row["app_nc_rp"] or 0),
        "appReturningCustomerOrdersCount": int(row["app_rc_orders"] or 0),
        "appReturningCustomerTotal": int(row["app_rc_total"] or 0),
        "appReturningCustomerAov": float(row["app_rc_aov"] or 0),
        "appReturningCustomerDiscountTotal": int(row["app_rc_dt"] or 0),
        "appReturningCustomerShippingTotal": int(row["app_rc_st"] or 0),
        "appReturningCustomerSubTotal": int(row["app_rc_subt"] or 0),
        "appReturningCustomerRedeemedPoints": int(row["app_rc_rp"] or 0),
        "appOrdersWithDiscountCount": int(row["app_wdc"] or 0),
        "appOrdersWithoutDiscountCount": int(row["app_wodc"] or 0),
        "appNewCustomerOrdersWithDiscountCount": int(row["app_nc_wdc"] or 0),
        "appNewCustomerOrdersWithoutDiscountCount": int(row["app_nc_wodc"] or 0),
        "appReturningCustomerOrdersWithDiscountCount": int(row["app_rc_wdc"] or 0),
        "appReturningCustomerOrdersWithoutDiscountCount": int(row["app_rc_wodc"] or 0),
        "appOrdersWithRedeemedPointsCount": int(row["app_wrpc"] or 0),
        "appOrdersWithoutRedeemedPointsCount": int(row["app_worpc"] or 0),
        "appNewCustomerOrdersWithRedeemedPointsCount": int(row["app_nc_wrpc"] or 0),
        "appNewCustomerOrdersWithoutRedeemedPointsCount": int(row["app_nc_worpc"] or 0),
        "appReturningCustomerOrdersWithRedeemedPointsCount": int(row["app_rc_wrpc"] or 0),
        "appReturningCustomerOrdersWithoutRedeemedPointsCount": int(row["app_rc_worpc"] or 0),
    }


async def store_daily_orders(
    prod_db: AsyncSession,
    analytics_db: AsyncSession,
    timezone: str,
    date: str,
):
    """Calculate daily orders from prod-db and store in analytics-db."""
    data = await calculate_daily_orders(prod_db, timezone, date)
    date_range = get_date(date=date, timezone=timezone)

    # Delete existing record for this date to prevent duplicates (upsert pattern)
    await analytics_db.execute(
        delete(DailyOrders).where(DailyOrders.date == date_range["start_of_day"])
    )

    order = DailyOrders(
        date=date_range["start_of_day"],
        total=data["total"],
        discountTotal=data["discountTotal"],
        shippingTotal=data["shippingTotal"],
        subTotal=data["subTotal"],
        redeemedPoints=data["redeemedPoints"],
        dailyOrdersCount=data["dailyOrdersCount"],
        aov=int(data["aov"]),
        new_customer_orders_count=data["newCustomerOrdersCount"],
        new_customer_total=data["newCustomerTotal"],
        new_customer_aov=int(data["newCustomerAov"]),
        new_customer_discount_total=data["newCustomerDiscountTotal"],
        new_customer_shipping_total=data["newCustomerShippingTotal"],
        new_customer_sub_total=data["newCustomerSubTotal"],
        new_customer_redeemed_points=data["newCustomerRedeemedPoints"],
        returning_customer_orders_count=data["returningCustomerOrdersCount"],
        returning_customer_total=data["returningCustomerTotal"],
        returning_customer_aov=int(data["returningCustomerAov"]),
        returning_customer_discount_total=data["returningCustomerDiscountTotal"],
        returning_customer_shipping_total=data["returningCustomerShippingTotal"],
        returning_customer_sub_total=data["returningCustomerSubTotal"],
        returning_customer_redeemed_points=data["returningCustomerRedeemedPoints"],
        orders_with_discount_count=data["ordersWithDiscountCount"],
        orders_without_discount_count=data["ordersWithoutDiscountCount"],
        new_customer_orders_with_discount_count=data["newCustomerOrdersWithDiscountCount"],
        new_customer_orders_without_discount_count=data["newCustomerOrdersWithoutDiscountCount"],
        returning_customer_orders_with_discount_count=data["returningCustomerOrdersWithDiscountCount"],
        returning_customer_orders_without_discount_count=data["returningCustomerOrdersWithoutDiscountCount"],
        orders_with_redeemed_points_count=data["ordersWithRedeemedPointsCount"],
        orders_without_redeemed_points_count=data["ordersWithoutRedeemedPointsCount"],
        new_customer_orders_with_redeemed_points_count=data["newCustomerOrdersWithRedeemedPointsCount"],
        new_customer_orders_without_redeemed_points_count=data["newCustomerOrdersWithoutRedeemedPointsCount"],
        returning_customer_orders_with_redeemed_points_count=data["returningCustomerOrdersWithRedeemedPointsCount"],
        returning_customer_orders_without_redeemed_points_count=data["returningCustomerOrdersWithoutRedeemedPointsCount"],
        web_orders_count=data["webOrdersCount"],
        web_total=data["webTotal"],
        web_aov=int(data["webAov"]),
        web_discount_total=data["webDiscountTotal"],
        web_shipping_total=data["webShippingTotal"],
        web_sub_total=data["webSubTotal"],
        web_redeemed_points=data["webRedeemedPoints"],
        web_new_customer_orders_count=data["webNewCustomerOrdersCount"],
        web_new_customer_total=data["webNewCustomerTotal"],
        web_new_customer_aov=int(data["webNewCustomerAov"]),
        web_new_customer_discount_total=data["webNewCustomerDiscountTotal"],
        web_new_customer_shipping_total=data["webNewCustomerShippingTotal"],
        web_new_customer_sub_total=data["webNewCustomerSubTotal"],
        web_new_customer_redeemed_points=data["webNewCustomerRedeemedPoints"],
        web_returning_customer_orders_count=data["webReturningCustomerOrdersCount"],
        web_returning_customer_total=data["webReturningCustomerTotal"],
        web_returning_customer_aov=int(data["webReturningCustomerAov"]),
        web_returning_customer_discount_total=data["webReturningCustomerDiscountTotal"],
        web_returning_customer_shipping_total=data["webReturningCustomerShippingTotal"],
        web_returning_customer_sub_total=data["webReturningCustomerSubTotal"],
        web_returning_customer_redeemed_points=data["webReturningCustomerRedeemedPoints"],
        web_orders_with_discount_count=data["webOrdersWithDiscountCount"],
        web_orders_without_discount_count=data["webOrdersWithoutDiscountCount"],
        web_new_customer_orders_with_discount_count=data["webNewCustomerOrdersWithDiscountCount"],
        web_new_customer_orders_without_discount_count=data["webNewCustomerOrdersWithoutDiscountCount"],
        web_returning_customer_orders_with_discount_count=data["webReturningCustomerOrdersWithDiscountCount"],
        web_returning_customer_orders_without_discount_count=data["webReturningCustomerOrdersWithoutDiscountCount"],
        web_orders_with_redeemed_points_count=data["webOrdersWithRedeemedPointsCount"],
        web_orders_without_redeemed_points_count=data["webOrdersWithoutRedeemedPointsCount"],
        web_new_customer_orders_with_redeemed_points_count=data["webNewCustomerOrdersWithRedeemedPointsCount"],
        web_new_customer_orders_without_redeemed_points_count=data["webNewCustomerOrdersWithoutRedeemedPointsCount"],
        web_returning_customer_orders_with_redeemed_points_count=data["webReturningCustomerOrdersWithRedeemedPointsCount"],
        web_returning_customer_orders_without_redeemed_points_count=data["webReturningCustomerOrdersWithoutRedeemedPointsCount"],
        app_orders_count=data["appOrdersCount"],
        app_total=data["appTotal"],
        app_aov=int(data["appAov"]),
        app_discount_total=data["appDiscountTotal"],
        app_shipping_total=data["appShippingTotal"],
        app_sub_total=data["appSubTotal"],
        app_redeemed_points=data["appRedeemedPoints"],
        app_new_customer_orders_count=data["appNewCustomerOrdersCount"],
        app_new_customer_total=data["appNewCustomerTotal"],
        app_new_customer_aov=int(data["appNewCustomerAov"]),
        app_new_customer_discount_total=data["appNewCustomerDiscountTotal"],
        app_new_customer_shipping_total=data["appNewCustomerShippingTotal"],
        app_new_customer_sub_total=data["appNewCustomerSubTotal"],
        app_new_customer_redeemed_points=data["appNewCustomerRedeemedPoints"],
        app_returning_customer_orders_count=data["appReturningCustomerOrdersCount"],
        app_returning_customer_total=data["appReturningCustomerTotal"],
        app_returning_customer_aov=int(data["appReturningCustomerAov"]),
        app_returning_customer_discount_total=data["appReturningCustomerDiscountTotal"],
        app_returning_customer_shipping_total=data["appReturningCustomerShippingTotal"],
        app_returning_customer_sub_total=data["appReturningCustomerSubTotal"],
        app_returning_customer_redeemed_points=data["appReturningCustomerRedeemedPoints"],
        app_orders_with_discount_count=data["appOrdersWithDiscountCount"],
        app_orders_without_discount_count=data["appOrdersWithoutDiscountCount"],
        app_new_customer_orders_with_discount_count=data["appNewCustomerOrdersWithDiscountCount"],
        app_new_customer_orders_without_discount_count=data["appNewCustomerOrdersWithoutDiscountCount"],
        app_returning_customer_orders_with_discount_count=data["appReturningCustomerOrdersWithDiscountCount"],
        app_returning_customer_orders_without_discount_count=data["appReturningCustomerOrdersWithoutDiscountCount"],
        app_orders_with_redeemed_points_count=data["appOrdersWithRedeemedPointsCount"],
        app_orders_without_redeemed_points_count=data["appOrdersWithoutRedeemedPointsCount"],
        app_new_customer_orders_with_redeemed_points_count=data["appNewCustomerOrdersWithRedeemedPointsCount"],
        app_new_customer_orders_without_redeemed_points_count=data["appNewCustomerOrdersWithoutRedeemedPointsCount"],
        app_returning_customer_orders_with_redeemed_points_count=data["appReturningCustomerOrdersWithRedeemedPointsCount"],
        app_returning_customer_orders_without_redeemed_points_count=data["appReturningCustomerOrdersWithoutRedeemedPointsCount"],
    )
    analytics_db.add(order)
    await analytics_db.commit()
    logger.info(f"Stored daily orders for date: {date}")
