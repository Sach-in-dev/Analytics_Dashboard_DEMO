import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Integer, Float, DateTime, Text, Index,
    UniqueConstraint, JSON, Boolean, Date, text
)
from sqlalchemy.dialects.postgresql import JSONB
from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


# True JSONB on Postgres (unchanged behavior there); plain JSON on any other
# dialect (e.g. SQLite for the portable demo build) — same app-level
# behavior either way since nothing here uses JSONB-only operators.
PortableJSONB = JSON().with_variant(JSONB, "postgresql")


# ---------- daily_orders ----------
class DailyOrders(Base):
    __tablename__ = "daily_orders"

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(DateTime, nullable=False, unique=True)
    total = Column(Integer, nullable=False)
    discountTotal = Column("discountTotal", Integer, nullable=False)
    shippingTotal = Column("shippingTotal", Integer, nullable=False)
    subTotal = Column("subTotal", Integer, nullable=False)
    redeemedPoints = Column("redeemedPoints", Integer, nullable=False)
    dailyOrdersCount = Column("dailyOrdersCount", Integer, nullable=False)
    aov = Column(Integer, nullable=False)

    # New customer metrics
    new_customer_orders_count = Column(Integer, nullable=False, default=0)
    new_customer_total = Column(Integer, nullable=False, default=0)
    new_customer_aov = Column(Integer, nullable=False, default=0)
    new_customer_discount_total = Column(Integer, nullable=False, default=0)
    new_customer_shipping_total = Column(Integer, nullable=False, default=0)
    new_customer_sub_total = Column(Integer, nullable=False, default=0)
    new_customer_redeemed_points = Column(Integer, nullable=False, default=0)

    # Returning customer metrics
    returning_customer_orders_count = Column(Integer, nullable=False, default=0)
    returning_customer_total = Column(Integer, nullable=False, default=0)
    returning_customer_aov = Column(Integer, nullable=False, default=0)
    returning_customer_discount_total = Column(Integer, nullable=False, default=0)
    returning_customer_shipping_total = Column(Integer, nullable=False, default=0)
    returning_customer_sub_total = Column(Integer, nullable=False, default=0)
    returning_customer_redeemed_points = Column(Integer, nullable=False, default=0)

    # Discount analytics
    orders_with_discount_count = Column(Integer, nullable=False, default=0)
    orders_without_discount_count = Column(Integer, nullable=False, default=0)
    new_customer_orders_with_discount_count = Column(Integer, nullable=False, default=0)
    new_customer_orders_without_discount_count = Column(Integer, nullable=False, default=0)
    returning_customer_orders_with_discount_count = Column(Integer, nullable=False, default=0)
    returning_customer_orders_without_discount_count = Column(Integer, nullable=False, default=0)

    # Redeemed points analytics
    orders_with_redeemed_points_count = Column(Integer, nullable=False, default=0)
    orders_without_redeemed_points_count = Column(Integer, nullable=False, default=0)
    new_customer_orders_with_redeemed_points_count = Column(Integer, nullable=False, default=0)
    new_customer_orders_without_redeemed_points_count = Column(Integer, nullable=False, default=0)
    returning_customer_orders_with_redeemed_points_count = Column(Integer, nullable=False, default=0)
    returning_customer_orders_without_redeemed_points_count = Column(Integer, nullable=False, default=0)

    # Web platform metrics
    web_orders_count = Column(Integer, nullable=False, default=0)
    web_total = Column(Integer, nullable=False, default=0)
    web_aov = Column(Integer, nullable=False, default=0)
    web_discount_total = Column(Integer, nullable=False, default=0)
    web_shipping_total = Column(Integer, nullable=False, default=0)
    web_sub_total = Column(Integer, nullable=False, default=0)
    web_redeemed_points = Column(Integer, nullable=False, default=0)
    web_new_customer_orders_count = Column(Integer, nullable=False, default=0)
    web_new_customer_total = Column(Integer, nullable=False, default=0)
    web_new_customer_aov = Column(Integer, nullable=False, default=0)
    web_new_customer_discount_total = Column(Integer, nullable=False, default=0)
    web_new_customer_shipping_total = Column(Integer, nullable=False, default=0)
    web_new_customer_sub_total = Column(Integer, nullable=False, default=0)
    web_new_customer_redeemed_points = Column(Integer, nullable=False, default=0)
    web_returning_customer_orders_count = Column(Integer, nullable=False, default=0)
    web_returning_customer_total = Column(Integer, nullable=False, default=0)
    web_returning_customer_aov = Column(Integer, nullable=False, default=0)
    web_returning_customer_discount_total = Column(Integer, nullable=False, default=0)
    web_returning_customer_shipping_total = Column(Integer, nullable=False, default=0)
    web_returning_customer_sub_total = Column(Integer, nullable=False, default=0)
    web_returning_customer_redeemed_points = Column(Integer, nullable=False, default=0)
    web_orders_with_discount_count = Column(Integer, nullable=False, default=0)
    web_orders_without_discount_count = Column(Integer, nullable=False, default=0)
    web_new_customer_orders_with_discount_count = Column(Integer, nullable=False, default=0)
    web_new_customer_orders_without_discount_count = Column(Integer, nullable=False, default=0)
    web_returning_customer_orders_with_discount_count = Column(Integer, nullable=False, default=0)
    web_returning_customer_orders_without_discount_count = Column(Integer, nullable=False, default=0)
    web_orders_with_redeemed_points_count = Column(Integer, nullable=False, default=0)
    web_orders_without_redeemed_points_count = Column(Integer, nullable=False, default=0)
    web_new_customer_orders_with_redeemed_points_count = Column(Integer, nullable=False, default=0)
    web_new_customer_orders_without_redeemed_points_count = Column(Integer, nullable=False, default=0)
    web_returning_customer_orders_with_redeemed_points_count = Column(Integer, nullable=False, default=0)
    web_returning_customer_orders_without_redeemed_points_count = Column(Integer, nullable=False, default=0)

    # App platform metrics
    app_orders_count = Column(Integer, nullable=False, default=0)
    app_total = Column(Integer, nullable=False, default=0)
    app_aov = Column(Integer, nullable=False, default=0)
    app_discount_total = Column(Integer, nullable=False, default=0)
    app_shipping_total = Column(Integer, nullable=False, default=0)
    app_sub_total = Column(Integer, nullable=False, default=0)
    app_redeemed_points = Column(Integer, nullable=False, default=0)
    app_new_customer_orders_count = Column(Integer, nullable=False, default=0)
    app_new_customer_total = Column(Integer, nullable=False, default=0)
    app_new_customer_aov = Column(Integer, nullable=False, default=0)
    app_new_customer_discount_total = Column(Integer, nullable=False, default=0)
    app_new_customer_shipping_total = Column(Integer, nullable=False, default=0)
    app_new_customer_sub_total = Column(Integer, nullable=False, default=0)
    app_new_customer_redeemed_points = Column(Integer, nullable=False, default=0)
    app_returning_customer_orders_count = Column(Integer, nullable=False, default=0)
    app_returning_customer_total = Column(Integer, nullable=False, default=0)
    app_returning_customer_aov = Column(Integer, nullable=False, default=0)
    app_returning_customer_discount_total = Column(Integer, nullable=False, default=0)
    app_returning_customer_shipping_total = Column(Integer, nullable=False, default=0)
    app_returning_customer_sub_total = Column(Integer, nullable=False, default=0)
    app_returning_customer_redeemed_points = Column(Integer, nullable=False, default=0)
    app_orders_with_discount_count = Column(Integer, nullable=False, default=0)
    app_orders_without_discount_count = Column(Integer, nullable=False, default=0)
    app_new_customer_orders_with_discount_count = Column(Integer, nullable=False, default=0)
    app_new_customer_orders_without_discount_count = Column(Integer, nullable=False, default=0)
    app_returning_customer_orders_with_discount_count = Column(Integer, nullable=False, default=0)
    app_returning_customer_orders_without_discount_count = Column(Integer, nullable=False, default=0)
    app_orders_with_redeemed_points_count = Column(Integer, nullable=False, default=0)
    app_orders_without_redeemed_points_count = Column(Integer, nullable=False, default=0)
    app_new_customer_orders_with_redeemed_points_count = Column(Integer, nullable=False, default=0)
    app_new_customer_orders_without_redeemed_points_count = Column(Integer, nullable=False, default=0)
    app_returning_customer_orders_with_redeemed_points_count = Column(Integer, nullable=False, default=0)
    app_returning_customer_orders_without_redeemed_points_count = Column(Integer, nullable=False, default=0)

    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


# ---------- monthly_orders ----------
class MonthlyOrders(Base):
    __tablename__ = "monthly_orders"
    __table_args__ = (
        UniqueConstraint("year", "month", name="monthly_orders_year_month_key"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    total = Column(Integer, nullable=False)
    discountTotal = Column("discountTotal", Integer, nullable=False)
    shippingTotal = Column("shippingTotal", Integer, nullable=False)
    subTotal = Column("subTotal", Integer, nullable=False)
    redeemedPoints = Column("redeemedPoints", Integer, nullable=False)
    monthlyOrdersCount = Column("monthlyOrdersCount", Integer, nullable=False)
    aov = Column(Integer, nullable=False)

    # New customer metrics
    new_customer_orders_count = Column(Integer, nullable=False, default=0)
    new_customer_total = Column(Integer, nullable=False, default=0)
    new_customer_aov = Column(Integer, nullable=False, default=0)
    new_customer_discount_total = Column(Integer, nullable=False, default=0)
    new_customer_shipping_total = Column(Integer, nullable=False, default=0)
    new_customer_sub_total = Column(Integer, nullable=False, default=0)
    new_customer_redeemed_points = Column(Integer, nullable=False, default=0)

    # Returning customer metrics
    returning_customer_orders_count = Column(Integer, nullable=False, default=0)
    returning_customer_total = Column(Integer, nullable=False, default=0)
    returning_customer_aov = Column(Integer, nullable=False, default=0)
    returning_customer_discount_total = Column(Integer, nullable=False, default=0)
    returning_customer_shipping_total = Column(Integer, nullable=False, default=0)
    returning_customer_sub_total = Column(Integer, nullable=False, default=0)
    returning_customer_redeemed_points = Column(Integer, nullable=False, default=0)

    # Discount analytics
    orders_with_discount_count = Column(Integer, nullable=False, default=0)
    orders_without_discount_count = Column(Integer, nullable=False, default=0)
    new_customer_orders_with_discount_count = Column(Integer, nullable=False, default=0)
    new_customer_orders_without_discount_count = Column(Integer, nullable=False, default=0)
    returning_customer_orders_with_discount_count = Column(Integer, nullable=False, default=0)
    returning_customer_orders_without_discount_count = Column(Integer, nullable=False, default=0)

    # Redeemed points analytics
    orders_with_redeemed_points_count = Column(Integer, nullable=False, default=0)
    orders_without_redeemed_points_count = Column(Integer, nullable=False, default=0)
    new_customer_orders_with_redeemed_points_count = Column(Integer, nullable=False, default=0)
    new_customer_orders_without_redeemed_points_count = Column(Integer, nullable=False, default=0)
    returning_customer_orders_with_redeemed_points_count = Column(Integer, nullable=False, default=0)
    returning_customer_orders_without_redeemed_points_count = Column(Integer, nullable=False, default=0)

    # Web platform metrics
    web_orders_count = Column(Integer, nullable=False, default=0)
    web_total = Column(Integer, nullable=False, default=0)
    web_aov = Column(Integer, nullable=False, default=0)
    web_discount_total = Column(Integer, nullable=False, default=0)
    web_shipping_total = Column(Integer, nullable=False, default=0)
    web_sub_total = Column(Integer, nullable=False, default=0)
    web_redeemed_points = Column(Integer, nullable=False, default=0)
    web_new_customer_orders_count = Column(Integer, nullable=False, default=0)
    web_new_customer_total = Column(Integer, nullable=False, default=0)
    web_new_customer_aov = Column(Integer, nullable=False, default=0)
    web_new_customer_discount_total = Column(Integer, nullable=False, default=0)
    web_new_customer_shipping_total = Column(Integer, nullable=False, default=0)
    web_new_customer_sub_total = Column(Integer, nullable=False, default=0)
    web_new_customer_redeemed_points = Column(Integer, nullable=False, default=0)
    web_returning_customer_orders_count = Column(Integer, nullable=False, default=0)
    web_returning_customer_total = Column(Integer, nullable=False, default=0)
    web_returning_customer_aov = Column(Integer, nullable=False, default=0)
    web_returning_customer_discount_total = Column(Integer, nullable=False, default=0)
    web_returning_customer_shipping_total = Column(Integer, nullable=False, default=0)
    web_returning_customer_sub_total = Column(Integer, nullable=False, default=0)
    web_returning_customer_redeemed_points = Column(Integer, nullable=False, default=0)
    web_orders_with_discount_count = Column(Integer, nullable=False, default=0)
    web_orders_without_discount_count = Column(Integer, nullable=False, default=0)
    web_new_customer_orders_with_discount_count = Column(Integer, nullable=False, default=0)
    web_new_customer_orders_without_discount_count = Column(Integer, nullable=False, default=0)
    web_returning_customer_orders_with_discount_count = Column(Integer, nullable=False, default=0)
    web_returning_customer_orders_without_discount_count = Column(Integer, nullable=False, default=0)
    web_orders_with_redeemed_points_count = Column(Integer, nullable=False, default=0)
    web_orders_without_redeemed_points_count = Column(Integer, nullable=False, default=0)
    web_new_customer_orders_with_redeemed_points_count = Column(Integer, nullable=False, default=0)
    web_new_customer_orders_without_redeemed_points_count = Column(Integer, nullable=False, default=0)
    web_returning_customer_orders_with_redeemed_points_count = Column(Integer, nullable=False, default=0)
    web_returning_customer_orders_without_redeemed_points_count = Column(Integer, nullable=False, default=0)

    # App platform metrics
    app_orders_count = Column(Integer, nullable=False, default=0)
    app_total = Column(Integer, nullable=False, default=0)
    app_aov = Column(Integer, nullable=False, default=0)
    app_discount_total = Column(Integer, nullable=False, default=0)
    app_shipping_total = Column(Integer, nullable=False, default=0)
    app_sub_total = Column(Integer, nullable=False, default=0)
    app_redeemed_points = Column(Integer, nullable=False, default=0)
    app_new_customer_orders_count = Column(Integer, nullable=False, default=0)
    app_new_customer_total = Column(Integer, nullable=False, default=0)
    app_new_customer_aov = Column(Integer, nullable=False, default=0)
    app_new_customer_discount_total = Column(Integer, nullable=False, default=0)
    app_new_customer_shipping_total = Column(Integer, nullable=False, default=0)
    app_new_customer_sub_total = Column(Integer, nullable=False, default=0)
    app_new_customer_redeemed_points = Column(Integer, nullable=False, default=0)
    app_returning_customer_orders_count = Column(Integer, nullable=False, default=0)
    app_returning_customer_total = Column(Integer, nullable=False, default=0)
    app_returning_customer_aov = Column(Integer, nullable=False, default=0)
    app_returning_customer_discount_total = Column(Integer, nullable=False, default=0)
    app_returning_customer_shipping_total = Column(Integer, nullable=False, default=0)
    app_returning_customer_sub_total = Column(Integer, nullable=False, default=0)
    app_returning_customer_redeemed_points = Column(Integer, nullable=False, default=0)
    app_orders_with_discount_count = Column(Integer, nullable=False, default=0)
    app_orders_without_discount_count = Column(Integer, nullable=False, default=0)
    app_new_customer_orders_with_discount_count = Column(Integer, nullable=False, default=0)
    app_new_customer_orders_without_discount_count = Column(Integer, nullable=False, default=0)
    app_returning_customer_orders_with_discount_count = Column(Integer, nullable=False, default=0)
    app_returning_customer_orders_without_discount_count = Column(Integer, nullable=False, default=0)
    app_orders_with_redeemed_points_count = Column(Integer, nullable=False, default=0)
    app_orders_without_redeemed_points_count = Column(Integer, nullable=False, default=0)
    app_new_customer_orders_with_redeemed_points_count = Column(Integer, nullable=False, default=0)
    app_new_customer_orders_without_redeemed_points_count = Column(Integer, nullable=False, default=0)
    app_returning_customer_orders_with_redeemed_points_count = Column(Integer, nullable=False, default=0)
    app_returning_customer_orders_without_redeemed_points_count = Column(Integer, nullable=False, default=0)

    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


# ---------- UTM Daily Tables ----------
class UtmSourceDaily(Base):
    __tablename__ = "utm_source_daily"
    __table_args__ = (UniqueConstraint("date", "key", name="utm_source_daily_date_key_key"),)

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(DateTime, nullable=False)
    key = Column(String, nullable=False)
    views = Column(Integer, nullable=False)
    percentage = Column(Integer, nullable=False)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


class UtmMediumDaily(Base):
    __tablename__ = "utm_medium_daily"
    __table_args__ = (UniqueConstraint("date", "key", name="utm_medium_daily_date_key_key"),)

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(DateTime, nullable=False)
    key = Column(String, nullable=False)
    views = Column(Integer, nullable=False)
    percentage = Column(Integer, nullable=False)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


class UtmCampaignDaily(Base):
    __tablename__ = "utm_campaign_daily"
    __table_args__ = (UniqueConstraint("date", "key", name="utm_campaign_daily_date_key_key"),)

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(DateTime, nullable=False)
    key = Column(String, nullable=False)
    views = Column(Integer, nullable=False)
    percentage = Column(Integer, nullable=False)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


class UtmTermDaily(Base):
    __tablename__ = "utm_term_daily"
    __table_args__ = (UniqueConstraint("date", "key", name="utm_term_daily_date_key_key"),)

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(DateTime, nullable=False)
    key = Column(String, nullable=False)
    views = Column(Integer, nullable=False)
    percentage = Column(Integer, nullable=False)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


class UtmContentDaily(Base):
    __tablename__ = "utm_content_daily"
    __table_args__ = (UniqueConstraint("date", "key", name="utm_content_daily_date_key_key"),)

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(DateTime, nullable=False)
    key = Column(String, nullable=False)
    views = Column(Integer, nullable=False)
    percentage = Column(Integer, nullable=False)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


# ---------- UTM Monthly Tables ----------
class UtmSourceMonthly(Base):
    __tablename__ = "utm_source_monthly"
    __table_args__ = (UniqueConstraint("year", "month", "key", name="utm_source_monthly_year_month_key_key"),)

    id = Column(String, primary_key=True, default=gen_uuid)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    key = Column(String, nullable=False)
    views = Column(Integer, nullable=False)
    percentage = Column(Integer, nullable=False)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


class UtmMediumMonthly(Base):
    __tablename__ = "utm_medium_monthly"
    __table_args__ = (UniqueConstraint("year", "month", "key", name="utm_medium_monthly_year_month_key_key"),)

    id = Column(String, primary_key=True, default=gen_uuid)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    key = Column(String, nullable=False)
    views = Column(Integer, nullable=False)
    percentage = Column(Integer, nullable=False)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


class UtmCampaignMonthly(Base):
    __tablename__ = "utm_campaign_monthly"
    __table_args__ = (UniqueConstraint("year", "month", "key", name="utm_campaign_monthly_year_month_key_key"),)

    id = Column(String, primary_key=True, default=gen_uuid)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    key = Column(String, nullable=False)
    views = Column(Integer, nullable=False)
    percentage = Column(Integer, nullable=False)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


class UtmTermMonthly(Base):
    __tablename__ = "utm_term_monthly"
    __table_args__ = (UniqueConstraint("year", "month", "key", name="utm_term_monthly_year_month_key_key"),)

    id = Column(String, primary_key=True, default=gen_uuid)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    key = Column(String, nullable=False)
    views = Column(Integer, nullable=False)
    percentage = Column(Integer, nullable=False)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


class UtmContentMonthly(Base):
    __tablename__ = "utm_content_monthly"
    __table_args__ = (UniqueConstraint("year", "month", "key", name="utm_content_monthly_year_month_key_key"),)

    id = Column(String, primary_key=True, default=gen_uuid)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    key = Column(String, nullable=False)
    views = Column(Integer, nullable=False)
    percentage = Column(Integer, nullable=False)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


# ---------- Coupon Tables ----------
class DailyCouponUsage(Base):
    __tablename__ = "daily_coupon_usage"
    __table_args__ = (
        UniqueConstraint("date", "coupon_code", name="daily_coupon_usage_date_coupon_code_key"),
        Index("daily_coupon_usage_date_idx", "date"),
        Index("daily_coupon_usage_coupon_code_idx", "coupon_code"),
        Index("daily_coupon_usage_coupon_name_idx", "coupon_name"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(DateTime, nullable=False)
    coupon_code = Column(String, nullable=False)
    coupon_name = Column(String, nullable=False)
    discount_type = Column(String, nullable=False)
    discount_value = Column(Float, nullable=False, default=0)
    usage_count = Column(Integer, nullable=False, default=0)
    unique_customers = Column(Integer, nullable=False, default=0)
    orders_with_this_coupon = Column(Integer, nullable=False, default=0)
    total_discount = Column(Integer, nullable=False, default=0)
    total_revenue = Column(Integer, nullable=False, default=0)
    avg_order_value = Column(Float, nullable=False, default=0)
    new_customer_usage_count = Column(Integer, nullable=False, default=0)
    returning_customer_usage_count = Column(Integer, nullable=False, default=0)
    first_time_customer_count = Column(Integer, nullable=False, default=0)
    stacked_coupon_orders = Column(Integer, nullable=False, default=0)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


class MonthlyCouponUsage(Base):
    __tablename__ = "monthly_coupon_usage"
    __table_args__ = (
        UniqueConstraint("year", "month", "coupon_code", name="monthly_coupon_usage_year_month_coupon_code_key"),
        Index("monthly_coupon_usage_year_month_idx", "year", "month"),
        Index("monthly_coupon_usage_coupon_code_idx", "coupon_code"),
        Index("monthly_coupon_usage_coupon_name_idx", "coupon_name"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    coupon_code = Column(String, nullable=False)
    coupon_name = Column(String, nullable=False)
    discount_type = Column(String, nullable=False)
    discount_value = Column(Float, nullable=False, default=0)
    usage_count = Column(Integer, nullable=False, default=0)
    unique_customers = Column(Integer, nullable=False, default=0)
    orders_with_this_coupon = Column(Integer, nullable=False, default=0)
    total_discount = Column(Integer, nullable=False, default=0)
    total_revenue = Column(Integer, nullable=False, default=0)
    avg_order_value = Column(Float, nullable=False, default=0)
    new_customer_usage_count = Column(Integer, nullable=False, default=0)
    returning_customer_usage_count = Column(Integer, nullable=False, default=0)
    first_time_customer_count = Column(Integer, nullable=False, default=0)
    stacked_coupon_orders = Column(Integer, nullable=False, default=0)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


class CouponMetadata(Base):
    __tablename__ = "coupon_metadata"

    id = Column(String, primary_key=True, default=gen_uuid)
    code = Column(String, nullable=False, unique=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    value = Column(Float, nullable=False)
    min_order_amount = Column(Integer, nullable=True)
    max_discount = Column(Integer, nullable=True)
    date_start = Column(DateTime, nullable=True)
    date_end = Column(DateTime, nullable=True)
    status = Column(String, nullable=False)
    platform = Column(String, nullable=False)
    total_usage_count = Column(Integer, nullable=False, default=0)
    total_revenue = Column(Integer, nullable=False, default=0)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)
    updatedAt = Column("updatedAt", DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class AnalyticsJobLog(Base):
    __tablename__ = "analytics_job_logs"
    __table_args__ = (
        Index("analytics_job_logs_action_status_idx", "action", "status"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    action = Column(String, nullable=False)
    job_key = Column(String, nullable=False, unique=True)
    status = Column(String, nullable=False)
    result_count = Column(Integer, nullable=False, default=0)
    job_metadata = Column("metadata", JSON, nullable=True)
    error = Column(String, nullable=True)
    duration = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------- Cart Analytics Tables ----------
class DailyCartMetrics(Base):
    __tablename__ = "daily_cart_metrics"
    __table_args__ = (
        UniqueConstraint("date", name="daily_cart_metrics_date_key"),
        Index("daily_cart_metrics_date_idx", "date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(DateTime, nullable=False)
    total_carts = Column(Integer, nullable=False, default=0)
    completed_carts = Column(Integer, nullable=False, default=0)
    abandoned_carts = Column(Integer, nullable=False, default=0)
    total_cart_value = Column(Integer, nullable=False, default=0)
    completed_cart_value = Column(Integer, nullable=False, default=0)
    abandoned_cart_value = Column(Integer, nullable=False, default=0)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


class MonthlyCartMetrics(Base):
    __tablename__ = "monthly_cart_metrics"
    __table_args__ = (
        UniqueConstraint("year", "month", name="monthly_cart_metrics_year_month_key"),
        Index("monthly_cart_metrics_year_month_idx", "year", "month"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    total_carts = Column(Integer, nullable=False, default=0)
    completed_carts = Column(Integer, nullable=False, default=0)
    abandoned_carts = Column(Integer, nullable=False, default=0)
    total_cart_value = Column(Integer, nullable=False, default=0)
    completed_cart_value = Column(Integer, nullable=False, default=0)
    abandoned_cart_value = Column(Integer, nullable=False, default=0)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


# ---------- Product Analytics Tables ----------
class DailyProductMetrics(Base):
    __tablename__ = "daily_product_metrics"
    __table_args__ = (
        UniqueConstraint("date", "product_title", "metric_type",
                         name="daily_product_metrics_date_title_type_key"),
        Index("daily_product_metrics_date_idx", "date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(DateTime, nullable=False)
    product_title = Column(String, nullable=False)
    metric_type = Column(String, nullable=False)   # 'order', 'revenue', 'cart', 'search'
    value = Column(Float, nullable=False, default=0)
    product_category = Column(String, nullable=True)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


class MonthlyProductMetrics(Base):
    __tablename__ = "monthly_product_metrics"
    __table_args__ = (
        UniqueConstraint("year", "month", "product_title", "metric_type",
                         name="monthly_product_metrics_year_month_title_type_key"),
        Index("monthly_product_metrics_year_month_idx", "year", "month"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    product_title = Column(String, nullable=False)
    metric_type = Column(String, nullable=False)   # 'order', 'revenue', 'cart', 'search'
    value = Column(Float, nullable=False, default=0)
    product_category = Column(String, nullable=True)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


# ---------- Search Analytics Tables ----------
class DailySearchMetrics(Base):
    __tablename__ = "daily_search_metrics"
    __table_args__ = (
        UniqueConstraint("date", name="daily_search_metrics_date_key"),
        Index("daily_search_metrics_date_idx", "date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(DateTime, nullable=False)
    total_searches = Column(Integer, nullable=False, default=0)
    unique_searchers = Column(Integer, nullable=False, default=0)
    with_results = Column(Integer, nullable=False, default=0)
    zero_results = Column(Integer, nullable=False, default=0)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


class MonthlySearchMetrics(Base):
    __tablename__ = "monthly_search_metrics"
    __table_args__ = (
        UniqueConstraint("year", "month", name="monthly_search_metrics_year_month_key"),
        Index("monthly_search_metrics_year_month_idx", "year", "month"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    total_searches = Column(Integer, nullable=False, default=0)
    unique_searchers = Column(Integer, nullable=False, default=0)
    with_results = Column(Integer, nullable=False, default=0)
    zero_results = Column(Integer, nullable=False, default=0)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


# ---------- Visitor Analytics Tables ----------
class DailyVisitorMetrics(Base):
    __tablename__ = "daily_visitor_metrics"
    __table_args__ = (
        UniqueConstraint("date", name="daily_visitor_metrics_date_key"),
        Index("daily_visitor_metrics_date_idx", "date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(DateTime, nullable=False)
    unique_visitors = Column(Integer, nullable=False, default=0)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


class MonthlyVisitorMetrics(Base):
    __tablename__ = "monthly_visitor_metrics"
    __table_args__ = (
        UniqueConstraint("year", "month", name="monthly_visitor_metrics_year_month_key"),
        Index("monthly_visitor_metrics_year_month_idx", "year", "month"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    unique_visitors = Column(Integer, nullable=False, default=0)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


class DailyEngagementMetrics(Base):
    """Cached daily engagement stats from Umami (pageviews, sessions, bounces,
    session time) — so the Engagement page reads from the DB like every other
    metric instead of hitting the slow Umami API live on each request."""
    __tablename__ = "daily_engagement_metrics"
    __table_args__ = (
        UniqueConstraint("date", name="daily_engagement_metrics_date_key"),
        Index("daily_engagement_metrics_date_idx", "date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(DateTime, nullable=False)
    pageviews = Column(Integer, nullable=False, default=0)
    sessions = Column(Integer, nullable=False, default=0)
    visitors = Column(Integer, nullable=False, default=0)
    bounces = Column(Integer, nullable=False, default=0)
    total_time_seconds = Column(Float, nullable=False, default=0.0)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


# ---------- Fulfillment Metrics Tables ----------
class DailyFulfillmentMetrics(Base):
    __tablename__ = "daily_fulfillment_metrics"
    __table_args__ = (
        UniqueConstraint("date", name="daily_fulfillment_metrics_date_key"),
        Index("daily_fulfillment_metrics_date_idx", "date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(Date, nullable=False)
    total_delivered_orders = Column(Integer, nullable=False, default=0)
    total_delivery_days_sum = Column(Float, nullable=False, default=0.0)
    orders_within_sla_count = Column(Integer, nullable=False, default=0)
    rto_orders_count = Column(Integer, nullable=False, default=0)
    createdAt = Column("createdAt", DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))


# ---------- Inventory Metrics Tables ----------
class InventorySummary(Base):
    __tablename__ = "inventory_summary"

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(DateTime, nullable=False, unique=True)
    total_tracked_variants = Column(Integer, nullable=False, default=0)
    total_stock_outs = Column(Integer, nullable=False, default=0)
    dead_stock_variants = Column(Integer, nullable=False, default=0)
    dead_stock_value = Column(Float, nullable=False, default=0.0)
    total_locked_capital = Column(Float, nullable=False, default=0.0)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


class InventoryDeadStock(Base):
    __tablename__ = "inventory_dead_stock"

    id = Column(String, primary_key=True, default=gen_uuid)
    product_title = Column(String, nullable=False)
    sku = Column(String, nullable=True)
    inventory_quantity = Column(Integer, nullable=False, default=0)
    price = Column(Float, nullable=False, default=0.0)
    total_value = Column(Float, nullable=False, default=0.0)
    variant_created_at = Column("variant_created_at", DateTime, nullable=True)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


class InventoryStockOuts(Base):
    __tablename__ = "inventory_stock_outs"

    id = Column(String, primary_key=True, default=gen_uuid)
    product_title = Column(String, nullable=False)
    sku = Column(String, nullable=True)
    inventory_quantity = Column(Integer, nullable=False, default=0)
    variant_updated_at = Column("variant_updated_at", DateTime, nullable=True)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


class InventoryAgingStock(Base):
    __tablename__ = "inventory_aging_stock"

    id = Column(String, primary_key=True, default=gen_uuid)
    product_title = Column(String, nullable=False)
    sku = Column(String, nullable=True)
    inventory_quantity = Column(Integer, nullable=False, default=0)
    total_value = Column(Float, nullable=False, default=0.0)
    variant_created_at = Column("variant_created_at", DateTime, nullable=True)
    createdAt = Column("createdAt", DateTime, nullable=False, default=datetime.utcnow)


# ---------- Customer RFM Segmentation ----------
class CustomerRfmSegment(Base):
    __tablename__ = "customer_rfm_segments"
    __table_args__ = (
        UniqueConstraint("email", name="customer_rfm_segments_email_key"),
        Index("customer_rfm_segments_segment_idx", "segment"),
        Index("customer_rfm_segments_monetary_idx", "monetary"),
        Index("customer_rfm_segments_frequency_idx", "frequency"),
        Index("customer_rfm_segments_last_order_date_idx", "last_order_date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    email = Column(String, nullable=False)
    recency_days = Column(Integer, nullable=False, default=0)
    frequency = Column(Integer, nullable=False, default=0)
    monetary = Column(Float, nullable=False, default=0.0)
    r_score = Column(Integer, nullable=False, default=1)
    f_score = Column(Integer, nullable=False, default=1)
    m_score = Column(Integer, nullable=False, default=1)
    segment = Column(String, nullable=False, default="Lost Customers")
    last_order_date = Column(DateTime, nullable=True)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))


# ---------- Customer LTV by Segment ----------
class CustomerLtvBySegment(Base):
    __tablename__ = "customer_ltv_by_segment"
    __table_args__ = (
        UniqueConstraint("segment", name="customer_ltv_by_segment_segment_key"),
        Index("customer_ltv_by_segment_segment_idx", "segment"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    segment = Column(String, nullable=False)
    total_customers = Column(Integer, nullable=False, default=0)
    total_revenue = Column(Float, nullable=False, default=0.0)
    avg_ltv = Column(Float, nullable=False, default=0.0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))


# ---------- Repeat Purchase Rate ----------
class RepeatPurchaseRate(Base):
    __tablename__ = "repeat_purchase_rate"

    id = Column(String, primary_key=True, default=gen_uuid)
    total_customers = Column(Integer, nullable=False, default=0)
    repeat_customers = Column(Integer, nullable=False, default=0)
    rpr_percentage = Column(Float, nullable=False, default=0.0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))


# ---------- Product Reviews (Local Mirror) ----------
class ProductReviewLocal(Base):
    __tablename__ = "product_reviews_local"

    id = Column(String, primary_key=True)          # matches prod review ID
    product_id = Column(String, nullable=True)
    product_title = Column(String, nullable=True)
    rating = Column(Integer, nullable=False)
    title = Column(String, nullable=True)
    comment = Column(Text, nullable=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    spam = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=True)
    synced_at = Column(DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))


# ---------- Product Pair Correlations (What Sells Together) ----------
class ProductPairCorrelation(Base):
    __tablename__ = "product_pair_correlations"

    id = Column(String, primary_key=True, default=gen_uuid)
    product_a_title = Column(String, nullable=False)
    product_b_title = Column(String, nullable=False)
    co_occurrences = Column(Integer, nullable=False, default=0)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))


class CorrelationSummary(Base):
    __tablename__ = "correlation_summary"

    id = Column(String, primary_key=True, default=gen_uuid)
    total_active_orders = Column(Integer, nullable=False, default=0)
    multi_item_orders = Column(Integer, nullable=False, default=0)
    bundling_percentage = Column(Float, nullable=False, default=0.0)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))


# ---------- Search Top Keywords ----------
class SearchTopKeyword(Base):
    __tablename__ = "search_top_keywords"

    id = Column(String, primary_key=True, default=gen_uuid)
    keyword = Column(String, nullable=False)
    count = Column(Integer, nullable=False, default=0)
    date = Column(Date, nullable=False)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))


# ---------- Cart Abandoned Products ----------
class CartAbandonedProduct(Base):
    __tablename__ = "cart_abandoned_products"

    id = Column(String, primary_key=True, default=gen_uuid)
    product_title = Column(String, nullable=False)
    count = Column(Integer, nullable=False, default=0)
    date = Column(Date, nullable=False)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))


# ---------- Customer Funnel Metrics (Open/Click/Conversion Rates) ----------
class CustomerFunnelMetrics(Base):
    __tablename__ = "customer_funnel_metrics"
    __table_args__ = (
        UniqueConstraint("date", name="customer_funnel_metrics_date_key"),
        Index("customer_funnel_metrics_date_idx", "date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(Date, nullable=False)
    total_users = Column(Integer, nullable=False, default=0)
    open_users = Column(Integer, nullable=False, default=0)
    click_users = Column(Integer, nullable=False, default=0)
    payment_failure_users = Column(Integer, nullable=False, default=0)
    converted_users = Column(Integer, nullable=False, default=0)
    open_rate = Column(Float, nullable=False, default=0.0)
    click_rate = Column(Float, nullable=False, default=0.0)
    conversion_rate = Column(Float, nullable=False, default=0.0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


# ---------- Customer Repeat Purchase Cohorts ----------
class CustomerRepeatCohort(Base):
    __tablename__ = "customer_repeat_cohorts"
    __table_args__ = (
        UniqueConstraint("cohort_month", "cohort_index",
                         name="customer_repeat_cohorts_month_index_key"),
        Index("customer_repeat_cohorts_month_idx", "cohort_month"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    cohort_month = Column(String, nullable=False)          # "YYYY-MM"
    cohort_index = Column(Integer, nullable=False)          # 0, 1, 2, ...
    cohort_size = Column(Integer, nullable=False, default=0)
    repeat_customers = Column(Integer, nullable=False, default=0)
    retention_rate = Column(Float, nullable=False, default=0.0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))

# ---------- Customer Lifetime Value Cohorts ----------
class CustomerLifetimeCohort(Base):
    __tablename__ = "customer_lifetime_cohorts"
    __table_args__ = (
        UniqueConstraint("cohort_month", "cohort_index",
                         name="customer_lifetime_cohorts_month_index_key"),
        Index("customer_lifetime_cohorts_month_idx", "cohort_month"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    cohort_month = Column(String, nullable=False)            # "YYYY-MM"
    cohort_index = Column(Integer, nullable=False)            # 0, 1, 2, ...
    cohort_size = Column(Integer, nullable=False, default=0)
    total_revenue = Column(Float, nullable=False, default=0.0)
    cumulative_revenue = Column(Float, nullable=False, default=0.0)
    avg_ltv = Column(Float, nullable=False, default=0.0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


# ---------- UTM Attribution Metrics ----------
class UtmAttributionMetrics(Base):
    __tablename__ = "utm_attribution_metrics"
    __table_args__ = (
        UniqueConstraint("date", "utm_source", "utm_medium", "utm_campaign",
                         "utm_term", "utm_content",
                         name="utm_attribution_metrics_date_combo_key"),
        Index("utm_attribution_date_idx", "date"),
        Index("utm_attribution_source_idx", "utm_source"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(Date, nullable=False)
    utm_source = Column(String, nullable=False, default="direct")
    utm_medium = Column(String, nullable=False, default="none")
    utm_campaign = Column(String, nullable=False, default="none")
    utm_term = Column(String, nullable=False, default="none")
    utm_content = Column(String, nullable=False, default="none")
    users = Column(Integer, nullable=False, default=0)
    sessions = Column(Integer, nullable=False, default=0)
    orders = Column(Integer, nullable=False, default=0)
    revenue = Column(Float, nullable=False, default=0.0)
    conversion_rate = Column(Float, nullable=False, default=0.0)
    aov = Column(Float, nullable=False, default=0.0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


# ---------- Flow Revenue Attribution ----------
class FlowRevenueAttribution(Base):
    __tablename__ = "flow_revenue_attribution"
    __table_args__ = (
        UniqueConstraint("date", "flow_path",
                         name="flow_revenue_attribution_date_path_key"),
        Index("flow_attribution_date_idx", "date"),
        Index("flow_attribution_path_idx", "flow_path"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(Date, nullable=False)
    flow_path = Column(String, nullable=False)
    steps_count = Column(Integer, nullable=False, default=1)
    users = Column(Integer, nullable=False, default=0)
    orders = Column(Integer, nullable=False, default=0)
    revenue = Column(Float, nullable=False, default=0.0)
    conversion_rate = Column(Float, nullable=False, default=0.0)
    aov = Column(Float, nullable=False, default=0.0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


# ---------- RTO (Return to Origin) Metrics ----------
class RtoMetrics(Base):
    __tablename__ = "rto_metrics"
    __table_args__ = (
        UniqueConstraint("date", name="rto_metrics_date_key"),
        Index("rto_metrics_date_idx", "date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(Date, nullable=False)
    total_orders = Column(Integer, nullable=False, default=0)
    rto_orders = Column(Integer, nullable=False, default=0)
    rto_rate = Column(Float, nullable=False, default=0.0)
    rto_revenue_loss = Column(Float, nullable=False, default=0.0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


# ---------- Delivery Time Metrics ----------
class DeliveryTimeMetrics(Base):
    __tablename__ = "delivery_time_metrics"
    __table_args__ = (
        UniqueConstraint("date", name="delivery_time_metrics_date_key"),
        Index("delivery_time_metrics_date_idx", "date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(Date, nullable=False)
    total_orders = Column(Integer, nullable=False, default=0)
    avg_delivery_time = Column(Float, nullable=False, default=0.0)
    median_delivery_time = Column(Float, nullable=False, default=0.0)
    p90_delivery_time = Column(Float, nullable=False, default=0.0)
    delayed_orders = Column(Integer, nullable=False, default=0)
    delays_by_carrier = Column(PortableJSONB, nullable=False, server_default='{}')
    delays_by_state = Column(PortableJSONB, nullable=False, server_default='{}')
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


class CeoDashboardSnapshot(Base):
    """Daily snapshot of CEO dashboard metrics computed from prod DB.

    Stores the 5 metrics that require prod DB queries:
    1. Avg delivery time (days)
    2. SLA percentage (orders delivered within threshold)
    3. Hero SKU sell-through rate (%)
    4. Inventory coverage days (stock / daily velocity)
    5. Email revenue share (% of revenue from email-attributed orders)
    """
    __tablename__ = "ceo_dashboard_snapshots"
    __table_args__ = (
        UniqueConstraint("snapshot_date",
                         name="ceo_dashboard_snapshot_date_key"),
        Index("ceo_dashboard_snapshot_date_idx", "snapshot_date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    snapshot_date = Column(Date, nullable=False)

    # Fulfillment metrics
    avg_delivery_days = Column(Float, nullable=False, default=0.0)
    sla_pct = Column(Float, nullable=False, default=0.0)
    orders_delivered = Column(Integer, nullable=False, default=0)
    orders_within_sla = Column(Integer, nullable=False, default=0)

    # Hero SKU sell-through
    hero_sku_sellthrough = Column(Float, nullable=False, default=0.0)

    # Inventory coverage
    inventory_coverage_days = Column(Float, nullable=False, default=0.0)

    # Email revenue share
    email_revenue_share = Column(Float, nullable=False, default=0.0)
    email_attributed_revenue = Column(Float, nullable=False, default=0.0)
    total_revenue = Column(Float, nullable=False, default=0.0)

    # RTO (Return to Origin) rate
    rto_rate = Column(Float, nullable=False, default=0.0)
    rto_orders = Column(Integer, nullable=False, default=0)

    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


# ---------- CEO Dashboard Targets ----------
class CeoDashboardTargets(Base):
    """Dynamic configuration table for CEO Dashboard KPI targets."""
    __tablename__ = "ceo_dashboard_targets"
    __table_args__ = (
        UniqueConstraint("metric_key", name="ceo_dashboard_targets_metric_key"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    metric_key = Column(String, nullable=False, unique=True)
    target_value = Column(Float, nullable=False)
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
                       onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


# ---------- failure_zones_metrics ----------
class FailureZonesMetrics(Base):
    """Daily failure zone metrics aggregated by city/state from prod orders.

    Tracks geographical areas where order failures (RETURNED/FAILED)
    and RTO incidents are highest — root-cause analysis module.
    """
    __tablename__ = "failure_zones_metrics"
    __table_args__ = (
        UniqueConstraint("date", "city", "state",
                         name="failure_zones_metrics_date_city_state_key"),
        Index("failure_zones_metrics_date_idx", "date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(Date, nullable=False)
    city = Column(Text, nullable=False)
    state = Column(Text, nullable=False)
    total_orders = Column(Integer, nullable=False, default=0)
    failed_orders = Column(Integer, nullable=False, default=0)
    rto_orders = Column(Integer, nullable=False, default=0)
    failure_rate = Column(Float, nullable=False, default=0.0)
    rto_rate = Column(Float, nullable=False, default=0.0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


# ---------- return_rate_metrics ----------
class ReturnRateMetrics(Base):
    """Daily return rate metrics — tracks post-delivery returns.

    Distinct from RTO: this measures orders that were DELIVERED to the
    customer and then returned, not orders that failed before delivery.
    """
    __tablename__ = "return_rate_metrics"
    __table_args__ = (
        UniqueConstraint("date", name="return_rate_metrics_date_key"),
        Index("return_rate_metrics_date_idx", "date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(Date, nullable=False)
    total_delivered_orders = Column(Integer, nullable=False, default=0)
    returned_orders = Column(Integer, nullable=False, default=0)
    return_rate = Column(Float, nullable=False, default=0.0)
    return_revenue_loss = Column(Float, nullable=False, default=0.0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


# ---------- geography_revenue_metrics ----------
class GeographyRevenueMetrics(Base):
    """Daily geography-level revenue metrics aggregated by city/state.

    Tracks revenue distribution across geographical regions from
    paid/completed orders joined with shipping addresses.
    """
    __tablename__ = "geography_revenue_metrics"
    __table_args__ = (
        UniqueConstraint("date", "city", "state",
                         name="geography_revenue_metrics_date_city_state_key"),
        Index("geography_revenue_metrics_date_idx", "date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(Date, nullable=False)
    city = Column(Text, nullable=False)
    state = Column(Text, nullable=False)
    total_orders = Column(Integer, nullable=False, default=0)
    total_revenue = Column(Float, nullable=False, default=0.0)
    avg_order_value = Column(Float, nullable=False, default=0.0)
    unique_customers = Column(Integer, nullable=False, default=0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


# ---------- courier_performance_metrics ----------
class CourierPerformanceMetrics(Base):
    """Daily courier-level performance metrics.

    Tracks delivery speed, RTO rate, and failure rate per courier partner.
    """
    __tablename__ = "courier_performance_metrics"
    __table_args__ = (
        UniqueConstraint("date", "courier_partner",
                         name="courier_performance_metrics_date_courier_key"),
        Index("courier_performance_metrics_date_idx", "date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(Date, nullable=False)
    courier_partner = Column(Text, nullable=False)
    total_orders = Column(Integer, nullable=False, default=0)
    delivered_orders = Column(Integer, nullable=False, default=0)
    rto_orders = Column(Integer, nullable=False, default=0)
    failed_orders = Column(Integer, nullable=False, default=0)
    rto_rate = Column(Float, nullable=False, default=0.0)
    failure_rate = Column(Float, nullable=False, default=0.0)
    avg_delivery_time = Column(Float, nullable=False, default=0.0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


# ---------- return_reason_metrics ----------
class ReturnReasonMetrics(Base):
    """Daily return/refund reason-level metrics.

    Tracks why orders are being returned or refunded, grouped by reason code.
    Each row = one reason on one date.
    """
    __tablename__ = "return_reason_metrics"
    __table_args__ = (
        UniqueConstraint("date", "reason_code",
                         name="return_reason_metrics_date_reason_key"),
        Index("return_reason_metrics_date_idx", "date"),
        Index("return_reason_metrics_reason_code_idx", "reason_code"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(Date, nullable=False)
    reason_code = Column(Text, nullable=False)
    reason_text = Column(Text, nullable=False)
    total_cases = Column(Integer, nullable=False, default=0)
    total_revenue_loss = Column(Float, nullable=False, default=0.0)
    percentage = Column(Float, nullable=False, default=0.0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


# ---------- Channel ROI Metrics ----------
class ChannelRoiMetrics(Base):
    """Daily channel-level ROI metrics.

    Tracks marketing channel profitability by combining revenue data
    (from UTM attribution) with spend data (from channel_spend_config).
    ROI = (Revenue - Spend) / Spend, ROAS = Revenue / Spend.
    """
    __tablename__ = "channel_roi_metrics"
    __table_args__ = (
        UniqueConstraint("date", "channel",
                         name="channel_roi_metrics_date_channel_key"),
        Index("channel_roi_metrics_date_idx", "date"),
        Index("channel_roi_metrics_channel_idx", "channel"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(Date, nullable=False)
    channel = Column(Text, nullable=False)
    total_revenue = Column(Float, nullable=False, default=0.0)
    total_spend = Column(Float, nullable=False, default=0.0)
    roi = Column(Float, nullable=False, default=0.0)
    roas = Column(Float, nullable=False, default=0.0)
    total_orders = Column(Integer, nullable=False, default=0)
    unique_users = Column(Integer, nullable=False, default=0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


# ---------- Channel Spend Config ----------
class ChannelSpendConfig(Base):
    """Admin-managed daily spend per marketing channel.

    Stores how much was spent on each channel per day. This data is
    used by channel_roi_action.py to compute ROI and ROAS metrics.
    Can be populated manually or via ad platform API integrations.
    """
    __tablename__ = "channel_spend_config"
    __table_args__ = (
        UniqueConstraint("date", "channel",
                         name="channel_spend_config_date_channel_key"),
        Index("channel_spend_config_date_idx", "date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(Date, nullable=False)
    channel = Column(Text, nullable=False)
    spend = Column(Float, nullable=False, default=0.0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


# ---------- Campaign CAC (Customer Acquisition Cost) Metrics ----------
class CampaignCacMetrics(Base):
    """Daily campaign-level Customer Acquisition Cost metrics.

    Combines Meta Ads spend data with prod order attribution to compute
    CAC = Total Spend / New Customers per campaign per day.
    """
    __tablename__ = "campaign_cac_metrics"
    __table_args__ = (
        UniqueConstraint("date", "campaign_id",
                         name="campaign_cac_metrics_date_campaign_key"),
        Index("campaign_cac_metrics_date_idx", "date"),
        Index("campaign_cac_metrics_campaign_id_idx", "campaign_id"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(Date, nullable=False)
    campaign_id = Column(Text, nullable=False)
    campaign_name = Column(Text, nullable=False)
    total_spend = Column(Float, nullable=False, default=0.0)
    new_customers = Column(Integer, nullable=False, default=0)
    total_orders = Column(Integer, nullable=False, default=0)
    total_revenue = Column(Float, nullable=False, default=0.0)
    cac = Column(Float, nullable=False, default=0.0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


# ---------- Marketing Cost per Order Metrics ----------
class MarketingCostPerOrder(Base):
    """Daily marketing cost per order metrics.

    Combines Meta Ads total spend with prod order counts to compute
    Cost per Order = Total Spend / Total Orders per day.
    """
    __tablename__ = "marketing_cost_per_order"
    __table_args__ = (
        UniqueConstraint("date", name="marketing_cost_per_order_date_key"),
        Index("marketing_cost_per_order_date_idx", "date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(Date, nullable=False)
    total_spend = Column(Float, nullable=False, default=0.0)
    total_orders = Column(Integer, nullable=False, default=0)
    cost_per_order = Column(Float, nullable=False, default=0.0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


# ---------- Creative Performance Metrics ----------
class CreativePerformanceMetrics(Base):
    """Daily creative (ad-level) performance metrics.

    Hybrid attribution: Orders DB is the source of truth for revenue,
    Meta Ads API provides creative-level mapping, spend, impressions,
    clicks, and Meta-reported revenue for comparison.
    """
    __tablename__ = "creative_performance_metrics"
    __table_args__ = (
        UniqueConstraint("date", "creative_id",
                         name="creative_performance_metrics_date_creative_key"),
        Index("creative_performance_metrics_date_idx", "date"),
        Index("creative_performance_metrics_creative_id_idx", "creative_id"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(Date, nullable=False)
    creative_id = Column(Text, nullable=False)         # utm_content or ad_id
    creative_name = Column(Text, nullable=False)        # ad_name from Meta
    campaign_name = Column(Text, nullable=False)        # campaign_name
    orders = Column(Integer, nullable=False, default=0)
    revenue_actual = Column(Float, nullable=False, default=0.0)  # SOURCE OF TRUTH
    spend = Column(Float, nullable=False, default=0.0)
    clicks = Column(Integer, nullable=False, default=0)
    impressions = Column(Integer, nullable=False, default=0)
    roas = Column(Float, nullable=False, default=0.0)            # revenue_actual / spend
    ctr = Column(Float, nullable=False, default=0.0)             # (clicks/impressions)*100
    cpc = Column(Float, nullable=False, default=0.0)             # spend / clicks
    meta_revenue = Column(Float, nullable=False, default=0.0)    # Meta-reported
    revenue_diff = Column(Float, nullable=False, default=0.0)    # % diff from actual
    flag = Column(Text, nullable=True)                           # "Meta Over-reporting" if diff>20%
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


# ---------- Audience ROAS Metrics ----------
class AudienceRoasMetrics(Base):
    """Daily audience (adset-level) ROAS metrics from Meta Ads API."""
    __tablename__ = "audience_roas_metrics"
    __table_args__ = (
        UniqueConstraint("date", "adset_id",
                         name="audience_roas_metrics_date_adset_key"),
        Index("audience_roas_metrics_date_idx", "date"),
        Index("audience_roas_metrics_adset_id_idx", "adset_id"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(Date, nullable=False)
    adset_id = Column(Text, nullable=False)
    adset_name = Column(Text, nullable=False)
    campaign_name = Column(Text, nullable=False)
    spend = Column(Float, nullable=False, default=0.0)
    impressions = Column(Integer, nullable=False, default=0)
    clicks = Column(Integer, nullable=False, default=0)
    conversions = Column(Integer, nullable=False, default=0)
    revenue = Column(Float, nullable=False, default=0.0)
    roas = Column(Float, nullable=False, default=0.0)
    ctr = Column(Float, nullable=False, default=0.0)
    cpc = Column(Float, nullable=False, default=0.0)
    conversion_rate = Column(Float, nullable=False, default=0.0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


# ---------- Influencer Attribution Metrics ----------
class InfluencerAttributionMetrics(Base):
    """Daily influencer performance metrics from UTM-based order attribution."""
    __tablename__ = "influencer_attribution_metrics"
    __table_args__ = (
        UniqueConstraint("date", "influencer_name",
                         name="influencer_attribution_date_name_key"),
        Index("influencer_attribution_date_idx", "date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(Date, nullable=False)
    influencer_name = Column(Text, nullable=False)
    total_orders = Column(Integer, nullable=False, default=0)
    total_revenue = Column(Float, nullable=False, default=0.0)
    unique_customers = Column(Integer, nullable=False, default=0)
    avg_order_value = Column(Float, nullable=False, default=0.0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


# ---------- Payment Failure Metrics ----------
class PaymentFailureMetrics(Base):
    """Daily payment failure metrics — orders where checkout was initiated but payment not captured."""
    __tablename__ = "payment_failure_metrics"
    __table_args__ = (
        UniqueConstraint("date", name="payment_failure_metrics_date_key"),
        Index("payment_failure_metrics_date_idx", "date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(Date, nullable=False)
    total_attempts = Column(Integer, nullable=False, default=0)    # all orders created that day
    failed_payments = Column(Integer, nullable=False, default=0)   # paid_at IS NULL, not cancelled/delivered
    failure_rate = Column(Float, nullable=False, default=0.0)      # (failed / total) * 100
    lost_gmv = Column(Float, nullable=False, default=0.0)          # SUM(total) for failed orders
    affected_customers = Column(Integer, nullable=False, default=0) # distinct customers who failed
    recovered_orders = Column(Integer, nullable=False, default=0)    # failed orders later paid successfully
    recovered_gmv = Column(Float, nullable=False, default=0.0)       # GMV recovered from retried payments
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


class PaymentFailureByMethod(Base):
    """Daily payment failure breakdown by payment provider + mode.
    Sourced from prod `payment` table (provider_id, data->>'paymentMode' | 'cardName').
    """
    __tablename__ = "payment_failure_by_method"
    __table_args__ = (
        UniqueConstraint("date", "provider", "payment_mode",
                         name="payment_failure_by_method_unique"),
        Index("payment_failure_by_method_date_idx", "date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(Date, nullable=False)
    provider = Column(String, nullable=False)         # phonepe, ccavenue, ...
    payment_mode = Column(String, nullable=False)     # UPI_QR, PHONEPE, NET_BANKING, Credit Card, ...
    attempts = Column(Integer, nullable=False, default=0)
    failed = Column(Integer, nullable=False, default=0)
    lost_gmv = Column(Float, nullable=False, default=0.0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


class PaymentFailureByReason(Base):
    """Daily payment failure breakdown by error/cancel reason code.
    Sourced from prod `payment.metadata->>'errorCode'` (fallback UNKNOWN).
    """
    __tablename__ = "payment_failure_by_reason"
    __table_args__ = (
        UniqueConstraint("date", "error_code",
                         name="payment_failure_by_reason_unique"),
        Index("payment_failure_by_reason_date_idx", "date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    date = Column(Date, nullable=False)
    error_code = Column(String, nullable=False)       # TXN_NOT_COMPLETED, TXN_CANCELLED, UNKNOWN, ...
    failed = Column(Integer, nullable=False, default=0)
    lost_gmv = Column(Float, nullable=False, default=0.0)
    affected_customers = Column(Integer, nullable=False, default=0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


# ---------- Search Analytics Snapshot (Pre-computed search sections) ----------
class SearchAnalyticsSnapshot(Base):
    __tablename__ = "search_analytics_snapshot"
    __table_args__ = (
        UniqueConstraint("snapshot_date", name="search_analytics_snapshot_date_key"),
        Index("search_analytics_snapshot_date_idx", "snapshot_date"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    snapshot_date = Column(Date, nullable=False)
    top_keywords_data = Column(PortableJSONB, nullable=False, default=[])
    zero_result_data = Column(PortableJSONB, nullable=False, default=[])
    low_result_data = Column(PortableJSONB, nullable=False, default=[])
    high_exit_data = Column(PortableJSONB, nullable=False, default=[])
    brand_volume_data = Column(PortableJSONB, nullable=False, default=[])
    category_demand_data = Column(PortableJSONB, nullable=False, default=[])
    attributes_frequency_data = Column(PortableJSONB, nullable=False, default=[])
    new_vs_returning_data = Column(PortableJSONB, nullable=False, default=[])
    high_intent_demand_data = Column(PortableJSONB, nullable=False, server_default=text("'[]'"))
    not_purchased_data = Column(PortableJSONB, nullable=False, server_default=text("'[]'"))
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))


# ---------- Customer Lifetime Value (per-customer snapshot) ----------
class CustomerClvSnapshot(Base):
    """Per-customer CLV snapshot synced from prod orders."""
    __tablename__ = "customer_clv_snapshot"
    __table_args__ = (
        UniqueConstraint("customer_id", name="customer_clv_snapshot_customer_key"),
        Index("customer_clv_snapshot_customer_idx", "customer_id"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    customer_id = Column(String, nullable=False)
    customer_name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    order_count = Column(Integer, nullable=False, default=0)
    total_spend = Column(Float, nullable=False, default=0.0)       # in rupees
    avg_order_value = Column(Float, nullable=False, default=0.0)
    first_purchase_date = Column(Date, nullable=True)
    last_purchase_date = Column(Date, nullable=True)
    prev_month_orders = Column(Integer, nullable=False, default=0)
    curr_month_orders = Column(Integer, nullable=False, default=0)
    mom_growth_pct = Column(Float, nullable=True)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    updatedAt = Column("updatedAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc),
                       onupdate=lambda: datetime.now(timezone.utc))


# ---------- Signup Cohorts (cohort by registration month) ----------
class SignupCohortMetrics(Base):
    """Signup cohort retention: customers grouped by registration month."""
    __tablename__ = "signup_cohort_metrics"
    __table_args__ = (
        UniqueConstraint("signup_cohort", "cohort_index",
                         name="signup_cohort_metrics_cohort_index_key"),
        Index("signup_cohort_metrics_cohort_idx", "signup_cohort"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    signup_cohort = Column(String, nullable=False)   # YYYY-MM
    cohort_size = Column(Integer, nullable=False, default=0)
    cohort_index = Column(Integer, nullable=False, default=0)   # months after signup
    active_customers = Column(Integer, nullable=False, default=0)
    retention_pct = Column(Float, nullable=False, default=0.0)
    orders = Column(Integer, nullable=False, default=0)
    revenue = Column(Float, nullable=False, default=0.0)
    createdAt = Column("createdAt", DateTime, nullable=False,
                       default=lambda: datetime.now(timezone.utc))
