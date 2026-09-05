"""APScheduler cron jobs — replaces @nestjs/schedule cron decorators.
Schedules match the original NestJS cron expressions.
Uses asyncio.create_task for lightweight in-process scheduling.
"""

import asyncio
import logging
from datetime import datetime
from zoneinfo import ZoneInfo
from app.config import get_settings

logger = logging.getLogger(__name__)

_scheduler_task = None
_running = False


async def cron_daily_orders():
    """Daily orders cron — runs at 3:30 AM IST daily."""
    from app.utils.date import get_yesterday_date
    from app.workers.tasks import process_daily_orders

    settings = get_settings()
    tz = settings.TIMEZONE
    yesterday = get_yesterday_date(tz)
    logger.info(f"[CRON] Daily orders: processing {yesterday}")
    try:
        await process_daily_orders({}, tz, yesterday)
    except Exception as e:
        logger.error(f"[CRON] Daily orders error: {e}")


async def cron_monthly_orders():
    """Monthly orders cron — runs at 3:30 AM IST on 1st of month."""
    from app.utils.date import get_previous_month
    from app.workers.tasks import process_monthly_orders

    settings = get_settings()
    tz = settings.TIMEZONE
    prev = get_previous_month(tz)
    logger.info(f"[CRON] Monthly orders: processing {prev['year']}-{prev['month']}")
    try:
        await process_monthly_orders({}, tz, prev["year"], prev["month"])
    except Exception as e:
        logger.error(f"[CRON] Monthly orders error: {e}")


async def cron_utm_daily():
    """UTM daily cron — runs at 3:00 AM IST daily."""
    from app.utils.date import get_yesterday_date
    from app.workers.tasks import process_utm_daily

    settings = get_settings()
    tz = settings.TIMEZONE
    yesterday = get_yesterday_date(tz)
    logger.info(f"[CRON] UTM daily: processing {yesterday}")
    try:
        await process_utm_daily({}, tz, yesterday)
    except Exception as e:
        logger.error(f"[CRON] UTM daily error: {e}")


async def cron_utm_monthly():
    """UTM monthly cron — runs at 3:00 AM IST on 1st of month."""
    from app.utils.date import get_previous_month
    from app.workers.tasks import process_utm_monthly

    settings = get_settings()
    tz = settings.TIMEZONE
    prev = get_previous_month(tz)
    logger.info(f"[CRON] UTM monthly: processing {prev['year']}-{prev['month']}")
    try:
        await process_utm_monthly({}, tz, prev["year"], prev["month"])
    except Exception as e:
        logger.error(f"[CRON] UTM monthly error: {e}")


async def cron_coupon_daily():
    """Coupon daily cron — runs at 4:00 AM IST daily."""
    from app.utils.date import get_yesterday_date
    from app.workers.tasks import process_coupon_daily

    settings = get_settings()
    tz = settings.TIMEZONE
    yesterday = get_yesterday_date(tz)
    job_key = f"coupon-daily-{yesterday}-{tz.replace('/', '-')}"
    logger.info(f"[CRON] Coupon daily: processing {yesterday}")
    try:
        await process_coupon_daily({}, tz, yesterday, job_key)
    except Exception as e:
        logger.error(f"[CRON] Coupon daily error: {e}")


async def cron_coupon_monthly():
    """Coupon monthly cron — runs at 4:00 AM IST on 1st of month."""
    from app.utils.date import get_previous_month
    from app.workers.tasks import process_coupon_monthly

    settings = get_settings()
    tz = settings.TIMEZONE
    prev = get_previous_month(tz)
    job_key = f"coupon-monthly-{prev['year']}-{prev['month']}-{tz.replace('/', '-')}"
    logger.info(f"[CRON] Coupon monthly: processing {prev['year']}-{prev['month']}")
    try:
        await process_coupon_monthly({}, tz, prev["year"], prev["month"], job_key)
    except Exception as e:
        logger.error(f"[CRON] Coupon monthly error: {e}")


async def cron_cart_daily():
    """Cart daily cron — runs at 4:30 AM IST daily."""
    from app.utils.date import get_yesterday_date
    from app.workers.tasks import process_cart_daily

    settings = get_settings()
    tz = settings.TIMEZONE
    yesterday = get_yesterday_date(tz)
    logger.info(f"[CRON] Cart daily: processing {yesterday}")
    try:
        await process_cart_daily({}, tz, yesterday)
    except Exception as e:
        logger.error(f"[CRON] Cart daily error: {e}")


async def cron_cart_monthly():
    """Cart monthly cron — runs at 4:30 AM IST on 1st of month."""
    from app.utils.date import get_previous_month
    from app.workers.tasks import process_cart_monthly

    settings = get_settings()
    tz = settings.TIMEZONE
    prev = get_previous_month(tz)
    logger.info(f"[CRON] Cart monthly: processing {prev['year']}-{prev['month']}")
    try:
        await process_cart_monthly({}, tz, prev["year"], prev["month"])
    except Exception as e:
        logger.error(f"[CRON] Cart monthly error: {e}")


async def cron_product_daily():
    """Product daily cron — runs at 4:30 AM IST daily."""
    from app.utils.date import get_yesterday_date
    from app.workers.tasks import process_product_daily

    settings = get_settings()
    tz = settings.TIMEZONE
    yesterday = get_yesterday_date(tz)
    logger.info(f"[CRON] Product daily: processing {yesterday}")
    try:
        await process_product_daily({}, tz, yesterday)
    except Exception as e:
        logger.error(f"[CRON] Product daily error: {e}")


async def cron_product_monthly():
    """Product monthly cron — runs at 4:30 AM IST on 1st of month."""
    from app.utils.date import get_previous_month
    from app.workers.tasks import process_product_monthly

    settings = get_settings()
    tz = settings.TIMEZONE
    prev = get_previous_month(tz)
    logger.info(f"[CRON] Product monthly: processing {prev['year']}-{prev['month']}")
    try:
        await process_product_monthly({}, tz, prev["year"], prev["month"])
    except Exception as e:
        logger.error(f"[CRON] Product monthly error: {e}")


async def cron_search_daily():
    """Search daily cron — runs at 4:45 AM IST daily."""
    from app.utils.date import get_yesterday_date
    from app.workers.tasks import process_search_daily

    settings = get_settings()
    tz = settings.TIMEZONE
    yesterday = get_yesterday_date(tz)
    logger.info(f"[CRON] Search daily: processing {yesterday}")
    try:
        await process_search_daily({}, tz, yesterday)
    except Exception as e:
        logger.error(f"[CRON] Search daily error: {e}")


async def cron_search_monthly():
    """Search monthly cron — runs at 4:45 AM IST on 1st of month."""
    from app.utils.date import get_previous_month
    from app.workers.tasks import process_search_monthly

    settings = get_settings()
    tz = settings.TIMEZONE
    prev = get_previous_month(tz)
    logger.info(f"[CRON] Search monthly: processing {prev['year']}-{prev['month']}")
    try:
        await process_search_monthly({}, tz, prev["year"], prev["month"])
    except Exception as e:
        logger.error(f"[CRON] Search monthly error: {e}")


async def cron_visitor_daily():
    """Visitor daily cron — runs at 4:45 AM IST daily."""
    from app.utils.date import get_yesterday_date
    from app.workers.tasks import process_visitor_daily

    settings = get_settings()
    tz = settings.TIMEZONE
    yesterday = get_yesterday_date(tz)
    logger.info(f"[CRON] Visitor daily: processing {yesterday}")
    try:
        await process_visitor_daily({}, tz, yesterday)
    except Exception as e:
        logger.error(f"[CRON] Visitor daily error: {e}")


async def cron_visitor_monthly():
    """Visitor monthly cron — runs at 4:45 AM IST on 1st of month."""
    from app.utils.date import get_previous_month
    from app.workers.tasks import process_visitor_monthly

    settings = get_settings()
    tz = settings.TIMEZONE
    prev = get_previous_month(tz)
    logger.info(f"[CRON] Visitor monthly: processing {prev['year']}-{prev['month']}")
    try:
        await process_visitor_monthly({}, tz, prev["year"], prev["month"])
    except Exception as e:
        logger.error(f"[CRON] Visitor monthly error: {e}")


async def cron_inventory_sync():
    """Inventory daily snapshot sync — runs at 5:00 AM IST."""
    from app.workers.tasks import process_inventory_sync

    logger.info("[CRON] Inventory snapshot sync starting")
    try:
        await process_inventory_sync({})
    except Exception as e:
        logger.error(f"[CRON] Inventory sync error: {e}")


async def cron_rfm_segments():
    """RFM segmentation cron — runs at 5:30 AM IST daily."""
    from app.workers.tasks import process_rfm_sync

    logger.info("[CRON] RFM segmentation starting")
    try:
        await process_rfm_sync({})
    except Exception as e:
        logger.error(f"[CRON] RFM segmentation error: {e}")


async def cron_ltv_segments():
    """LTV by segment cron — runs at 6:00 AM IST daily (after RFM)."""
    from app.workers.tasks import process_ltv_sync

    logger.info("[CRON] LTV by segment starting")
    try:
        await process_ltv_sync({})
    except Exception as e:
        logger.error(f"[CRON] LTV by segment error: {e}")


async def cron_rpr():
    """RPR cron — runs at 6:30 AM IST daily."""
    from app.workers.tasks import process_rpr_sync

    logger.info("[CRON] RPR starting")
    try:
        await process_rpr_sync({})
    except Exception as e:
        logger.error(f"[CRON] RPR error: {e}")


async def cron_reviews_sync():
    """Reviews sync cron — runs at 7:00 AM IST daily."""
    from app.workers.tasks import process_reviews_sync

    logger.info("[CRON] Reviews sync starting")
    try:
        await process_reviews_sync({})
    except Exception as e:
        logger.error(f"[CRON] Reviews sync error: {e}")


async def cron_search_keywords_sync():
    """Search keywords sync cron — runs at 7:00 AM IST daily."""
    from app.workers.tasks import process_search_keywords_sync

    logger.info("[CRON] Search keywords sync starting")
    try:
        await process_search_keywords_sync({})
    except Exception as e:
        logger.error(f"[CRON] Search keywords sync error: {e}")


async def cron_abandoned_products_sync():
    """Abandoned products sync cron — runs at 7:00 AM IST daily."""
    from app.workers.tasks import process_abandoned_products_sync

    logger.info("[CRON] Abandoned products sync starting")
    try:
        await process_abandoned_products_sync({})
    except Exception as e:
        logger.error(f"[CRON] Abandoned products sync error: {e}")


async def cron_correlations_sync():
    """Correlations sync cron — runs at 7:30 AM IST daily."""
    from app.workers.tasks import process_correlations_sync

    logger.info("[CRON] Correlations sync starting")
    try:
        await process_correlations_sync({})
    except Exception as e:
        logger.error(f"[CRON] Correlations sync error: {e}")


async def cron_fulfillment_metrics():
    """Fulfillment metrics cron — runs at 7:15 AM IST daily."""
    from app.workers.tasks import process_fulfillment_sync

    logger.info("[CRON] Fulfillment metrics starting")
    try:
        await process_fulfillment_sync({})
    except Exception as e:
        logger.error(f"[CRON] Fulfillment metrics error: {e}")


async def cron_funnel_metrics():
    """Funnel metrics cron — runs at 7:45 AM IST daily (after RPR)."""
    from app.workers.tasks import process_funnel_sync

    logger.info("[CRON] Funnel metrics starting")
    try:
        await process_funnel_sync({})
    except Exception as e:
        logger.error(f"[CRON] Funnel metrics error: {e}")


async def cron_repeat_cohorts():
    """Repeat purchase cohorts cron — runs at 8:00 AM IST daily."""
    from app.workers.tasks import process_repeat_cohort_sync

    logger.info("[CRON] Repeat purchase cohorts starting")
    try:
        await process_repeat_cohort_sync({})
    except Exception as e:
        logger.error(f"[CRON] Repeat cohorts error: {e}")


async def cron_lifetime_cohorts():
    """Lifetime value cohorts cron — runs at 8:30 AM IST daily."""
    from app.workers.tasks import process_lifetime_cohort_sync

    logger.info("[CRON] Lifetime value cohorts starting")
    try:
        await process_lifetime_cohort_sync({})
    except Exception as e:
        logger.error(f"[CRON] Lifetime cohorts error: {e}")


async def cron_utm_attribution():
    """UTM attribution cron — runs at 9:00 AM IST daily."""
    from app.workers.tasks import process_utm_attribution_sync

    logger.info("[CRON] UTM attribution starting")
    try:
        await process_utm_attribution_sync({})
    except Exception as e:
        logger.error(f"[CRON] UTM attribution error: {e}")


async def cron_flow_attribution():
    """Flow attribution cron — runs at 9:30 AM IST daily."""
    from app.workers.tasks import process_flow_attribution_sync

    logger.info("[CRON] Flow attribution starting")
    try:
        await process_flow_attribution_sync({})
    except Exception as e:
        logger.error(f"[CRON] Flow attribution error: {e}")


async def cron_rto_metrics():
    """RTO metrics cron — runs at 9:45 AM IST daily (after flow attribution)."""
    from app.workers.tasks import process_rto_sync

    logger.info("[CRON] RTO metrics starting")
    try:
        await process_rto_sync({})
    except Exception as e:
        logger.error(f"[CRON] RTO metrics error: {e}")


async def cron_ceo_dashboard():
    """CEO Dashboard snapshot cron — runs at 10:00 AM IST daily."""
    from app.workers.tasks import process_ceo_dashboard_sync

    logger.info("[CRON] CEO Dashboard snapshot starting")
    try:
        await process_ceo_dashboard_sync({})
    except Exception as e:
        logger.error(f"[CRON] CEO Dashboard snapshot error: {e}")


async def cron_delivery_time():
    """Delivery time metrics cron — runs at 10:30 AM IST daily (after RTO + CEO dashboard)."""
    from app.workers.tasks import process_delivery_time_sync

    logger.info("[CRON] Delivery time metrics starting")
    try:
        await process_delivery_time_sync({})
    except Exception as e:
        logger.error(f"[CRON] Delivery time metrics error: {e}")


async def cron_failure_zones():
    """Failure zones metrics cron — runs at 11:00 AM IST daily (after Delivery Time)."""
    from app.workers.tasks import process_failure_zones_sync

    logger.info("[CRON] Failure zones metrics starting")
    try:
        await process_failure_zones_sync({})
    except Exception as e:
        logger.error(f"[CRON] Failure zones metrics error: {e}")


async def cron_return_rate():
    """Return rate metrics cron — runs at 11:30 AM IST daily (after Failure Zones)."""
    from app.workers.tasks import process_return_rate_sync

    logger.info("[CRON] Return rate metrics starting")
    try:
        await process_return_rate_sync({})
    except Exception as e:
        logger.error(f"[CRON] Return rate metrics error: {e}")


async def cron_geography_revenue():
    """Geography revenue metrics cron — runs at 12:00 PM IST daily (after Return Rate)."""
    from app.workers.tasks import process_geography_revenue_sync

    logger.info("[CRON] Geography revenue metrics starting")
    try:
        await process_geography_revenue_sync({})
    except Exception as e:
        logger.error(f"[CRON] Geography revenue metrics error: {e}")


async def cron_courier_performance():
    """Courier performance metrics cron — runs at 12:30 PM IST daily (after Geo Revenue)."""
    from app.workers.tasks import process_courier_performance_sync

    logger.info("[CRON] Courier performance metrics starting")
    try:
        await process_courier_performance_sync({})
    except Exception as e:
        logger.error(f"[CRON] Courier performance metrics error: {e}")


async def cron_return_reason():
    """Return reason metrics cron — runs at 1:00 PM IST daily (after Courier Performance)."""
    from app.workers.tasks import process_return_reason_sync

    logger.info("[CRON] Return reason metrics starting")
    try:
        await process_return_reason_sync({})
    except Exception as e:
        logger.error(f"[CRON] Return reason metrics error: {e}")


async def cron_channel_roi():
    """Channel ROI metrics cron — runs at 1:30 PM IST daily (after Return Reasons)."""
    from app.workers.tasks import process_channel_roi_sync

    logger.info("[CRON] Channel ROI metrics starting")
    try:
        await process_channel_roi_sync({})
    except Exception as e:
        logger.error(f"[CRON] Channel ROI metrics error: {e}")


async def cron_campaign_cac():
    """Campaign CAC metrics cron — runs at 2:00 PM IST daily (after Channel ROI)."""
    from app.workers.tasks import process_campaign_cac_sync

    logger.info("[CRON] Campaign CAC metrics starting")
    try:
        await process_campaign_cac_sync({})
    except Exception as e:
        logger.error(f"[CRON] Campaign CAC metrics error: {e}")


async def cron_marketing_cost():
    """Marketing Cost per Order cron — runs at 2:30 PM IST daily (after Campaign CAC)."""
    from app.workers.tasks import process_marketing_cost_sync

    logger.info("[CRON] Marketing Cost per Order starting")
    try:
        await process_marketing_cost_sync({})
    except Exception as e:
        logger.error(f"[CRON] Marketing Cost per Order error: {e}")


async def cron_creative_performance():
    """Creative Performance metrics cron — runs at 3:00 PM IST daily (after Marketing Cost)."""
    from app.workers.tasks import process_creative_performance_sync

    logger.info("[CRON] Creative Performance metrics starting")
    try:
        await process_creative_performance_sync({})
    except Exception as e:
        logger.error(f"[CRON] Creative Performance metrics error: {e}")


async def cron_audience_roas():
    """Audience ROAS metrics cron — runs at 3:30 PM IST daily (after Creative Performance)."""
    from app.workers.tasks import process_audience_roas_sync

    logger.info("[CRON] Audience ROAS metrics starting")
    try:
        await process_audience_roas_sync({})
    except Exception as e:
        logger.error(f"[CRON] Audience ROAS metrics error: {e}")


async def cron_influencer_attribution():
    """Influencer Attribution cron — runs at 4:00 PM IST daily."""
    from app.workers.tasks import process_influencer_attribution_sync

    logger.info("[CRON] Influencer Attribution starting")
    try:
        await process_influencer_attribution_sync({})
    except Exception as e:
        logger.error(f"[CRON] Influencer Attribution error: {e}")


async def cron_search_analytics():
    """Search analytics snapshot cron — runs at 4:30 PM IST daily."""
    from app.workers.tasks import process_search_analytics_sync

    logger.info("[CRON] Search analytics snapshot starting")
    try:
        await process_search_analytics_sync({})
    except Exception as e:
        logger.error(f"[CRON] Search analytics snapshot error: {e}")


async def cron_payment_failure():
    """Payment failure metrics cron — runs at 5:00 PM IST daily (after Search Analytics)."""
    from app.workers.tasks import process_payment_failure_sync

    logger.info("[CRON] Payment failure metrics starting")
    try:
        await process_payment_failure_sync({})
    except Exception as e:
        logger.error(f"[CRON] Payment failure metrics error: {e}")


async def cron_clv_sync():
    """Customer CLV snapshot cron — runs at 5:30 PM IST daily."""
    from app.workers.tasks import process_clv_sync

    logger.info("[CRON] CLV sync starting")
    try:
        await process_clv_sync({})
    except Exception as e:
        logger.error(f"[CRON] CLV sync error: {e}")


async def cron_signup_cohort_sync():
    """Signup cohort metrics cron — runs at 6:00 PM IST daily."""
    from app.workers.tasks import process_signup_cohort_sync

    logger.info("[CRON] Signup cohort sync starting")
    try:
        await process_signup_cohort_sync({})
    except Exception as e:
        logger.error(f"[CRON] Signup cohort sync error: {e}")


# Cron schedule definition: (hour, minute, day_of_month_or_None, coro_func)
_SCHEDULES = [
    (3, 30, None, cron_daily_orders),     # daily at 3:30 AM IST
    (3, 30, 1, cron_monthly_orders),      # 1st of month at 3:30 AM IST
    (3, 0, None, cron_utm_daily),         # daily at 3:00 AM IST
    (3, 0, 1, cron_utm_monthly),          # 1st of month at 3:00 AM IST
    (4, 0, None, cron_coupon_daily),      # daily at 4:00 AM IST
    (4, 0, 1, cron_coupon_monthly),       # 1st of month at 4:00 AM IST
    (4, 30, None, cron_cart_daily),       # daily at 4:30 AM IST
    (4, 30, 1, cron_cart_monthly),        # 1st of month at 4:30 AM IST
    (4, 30, None, cron_product_daily),    # daily at 4:30 AM IST
    (4, 30, 1, cron_product_monthly),     # 1st of month at 4:30 AM IST
    (4, 45, None, cron_search_daily),     # daily at 4:45 AM IST
    (4, 45, 1, cron_search_monthly),      # 1st of month at 4:45 AM IST
    (4, 45, None, cron_visitor_daily),    # daily at 4:45 AM IST
    (4, 45, 1, cron_visitor_monthly),     # 1st of month at 4:45 AM IST
    (5, 0, None, cron_inventory_sync),    # daily at 5:00 AM IST
    (5, 30, None, cron_rfm_segments),     # daily at 5:30 AM IST
    (6, 0, None, cron_ltv_segments),      # daily at 6:00 AM IST (after RFM)
    (6, 30, None, cron_rpr),               # daily at 6:30 AM IST
    (7, 0, None, cron_reviews_sync),       # daily at 7:00 AM IST
    (7, 0, None, cron_search_keywords_sync), # daily at 7:00 AM IST
    (7, 0, None, cron_abandoned_products_sync), # daily at 7:00 AM IST
    (7, 15, None, cron_fulfillment_metrics), # daily at 7:15 AM IST
    (7, 30, None, cron_correlations_sync),  # daily at 7:30 AM IST
    (7, 45, None, cron_funnel_metrics),      # daily at 7:45 AM IST
    (8, 0, None, cron_repeat_cohorts),        # daily at 8:00 AM IST
    (8, 30, None, cron_lifetime_cohorts),      # daily at 8:30 AM IST
    (9, 0, None, cron_utm_attribution),        # daily at 9:00 AM IST
    (9, 30, None, cron_flow_attribution),       # daily at 9:30 AM IST
    (9, 45, None, cron_rto_metrics),              # daily at 9:45 AM IST
    (10, 0, None, cron_ceo_dashboard),            # daily at 10:00 AM IST
    (10, 30, None, cron_delivery_time),            # daily at 10:30 AM IST
    (11, 0, None, cron_failure_zones),              # daily at 11:00 AM IST
    (11, 30, None, cron_return_rate),                # daily at 11:30 AM IST
    (12, 0, None, cron_geography_revenue),           # daily at 12:00 PM IST
    (12, 30, None, cron_courier_performance),         # daily at 12:30 PM IST
    (13, 0, None, cron_return_reason),                   # daily at 1:00 PM IST
    (13, 30, None, cron_channel_roi),                    # daily at 1:30 PM IST
    (14, 0, None, cron_campaign_cac),                    # daily at 2:00 PM IST
    (14, 30, None, cron_marketing_cost),                   # daily at 2:30 PM IST
    (15, 0, None, cron_creative_performance),               # daily at 3:00 PM IST
    (15, 30, None, cron_audience_roas),                      # daily at 3:30 PM IST
    (16, 0, None, cron_influencer_attribution),               # daily at 4:00 PM IST
    (16, 30, None, cron_search_analytics),                     # daily at 4:30 PM IST
    (17, 0, None, cron_payment_failure),                       # daily at 5:00 PM IST
    (17, 30, None, cron_clv_sync),                             # daily at 5:30 PM IST
    (18, 0, None, cron_signup_cohort_sync),                    # daily at 6:00 PM IST
]


async def _scheduler_loop():
    """Simple scheduler loop that checks every 30 seconds if any cron job should run."""
    global _running
    tz = ZoneInfo("Asia/Kolkata")
    last_run = {}

    while _running:
        now = datetime.now(tz)
        for hour, minute, day, func in _SCHEDULES:
            # Check if should run
            if now.hour == hour and now.minute == minute:
                if day is not None and now.day != day:
                    continue
                run_key = f"{func.__name__}-{now.strftime('%Y-%m-%d-%H-%M')}"
                if run_key not in last_run:
                    last_run[run_key] = True
                    logger.info(f"[SCHEDULER] Triggering {func.__name__}")
                    asyncio.create_task(func())

        # Clean old runs (keep last 100)
        if len(last_run) > 100:
            last_run.clear()

        await asyncio.sleep(30)


def start_scheduler():
    """Start the cron scheduler as a background asyncio task."""
    global _scheduler_task, _running
    _running = True
    _scheduler_task = asyncio.ensure_future(_scheduler_loop())
    logger.info(f"Scheduler started with {len(_SCHEDULES)} cron jobs")


def stop_scheduler():
    """Stop the scheduler."""
    global _scheduler_task, _running
    _running = False
    if _scheduler_task:
        _scheduler_task.cancel()
    logger.info("Scheduler stopped")
