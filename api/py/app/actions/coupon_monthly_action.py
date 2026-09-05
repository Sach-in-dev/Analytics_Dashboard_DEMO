"""Coupon monthly action — port of coupon-usage-monthly.action.ts."""

import logging
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, delete
from app.utils.date import get_month_range
from app.models.analytics import MonthlyCouponUsage, AnalyticsJobLog

logger = logging.getLogger(__name__)


async def calculate_monthly_coupon_usage(
    prod_db: AsyncSession, timezone: str, year: int, month: int
) -> list[dict]:
    month_range = get_month_range(year, month, timezone)
    start = month_range["start_of_month"]
    end = month_range["end_of_month"]

    result = await prod_db.execute(
        text("""
            WITH coupon_orders AS (
                SELECT
                    d.id as discount_id, d.code as coupon_code, d.name as coupon_name,
                    d.type as discount_type, d.value as discount_value,
                    o.id as order_id, o.total as order_total,
                    du."discountedAmount" as discounted_amount,
                    o.customer_id, o.paid_at,
                    ROW_NUMBER() OVER (PARTITION BY o.customer_id ORDER BY o.paid_at ASC) as customer_order_rank,
                    COUNT(*) OVER (PARTITION BY o.customer_id) as customer_total_orders
                FROM discount_usages du
                JOIN discounts d ON du."discountId" = d.id
                JOIN "order" o ON du."orderId" = o.id
                WHERE o.paid_at >= :start\:\:timestamp AND o.paid_at <= :end\:\:timestamp
            ),
            order_coupon_counts AS (
                SELECT du."orderId" as order_id, COUNT(*) as coupon_count
                FROM discount_usages du
                WHERE du."orderId" IN (SELECT order_id FROM coupon_orders)
                GROUP BY du."orderId"
            )
            SELECT
                co.coupon_code, co.coupon_name, co.discount_type, co.discount_value,
                COUNT(*) as usage_count,
                COUNT(DISTINCT co.customer_id) as unique_customers,
                COUNT(DISTINCT co.order_id) as orders_with_this_coupon,
                SUM(co.discounted_amount)\:\:bigint as total_discount,
                SUM(co.order_total)\:\:bigint as total_revenue,
                AVG(co.order_total)\:\:float as avg_order_value,
                COUNT(*) FILTER (WHERE co.customer_order_rank = 1) as new_customer_usage_count,
                COUNT(*) FILTER (WHERE co.customer_order_rank > 1) as returning_customer_usage_count,
                COUNT(*) FILTER (WHERE co.customer_total_orders = 1 AND co.customer_order_rank = 1) as first_time_customer_count,
                COUNT(*) FILTER (WHERE occ.coupon_count > 1) as stacked_coupon_orders
            FROM coupon_orders co
            LEFT JOIN order_coupon_counts occ ON co.order_id = occ.order_id
            GROUP BY co.coupon_code, co.coupon_name, co.discount_type, co.discount_value
        """),
        {"start": start, "end": end},
    )
    rows = result.mappings().fetchall()
    return [
        {
            "year": year, "month": month,
            "couponCode": r["coupon_code"],
            "couponName": r["coupon_name"],
            "discountType": r["discount_type"],
            "discountValue": float(r["discount_value"] or 0),
            "usageCount": int(r["usage_count"] or 0),
            "uniqueCustomers": int(r["unique_customers"] or 0),
            "ordersWithThisCoupon": int(r["orders_with_this_coupon"] or 0),
            "totalDiscount": int(r["total_discount"] or 0),
            "totalRevenue": int(r["total_revenue"] or 0),
            "avgOrderValue": float(r["avg_order_value"] or 0),
            "newCustomerUsageCount": int(r["new_customer_usage_count"] or 0),
            "returningCustomerUsageCount": int(r["returning_customer_usage_count"] or 0),
            "firstTimeCustomerCount": int(r["first_time_customer_count"] or 0),
            "stackedCouponOrders": int(r["stacked_coupon_orders"] or 0),
        }
        for r in rows
    ]


async def store_monthly_coupon_usage(
    prod_db: AsyncSession, analytics_db: AsyncSession,
    timezone: str, year: int, month: int, job_key: str | None = None,
):
    start_time = datetime.utcnow()
    try:
        data = await calculate_monthly_coupon_usage(prod_db, timezone, year, month)
        for coupon in data:
            await analytics_db.execute(
                delete(MonthlyCouponUsage).where(
                    MonthlyCouponUsage.year == year,
                    MonthlyCouponUsage.month == month,
                    MonthlyCouponUsage.coupon_code == coupon["couponCode"],
                )
            )
            analytics_db.add(MonthlyCouponUsage(
                year=year, month=month,
                coupon_code=coupon["couponCode"],
                coupon_name=coupon["couponName"],
                discount_type=coupon["discountType"],
                discount_value=coupon["discountValue"],
                usage_count=coupon["usageCount"],
                unique_customers=coupon["uniqueCustomers"],
                orders_with_this_coupon=coupon["ordersWithThisCoupon"],
                total_discount=coupon["totalDiscount"],
                total_revenue=coupon["totalRevenue"],
                avg_order_value=coupon["avgOrderValue"],
                new_customer_usage_count=coupon["newCustomerUsageCount"],
                returning_customer_usage_count=coupon["returningCustomerUsageCount"],
                first_time_customer_count=coupon["firstTimeCustomerCount"],
                stacked_coupon_orders=coupon["stackedCouponOrders"],
            ))
        await analytics_db.commit()
        logger.info(f"Stored {len(data)} monthly coupon records for {year}-{month}")

        if job_key:
            duration = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            await _upsert_job_log(analytics_db, job_key, "coupon-monthly", "completed", len(data), duration, {"timezone": timezone, "year": year, "month": month})
    except Exception as e:
        if job_key:
            duration = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            await _upsert_job_log(analytics_db, job_key, "coupon-monthly", "failed", 0, duration, {"timezone": timezone, "year": year, "month": month}, str(e))
        raise


async def get_monthly_coupon_usage(
    analytics_db: AsyncSession, year: int, month: int, code: str | None = None
) -> list[dict] | None:
    stmt = select(MonthlyCouponUsage).where(
        MonthlyCouponUsage.year == year,
        MonthlyCouponUsage.month == month,
    )
    if code:
        stmt = stmt.where(MonthlyCouponUsage.coupon_code == code)

    result = await analytics_db.execute(stmt)
    records = result.scalars().all()
    if not records:
        return None
    return [
        {
            "year": r.year, "month": r.month,
            "couponCode": r.coupon_code, "couponName": r.coupon_name,
            "discountType": r.discount_type, "discountValue": r.discount_value,
            "usageCount": r.usage_count, "uniqueCustomers": r.unique_customers,
            "ordersWithThisCoupon": r.orders_with_this_coupon,
            "totalDiscount": r.total_discount, "totalRevenue": r.total_revenue,
            "avgOrderValue": r.avg_order_value,
            "newCustomerUsageCount": r.new_customer_usage_count,
            "returningCustomerUsageCount": r.returning_customer_usage_count,
            "firstTimeCustomerCount": r.first_time_customer_count,
            "stackedCouponOrders": r.stacked_coupon_orders,
        }
        for r in records
    ]


async def _upsert_job_log(db, job_key, action, status, count, duration, metadata, error=None):
    await db.execute(delete(AnalyticsJobLog).where(AnalyticsJobLog.job_key == job_key))
    db.add(AnalyticsJobLog(
        action=action, job_key=job_key, status=status,
        result_count=count, duration=duration,
        job_metadata=metadata, error=error,
    ))
    await db.commit()
