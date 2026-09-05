"""ARQ background tasks — replaces BullMQ processors.
Each task corresponds to a NestJS processor/queue.
"""

import logging
from app.database import AnalyticsSessionLocal, ProdSessionLocal

logger = logging.getLogger(__name__)


async def process_daily_orders(ctx, timezone: str, date: str):
    """Process daily orders job (replaces DailyOrdersProcessor)."""
    from app.actions.daily_order_action import store_daily_orders

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process daily orders")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await store_daily_orders(prod_db, analytics_db, timezone, date)
    logger.info(f"Completed daily orders processing for {date}")


async def process_monthly_orders(ctx, timezone: str, year: int, month: int):
    """Process monthly orders job (replaces MonthlyOrdersProcessor)."""
    # Monthly orders use same pattern as daily but with year/month
    logger.info(f"Monthly orders processing for {year}-{month} (to be implemented with monthly action)")


async def process_coupon_daily(ctx, timezone: str, date: str, job_key: str | None = None):
    """Process daily coupon usage job."""
    from app.actions.coupon_daily_action import store_daily_coupon_usage

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await store_daily_coupon_usage(prod_db, analytics_db, timezone, date, job_key)
    logger.info(f"Completed daily coupon processing for {date}")


async def process_coupon_monthly(ctx, timezone: str, year: int, month: int, job_key: str | None = None):
    """Process monthly coupon usage job."""
    from app.actions.coupon_monthly_action import store_monthly_coupon_usage

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await store_monthly_coupon_usage(prod_db, analytics_db, timezone, year, month, job_key)
    logger.info(f"Completed monthly coupon processing for {year}-{month}")


async def process_utm_daily(ctx, timezone: str, date: str):
    """Process daily UTM data job."""
    from app.actions.utm_daily_action import fetch_and_store_utm_daily

    async with AnalyticsSessionLocal() as analytics_db:
        await fetch_and_store_utm_daily(analytics_db, timezone, date)
    logger.info(f"Completed UTM daily processing for {date}")


async def process_utm_monthly(ctx, timezone: str, year: int, month: int):
    """Process monthly UTM data job."""
    from app.actions.utm_monthly_action import fetch_and_store_utm_monthly

    async with AnalyticsSessionLocal() as analytics_db:
        await fetch_and_store_utm_monthly(analytics_db, timezone, year, month)
    logger.info(f"Completed UTM monthly processing for {year}-{month}")


async def process_cart_daily(ctx, timezone: str, date: str):
    """Sync daily cart metrics from prod to analytics DB."""
    from app.actions.cart_sync_action import sync_daily_carts

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await sync_daily_carts(prod_db, analytics_db, date)
    logger.info(f"Completed daily cart sync for {date}")


async def process_cart_monthly(ctx, timezone: str, year: int, month: int):
    """Sync monthly cart metrics from prod to analytics DB."""
    from app.actions.cart_sync_action import sync_monthly_carts

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await sync_monthly_carts(prod_db, analytics_db, year, month)
    logger.info(f"Completed monthly cart sync for {year}-{month}")


async def process_product_daily(ctx, timezone: str, date: str):
    """Sync daily product metrics from prod to analytics DB."""
    from app.actions.product_sync_action import sync_daily_products

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await sync_daily_products(prod_db, analytics_db, date)
    logger.info(f"Completed daily product sync for {date}")


async def process_product_monthly(ctx, timezone: str, year: int, month: int):
    """Sync monthly product metrics from prod to analytics DB."""
    from app.actions.product_sync_action import sync_monthly_products

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await sync_monthly_products(prod_db, analytics_db, year, month)
    logger.info(f"Completed monthly product sync for {year}-{month}")


async def process_search_daily(ctx, timezone: str, date: str):
    """Sync daily search metrics from prod to analytics DB."""
    from app.actions.search_sync_action import sync_daily_searches
    await sync_daily_searches(date)
    logger.info(f"Completed daily search sync for {date}")


async def process_search_monthly(ctx, timezone: str, year: int, month: int):
    """Sync monthly search metrics from daily tables."""
    from app.actions.search_sync_action import sync_monthly_searches
    await sync_monthly_searches(year, month)
    logger.info(f"Completed monthly search sync for {year}-{month}")


async def process_visitor_daily(ctx, timezone: str, date: str):
    """Sync daily visitor metrics from prod to analytics DB."""
    from app.actions.visitor_sync_action import sync_daily_visitors
    await sync_daily_visitors(date)
    logger.info(f"Completed daily visitor sync for {date}")


async def process_visitor_monthly(ctx, timezone: str, year: int, month: int):
    """Sync monthly visitor metrics from prod to analytics DB."""
    from app.actions.visitor_sync_action import sync_monthly_visitors
    await sync_monthly_visitors(year, month)
    logger.info(f"Completed monthly visitor sync for {year}-{month}")


async def process_inventory_sync(ctx):
    """Sync current inventory metrics to analytics DB (snapshot)."""
    from app.actions.inventory_sync_action import sync_inventory_metrics

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await sync_inventory_metrics(prod_db, analytics_db)
    logger.info("Completed inventory metrics sync")


async def process_rfm_sync(ctx):
    """Process RFM segmentation from prod customer order data."""
    from app.actions.rfm_action import process_rfm_segments

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process RFM segments")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_rfm_segments(prod_db, analytics_db)
    logger.info("Completed RFM segmentation processing")


async def process_ltv_sync(ctx):
    """Process LTV by segment from prod orders + analytics RFM data."""
    from app.actions.ltv_action import process_ltv_by_segment

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process LTV segments")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_ltv_by_segment(prod_db, analytics_db)
    logger.info("Completed LTV by segment processing")


async def process_rpr_sync(ctx):
    """Process Repeat Purchase Rate from prod order data."""
    from app.actions.rpr_action import process_rpr

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process RPR")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_rpr(prod_db, analytics_db)
    logger.info("Completed RPR processing")


async def process_reviews_sync(ctx):
    """Sync product reviews from prod to analytics DB."""
    from app.actions.reviews_sync_action import sync_reviews

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot sync reviews")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await sync_reviews(prod_db, analytics_db)
    logger.info("Completed reviews sync")


async def process_correlations_sync(ctx):
    """Process product pair correlations from prod order data."""
    from app.actions.correlations_action import process_correlations

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process correlations")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_correlations(prod_db, analytics_db)
    logger.info("Completed correlations processing")


async def process_fulfillment_sync(ctx):
    """Process dynamic fulfillment metrics (trailing 30 days) from prod data."""
    import datetime
    from app.actions.fulfillment_action import process_daily_fulfillment_metrics

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process fulfillment metrics")
        return

    # To capture late deliveries and RTOs, we recompute the past 30 days day-by-day
    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        today = datetime.date.today()
        for i in range(1, 32):
            target_date = today - datetime.timedelta(days=i)
            await process_daily_fulfillment_metrics(prod_db, analytics_db, target_date)
            
    logger.info("Completed dynamic fulfillment metrics processing (last 30 days)")


async def process_search_keywords_sync(ctx):
    """Sync search keywords from prod to analytics DB."""
    from app.actions.search_keywords_action import sync_search_keywords

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot sync search keywords")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await sync_search_keywords(prod_db, analytics_db)
    logger.info("Completed search keywords sync")


async def process_abandoned_products_sync(ctx):
    """Sync abandoned cart products from prod to analytics DB."""
    from app.actions.cart_abandoned_action import sync_abandoned_products

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot sync abandoned products")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await sync_abandoned_products(prod_db, analytics_db)
    logger.info("Completed abandoned products sync")


async def process_funnel_sync(ctx):
    """Process funnel metrics (Open/Click/Conversion rates) from prod data."""
    from app.actions.funnel_action import process_funnel_metrics

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process funnel metrics")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_funnel_metrics(prod_db, analytics_db)
    logger.info("Completed funnel metrics processing")


async def process_repeat_cohort_sync(ctx):
    """Process repeat purchase cohorts from prod order data."""
    from app.actions.repeat_cohort_action import process_repeat_cohorts

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process repeat cohorts")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_repeat_cohorts(prod_db, analytics_db)
    logger.info("Completed repeat cohort processing")


async def process_lifetime_cohort_sync(ctx):
    """Process customer lifetime value cohorts from prod order data."""
    from app.actions.lifetime_cohort_action import process_lifetime_cohorts

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process lifetime cohorts")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_lifetime_cohorts(prod_db, analytics_db)
    logger.info("Completed lifetime cohort processing")


async def process_utm_attribution_sync(ctx):
    """Process UTM attribution from Umami traffic + prod orders."""
    from app.actions.utm_attribution_action import process_utm_attribution

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process UTM attribution")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_utm_attribution(prod_db, analytics_db)
    logger.info("Completed UTM attribution processing")


async def process_flow_attribution_sync(ctx):
    """Process flow revenue attribution from customer journey data."""
    from app.actions.flow_attribution_action import process_flow_attribution

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process flow attribution")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_flow_attribution(prod_db, analytics_db)
    logger.info("Completed flow attribution processing")


async def process_ceo_dashboard_sync(ctx):
    """Compute CEO dashboard snapshot metrics from prod data."""
    from app.actions.ceo_dashboard_action import process_ceo_dashboard_snapshot

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process CEO dashboard snapshot")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_ceo_dashboard_snapshot(prod_db, analytics_db)
    logger.info("Completed CEO dashboard snapshot processing")


async def process_rto_sync(ctx):
    """Process RTO (Return to Origin) daily metrics from prod order data."""
    from app.actions.rto_action import process_rto_metrics

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process RTO metrics")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_rto_metrics(prod_db, analytics_db)
    logger.info("Completed RTO metrics processing")


async def process_delivery_time_sync(ctx):
    """Process delivery time metrics from prod order data."""
    from app.actions.delivery_time_action import process_delivery_time_metrics

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process delivery time metrics")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_delivery_time_metrics(prod_db, analytics_db)
    logger.info("Completed delivery time metrics processing")


async def process_failure_zones_sync(ctx):
    """Process failure zones metrics from prod order + address data."""
    from app.actions.failure_zones_action import process_failure_zones

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process failure zones")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_failure_zones(prod_db, analytics_db)
    logger.info("Completed failure zones processing")


async def process_return_rate_sync(ctx):
    """Process return rate metrics from prod order data."""
    from app.actions.return_rate_action import process_return_rate

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process return rate")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_return_rate(prod_db, analytics_db)
    logger.info("Completed return rate processing")


async def process_geography_revenue_sync(ctx):
    """Process geography revenue metrics from prod order + address data."""
    from app.actions.geography_revenue_action import process_geography_revenue

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process geography revenue")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_geography_revenue(prod_db, analytics_db)
    logger.info("Completed geography revenue processing")


async def process_courier_performance_sync(ctx):
    """Process courier performance metrics from prod order data."""
    from app.actions.courier_performance_action import process_courier_performance

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process courier performance")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_courier_performance(prod_db, analytics_db)
    logger.info("Completed courier performance processing")


async def process_return_reason_sync(ctx):
    """Process return/refund reason code metrics from prod order data."""
    from app.actions.return_reason_action import process_return_reasons

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process return reasons")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_return_reasons(prod_db, analytics_db)
    logger.info("Completed return reason metrics processing")


async def process_channel_roi_sync(ctx):
    """Process channel ROI metrics from utm_attribution_metrics + spend config.

    NOTE: This task reads only from analytics DB — no prod DB needed.
    """
    from app.actions.channel_roi_action import process_channel_roi

    async with AnalyticsSessionLocal() as analytics_db:
        await process_channel_roi(analytics_db)
    logger.info("Completed channel ROI metrics processing")


async def process_campaign_cac_sync(ctx):
    """Process campaign CAC metrics from Meta Ads API + prod order data."""
    from app.actions.campaign_cac_action import process_campaign_cac

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process campaign CAC")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_campaign_cac(prod_db, analytics_db)
    logger.info("Completed campaign CAC metrics processing")


async def process_marketing_cost_sync(ctx):
    """Process marketing cost per order metrics from Meta Ads API + prod order counts."""
    from app.actions.marketing_cost_action import process_marketing_cost

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process marketing cost")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_marketing_cost(prod_db, analytics_db)
    logger.info("Completed marketing cost per order processing")


async def process_creative_performance_sync(ctx):
    """Process creative-level performance metrics from Meta Ads API + prod order data."""
    from app.actions.creative_performance_action import process_creative_performance

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process creative performance")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_creative_performance(prod_db, analytics_db)
    logger.info("Completed creative performance metrics processing")


async def process_audience_roas_sync(ctx):
    """Process audience (adset-level) ROAS metrics from Meta Ads API."""
    from app.actions.audience_roas_action import process_audience_roas

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process audience ROAS")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_audience_roas(prod_db, analytics_db)
    logger.info("Completed audience ROAS metrics processing")


async def process_search_analytics_sync(ctx):
    """Process comprehensive search analytics snapshot from prod data."""
    from app.actions.search_analytics_action import process_search_analytics

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process search analytics")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_search_analytics(prod_db, analytics_db)
    logger.info("Completed search analytics snapshot processing")


async def process_influencer_attribution_sync(ctx):
    """Process influencer visitor metrics from Umami UTM traffic data.

    NOTE: Only needs analytics DB. Umami API is called inside the action.
    """
    from app.actions.influencer_attribution_action import process_influencer_attribution

    async with AnalyticsSessionLocal() as analytics_db:
        await process_influencer_attribution(analytics_db)
    logger.info("Completed influencer attribution metrics processing")


async def process_payment_failure_sync(ctx):
    """Process payment failure metrics from prod order data (daily)."""
    from app.actions.payment_failure_action import process_payment_failure_metrics

    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process payment failure metrics")
        return

    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await process_payment_failure_metrics(prod_db, analytics_db)
    logger.info("Completed payment failure metrics processing")

# ARQ worker settings
class WorkerSettings:
    """ARQ worker configuration."""
    functions = [
        process_daily_orders,
        process_monthly_orders,
        process_coupon_daily,
        process_coupon_monthly,
        process_utm_daily,
        process_utm_monthly,
        process_cart_daily,
        process_cart_monthly,
        process_product_daily,
        process_product_monthly,
        process_search_daily,
        process_search_monthly,
        process_visitor_daily,
        process_visitor_monthly,
        process_inventory_sync,
        process_rfm_sync,
        process_ltv_sync,
        process_rpr_sync,
        process_reviews_sync,
        process_correlations_sync,
        process_search_keywords_sync,
        process_abandoned_products_sync,
        process_funnel_sync,
        process_fulfillment_sync,
        process_repeat_cohort_sync,
        process_lifetime_cohort_sync,
        process_utm_attribution_sync,
        process_flow_attribution_sync,
        process_ceo_dashboard_sync,
        process_rto_sync,
        process_delivery_time_sync,
        process_failure_zones_sync,
        process_return_rate_sync,
        process_geography_revenue_sync,
        process_courier_performance_sync,
        process_return_reason_sync,
        process_channel_roi_sync,
        process_campaign_cac_sync,
        process_marketing_cost_sync,
        process_creative_performance_sync,
        process_audience_roas_sync,
        process_influencer_attribution_sync,
        process_search_analytics_sync,
        process_payment_failure_sync,
    ]
    # Redis connection is configured at startup




async def process_clv_sync(ctx):
    """Sync customer CLV snapshot from prod DB to analytics DB."""
    from app.actions.clv_sync_action import sync_clv
    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process CLV sync")
        return
    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await sync_clv(prod_db, analytics_db)
    logger.info("Completed CLV sync")


async def process_signup_cohort_sync(ctx):
    """Sync signup cohort metrics from prod DB to analytics DB."""
    from app.actions.signup_cohort_action import sync_signup_cohorts
    if ProdSessionLocal is None:
        logger.error("PROD_DB not configured, cannot process signup cohort sync")
        return
    async with ProdSessionLocal() as prod_db, AnalyticsSessionLocal() as analytics_db:
        await sync_signup_cohorts(prod_db, analytics_db)
    logger.info("Completed signup cohort sync")
