"""Backfill router — port of backfill.service.ts.
Allows reprocessing historical data for any action across a date range.
"""

import logging
from datetime import datetime, timedelta, timezone as dt_tz
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, delete
from app.database import get_analytics_db, get_prod_db
from app.schemas.responses import success_response, error_response
from app.config import get_settings
from app.models.analytics import DailyOrders

router = APIRouter(prefix="/backfill", tags=["Backfill"])
logger = logging.getLogger(__name__)

AVAILABLE_ACTIONS = [
    # Category A: Date-range daily/monthly
    "daily-orders", "monthly-orders",
    "coupon-daily", "coupon-monthly",
    "cart-daily", "cart-monthly",
    "product-daily", "product-monthly",
    "search-daily", "search-monthly",
    "visitor-daily", "visitor-monthly",
    "engagement-daily",
    "utm-daily", "utm-monthly",
    # Category B: Trailing-window (extended for backfill)
    "rto", "delivery-time", "fulfillment",
    "payment-failure",
    "failure-zones", "return-rate", "geography-revenue",
    "courier-performance", "return-reasons",
    # Category C: Snapshot/full-recompute
    "rfm", "ltv", "rpr",
    "funnel", "repeat-cohorts", "lifetime-cohorts",
    "utm-attribution", "flow-attribution", "channel-roi",
    "reviews", "correlations", "search-keywords", "abandoned-products",
    "inventory", "ceo-dashboard", "search-analytics",
    # Category E: Meta Ads
    "campaign-cac", "marketing-cost", "creative-performance", "audience-roas",
    "influencer-attribution",
    # Category F: New pipelines
    "clv", "signup-cohorts",
]


@router.get("/actions")
async def get_available_actions(request: Request):
    """List available backfill actions."""
    return success_response(data=AVAILABLE_ACTIONS, path=str(request.url.path))


@router.post("/run/{action_name}")
async def run_backfill(
    request: Request,
    action_name: str,
    startDate: str = Query(..., description="Start date (YYYY-MM-DD)"),
    endDate: str = Query(..., description="End date (YYYY-MM-DD)"),
    timezone: str = Query("Asia/Kolkata"),
    dryRun: bool = Query(False),
    analytics_db: AsyncSession = Depends(get_analytics_db),
    prod_db: AsyncSession = Depends(get_prod_db),
):
    if action_name not in AVAILABLE_ACTIONS:
        return error_response(
            message=f"Unknown action: {action_name}. Available: {', '.join(AVAILABLE_ACTIONS)}",
            status_code=400, path=str(request.url.path),
        )

    if prod_db is None:
        return error_response(
            message="PROD_DB not configured — backfill requires production database",
            status_code=500, path=str(request.url.path),
        )

    start = datetime.fromisoformat(startDate)
    end = datetime.fromisoformat(endDate)
    processed = 0
    skipped = 0
    failed = 0
    errors = []
    start_time = datetime.now(dt_tz.utc)

    if action_name == "daily-orders":
        from app.actions.daily_order_action import store_daily_orders
        current = start
        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            try:
                if not dryRun:
                    await store_daily_orders(prod_db, analytics_db, timezone, date_str)
                processed += 1
                logger.info(f"[BACKFILL] daily-orders: processed {date_str}")
            except Exception as e:
                failed += 1
                errors.append(f"{date_str}: {str(e)}")
                logger.error(f"[BACKFILL] daily-orders failed for {date_str}: {e}")
            current += timedelta(days=1)

    elif action_name == "monthly-orders":
        from app.actions.monthly_order_action import store_monthly_orders
        current = start.replace(day=1)
        while current <= end:
            try:
                if not dryRun:
                    await store_monthly_orders(prod_db, analytics_db, timezone, current.year, current.month)
                processed += 1
                logger.info(f"[BACKFILL] monthly-orders: processed {current.year}-{current.month}")
            except Exception as e:
                failed += 1
                errors.append(f"{current.year}-{current.month}: {str(e)}")
            # Move to next month
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)

    elif action_name == "coupon-daily":
        from app.actions.coupon_daily_action import store_daily_coupon_usage
        current = start
        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            try:
                if not dryRun:
                    await store_daily_coupon_usage(prod_db, analytics_db, timezone, date_str)
                processed += 1
            except Exception as e:
                failed += 1
                errors.append(f"{date_str}: {str(e)}")
            current += timedelta(days=1)

    elif action_name == "coupon-monthly":
        from app.actions.coupon_monthly_action import store_monthly_coupon_usage
        current = start.replace(day=1)
        while current <= end:
            try:
                if not dryRun:
                    await store_monthly_coupon_usage(prod_db, analytics_db, timezone, current.year, current.month)
                processed += 1
            except Exception as e:
                failed += 1
                errors.append(f"{current.year}-{current.month}: {str(e)}")
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)
                
    elif action_name == "search-daily":
        from app.actions.search_sync_action import sync_daily_searches
        current = start
        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            try:
                if not dryRun:
                    await sync_daily_searches(date_str)
                processed += 1
            except Exception as e:
                failed += 1
                errors.append(f"{date_str}: {str(e)}")
            current += timedelta(days=1)

    elif action_name == "search-monthly":
        from app.actions.search_sync_action import sync_monthly_searches
        current = start.replace(day=1)
        while current <= end:
            try:
                if not dryRun:
                    await sync_monthly_searches(current.year, current.month)
                processed += 1
            except Exception as e:
                failed += 1
                errors.append(f"{current.year}-{current.month}: {str(e)}")
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)
                
    elif action_name == "visitor-daily":
        from app.actions.visitor_sync_action import sync_daily_visitors
        current = start
        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            try:
                if not dryRun:
                    await sync_daily_visitors(date_str)
                processed += 1
            except Exception as e:
                failed += 1
                errors.append(f"{date_str}: {str(e)}")
            current += timedelta(days=1)

    elif action_name == "engagement-daily":
        from app.actions.engagement_sync_action import sync_daily_engagement
        current = start
        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            try:
                if not dryRun:
                    await sync_daily_engagement(date_str)
                processed += 1
            except Exception as e:
                failed += 1
                errors.append(f"{date_str}: {str(e)}")
                logger.error(f"[BACKFILL] engagement-daily failed for {date_str}: {e}")
            current += timedelta(days=1)

    elif action_name == "return-reasons":
        from app.actions.return_reason_action import process_return_reasons
        try:
            if not dryRun:
                await process_return_reasons(prod_db, analytics_db)
            processed += 1
            logger.info("[BACKFILL] return-reasons: processed last 30 days")
        except Exception as e:
            failed += 1
            errors.append(f"return-reasons: {str(e)}")
            logger.error(f"[BACKFILL] return-reasons failed: {e}")

    elif action_name == "visitor-monthly":
        from app.actions.visitor_sync_action import sync_monthly_visitors
        current = start.replace(day=1)
        while current <= end:
            try:
                if not dryRun:
                    await sync_monthly_visitors(current.year, current.month)
                processed += 1
            except Exception as e:
                failed += 1
                errors.append(f"{current.year}-{current.month}: {str(e)}")
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)

    elif action_name == "campaign-cac":
        from app.actions.campaign_cac_action import process_campaign_cac
        try:
            if not dryRun:
                await process_campaign_cac(prod_db, analytics_db, start.date(), end.date())
            processed += 1
            logger.info("[BACKFILL] campaign-cac: processed for date range")
        except Exception as e:
            failed += 1
            errors.append(f"campaign-cac: {str(e)}")
            logger.error(f"[BACKFILL] campaign-cac failed: {e}")

    elif action_name == "marketing-cost":
        from app.actions.marketing_cost_action import process_marketing_cost
        try:
            if not dryRun:
                await process_marketing_cost(prod_db, analytics_db, start.date(), end.date())
            processed += 1
            logger.info("[BACKFILL] marketing-cost: processed for date range")
        except Exception as e:
            failed += 1
            errors.append(f"marketing-cost: {str(e)}")
            logger.error(f"[BACKFILL] marketing-cost failed: {e}")

    elif action_name == "creative-performance":
        from app.actions.creative_performance_action import process_creative_performance
        try:
            if not dryRun:
                await process_creative_performance(prod_db, analytics_db, start.date(), end.date())
            processed += 1
            logger.info("[BACKFILL] creative-performance: processed for date range")
        except Exception as e:
            failed += 1
            errors.append(f"creative-performance: {str(e)}")
            logger.error(f"[BACKFILL] creative-performance failed: {e}")

    elif action_name == "audience-roas":
        from app.actions.audience_roas_action import process_audience_roas
        try:
            if not dryRun:
                await process_audience_roas(prod_db, analytics_db, start.date(), end.date())
            processed += 1
            logger.info("[BACKFILL] audience-roas: processed for date range")
        except Exception as e:
            failed += 1
            errors.append(f"audience-roas: {str(e)}")
            logger.error(f"[BACKFILL] audience-roas failed: {e}")

    elif action_name == "influencer-attribution":
        from app.actions.influencer_attribution_action import process_influencer_attribution
        try:
            if not dryRun:
                await process_influencer_attribution(analytics_db, start.date(), end.date())
            processed += 1
            logger.info("[BACKFILL] influencer-attribution: processed for date range")
        except Exception as e:
            failed += 1
            errors.append(f"influencer-attribution: {str(e)}")
            logger.error(f"[BACKFILL] influencer-attribution failed: {e}")

    elif action_name == "search-analytics":
        from app.actions.search_analytics_action import process_search_analytics
        try:
            if not dryRun:
                # Create the table if it doesn't exist
                await analytics_db.execute(text("""
                    CREATE TABLE IF NOT EXISTS search_analytics_snapshot (
                        id TEXT PRIMARY KEY,
                        snapshot_date DATE NOT NULL,
                        top_keywords_data JSONB NOT NULL DEFAULT '[]'::JSONB,
                        zero_result_data JSONB NOT NULL DEFAULT '[]'::JSONB,
                        low_result_data JSONB NOT NULL DEFAULT '[]'::JSONB,
                        high_exit_data JSONB NOT NULL DEFAULT '[]'::JSONB,
                        brand_volume_data JSONB NOT NULL DEFAULT '[]'::JSONB,
                        category_demand_data JSONB NOT NULL DEFAULT '[]'::JSONB,
                        attributes_frequency_data JSONB NOT NULL DEFAULT '[]'::JSONB,
                        new_vs_returning_data JSONB NOT NULL DEFAULT '[]'::JSONB,
                        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
                    )
                """))
                await analytics_db.execute(text("""
                    ALTER TABLE search_analytics_snapshot
                    DROP CONSTRAINT IF EXISTS search_analytics_snapshot_date_key
                """))
                await analytics_db.execute(text("""
                    ALTER TABLE search_analytics_snapshot
                    ADD CONSTRAINT search_analytics_snapshot_date_key UNIQUE (snapshot_date)
                """))
                await analytics_db.commit()
                await process_search_analytics(prod_db, analytics_db)
            processed += 1
            logger.info("[BACKFILL] search-analytics: snapshot computed")
        except Exception as e:
            failed += 1
            errors.append(f"search-analytics: {str(e)}")
            logger.error(f"[BACKFILL] search-analytics failed: {e}")

    elif action_name == "payment-failure":
        from app.actions.payment_failure_action import _process_day as pf_process_day
        current = start
        while current <= end:
            try:
                if not dryRun:
                    await pf_process_day(prod_db, analytics_db, current.date() if hasattr(current, 'date') else current)
                processed += 1
                logger.info(f"[BACKFILL] payment-failure: processed {current.strftime('%Y-%m-%d')}")
            except Exception as e:
                failed += 1
                errors.append(f"{current.strftime('%Y-%m-%d')}: {str(e)}")
                logger.error(f"[BACKFILL] payment-failure failed for {current.strftime('%Y-%m-%d')}: {e}")
            current += timedelta(days=1)

    elif action_name == "rto":
        from app.actions.rto_action import _process_day as rto_process_day
        current = start
        while current <= end:
            try:
                if not dryRun:
                    await rto_process_day(prod_db, analytics_db, current.date() if hasattr(current, 'date') else current)
                processed += 1
            except Exception as e:
                failed += 1
                errors.append(f"{current.strftime('%Y-%m-%d')}: {str(e)}")
            current += timedelta(days=1)

    elif action_name == "delivery-time":
        from app.actions.delivery_time_action import _process_day as dt_process_day
        current = start
        while current <= end:
            try:
                if not dryRun:
                    await dt_process_day(prod_db, analytics_db, current.date() if hasattr(current, 'date') else current)
                processed += 1
            except Exception as e:
                failed += 1
                errors.append(f"{current.strftime('%Y-%m-%d')}: {str(e)}")
            current += timedelta(days=1)

    elif action_name == "fulfillment":
        from app.actions.fulfillment_action import process_daily_fulfillment_metrics
        current = start
        while current <= end:
            try:
                if not dryRun:
                    await process_daily_fulfillment_metrics(prod_db, analytics_db, current.date() if hasattr(current, 'date') else current)
                processed += 1
            except Exception as e:
                failed += 1
                errors.append(f"{current.strftime('%Y-%m-%d')}: {str(e)}")
            current += timedelta(days=1)

    elif action_name == "cart-daily":
        from app.actions.cart_sync_action import sync_daily_carts
        current = start
        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            try:
                if not dryRun:
                    await sync_daily_carts(prod_db, analytics_db, date_str)
                processed += 1
            except Exception as e:
                failed += 1
                errors.append(f"{date_str}: {str(e)}")
            current += timedelta(days=1)

    elif action_name == "cart-monthly":
        from app.actions.cart_sync_action import sync_monthly_carts
        current = start.replace(day=1)
        while current <= end:
            try:
                if not dryRun:
                    await sync_monthly_carts(prod_db, analytics_db, current.year, current.month)
                processed += 1
            except Exception as e:
                failed += 1
                errors.append(f"{current.year}-{current.month}: {str(e)}")
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)

    elif action_name == "product-daily":
        from app.actions.product_sync_action import sync_daily_products
        current = start
        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            try:
                if not dryRun:
                    await sync_daily_products(prod_db, analytics_db, date_str)
                processed += 1
            except Exception as e:
                failed += 1
                errors.append(f"{date_str}: {str(e)}")
            current += timedelta(days=1)

    elif action_name == "product-monthly":
        from app.actions.product_sync_action import sync_monthly_products
        current = start.replace(day=1)
        while current <= end:
            try:
                if not dryRun:
                    await sync_monthly_products(prod_db, analytics_db, current.year, current.month)
                processed += 1
            except Exception as e:
                failed += 1
                errors.append(f"{current.year}-{current.month}: {str(e)}")
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)

    elif action_name == "utm-daily":
        from app.actions.utm_daily_action import fetch_and_store_utm_daily
        current = start
        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            try:
                if not dryRun:
                    await fetch_and_store_utm_daily(analytics_db, timezone, date_str)
                processed += 1
            except Exception as e:
                failed += 1
                errors.append(f"{date_str}: {str(e)}")
            current += timedelta(days=1)

    elif action_name == "utm-monthly":
        from app.actions.utm_monthly_action import fetch_and_store_utm_monthly
        current = start.replace(day=1)
        while current <= end:
            try:
                if not dryRun:
                    await fetch_and_store_utm_monthly(analytics_db, timezone, current.year, current.month)
                processed += 1
            except Exception as e:
                failed += 1
                errors.append(f"{current.year}-{current.month}: {str(e)}")
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)

    elif action_name == "failure-zones":
        from app.actions.failure_zones_action import process_failure_zones
        try:
            if not dryRun:
                await process_failure_zones(prod_db, analytics_db)
            processed += 1
        except Exception as e:
            failed += 1
            errors.append(f"failure-zones: {str(e)}")

    elif action_name == "return-rate":
        from app.actions.return_rate_action import process_return_rate
        try:
            if not dryRun:
                await process_return_rate(prod_db, analytics_db)
            processed += 1
        except Exception as e:
            failed += 1
            errors.append(f"return-rate: {str(e)}")

    elif action_name == "geography-revenue":
        from app.actions.geography_revenue_action import process_geography_revenue
        try:
            if not dryRun:
                await process_geography_revenue(prod_db, analytics_db)
            processed += 1
        except Exception as e:
            failed += 1
            errors.append(f"geography-revenue: {str(e)}")

    elif action_name == "courier-performance":
        from app.actions.courier_performance_action import process_courier_performance
        try:
            if not dryRun:
                await process_courier_performance(prod_db, analytics_db)
            processed += 1
        except Exception as e:
            failed += 1
            errors.append(f"courier-performance: {str(e)}")

    elif action_name == "rfm":
        from app.actions.rfm_action import process_rfm_segments
        try:
            if not dryRun:
                await process_rfm_segments(prod_db, analytics_db)
            processed += 1
        except Exception as e:
            failed += 1
            errors.append(f"rfm: {str(e)}")

    elif action_name == "ltv":
        from app.actions.ltv_action import process_ltv_by_segment
        try:
            if not dryRun:
                await process_ltv_by_segment(prod_db, analytics_db)
            processed += 1
        except Exception as e:
            failed += 1
            errors.append(f"ltv: {str(e)}")

    elif action_name == "rpr":
        from app.actions.rpr_action import process_rpr
        try:
            if not dryRun:
                await process_rpr(prod_db, analytics_db)
            processed += 1
        except Exception as e:
            failed += 1
            errors.append(f"rpr: {str(e)}")

    elif action_name == "funnel":
        from app.actions.funnel_action import process_funnel_metrics
        current = start
        while current <= end:
            try:
                if not dryRun:
                    await process_funnel_metrics(prod_db, analytics_db, current.date())
                processed += 1
            except Exception as e:
                failed += 1
                errors.append(f"{current.strftime('%Y-%m-%d')}: {str(e)}")
            current += timedelta(days=1)

    elif action_name == "repeat-cohorts":
        from app.actions.repeat_cohort_action import process_repeat_cohorts
        try:
            if not dryRun:
                await process_repeat_cohorts(prod_db, analytics_db)
            processed += 1
        except Exception as e:
            failed += 1
            errors.append(f"repeat-cohorts: {str(e)}")


    elif action_name == "lifetime-cohorts":
        from app.actions.lifetime_cohort_action import process_lifetime_cohorts
        try:
            if not dryRun:
                await process_lifetime_cohorts(prod_db, analytics_db)
            processed += 1
        except Exception as e:
            failed += 1
            errors.append(f"lifetime-cohorts: {str(e)}")

    elif action_name == "utm-attribution":
        from app.actions.utm_attribution_action import process_utm_attribution
        try:
            if not dryRun:
                await process_utm_attribution(prod_db, analytics_db)
            processed += 1
        except Exception as e:
            failed += 1
            errors.append(f"utm-attribution: {str(e)}")

    elif action_name == "flow-attribution":
        from app.actions.flow_attribution_action import process_flow_attribution
        try:
            if not dryRun:
                await process_flow_attribution(prod_db, analytics_db)
            processed += 1
        except Exception as e:
            failed += 1
            errors.append(f"flow-attribution: {str(e)}")

    elif action_name == "channel-roi":
        from app.actions.channel_roi_action import process_channel_roi
        try:
            if not dryRun:
                await process_channel_roi(analytics_db, start.date(), end.date())
            processed += 1
            logger.info("[BACKFILL] channel-roi: processed for date range")
        except Exception as e:
            failed += 1
            errors.append(f"channel-roi: {str(e)}")

    elif action_name == "reviews":
        from app.actions.reviews_sync_action import sync_reviews
        try:
            if not dryRun:
                await sync_reviews(prod_db, analytics_db)
            processed += 1
        except Exception as e:
            failed += 1
            errors.append(f"reviews: {str(e)}")

    elif action_name == "correlations":
        from app.actions.correlations_action import process_correlations
        try:
            if not dryRun:
                await process_correlations(prod_db, analytics_db)
            processed += 1
        except Exception as e:
            failed += 1
            errors.append(f"correlations: {str(e)}")

    elif action_name == "search-keywords":
        from app.actions.search_keywords_action import sync_search_keywords
        try:
            if not dryRun:
                await sync_search_keywords(prod_db, analytics_db)
            processed += 1
        except Exception as e:
            failed += 1
            errors.append(f"search-keywords: {str(e)}")

    elif action_name == "abandoned-products":
        from app.actions.cart_abandoned_action import sync_abandoned_products
        try:
            if not dryRun:
                await sync_abandoned_products(prod_db, analytics_db)
            processed += 1
        except Exception as e:
            failed += 1
            errors.append(f"abandoned-products: {str(e)}")

    elif action_name == "inventory":
        from app.actions.inventory_sync_action import sync_inventory_metrics
        try:
            if not dryRun:
                await sync_inventory_metrics(prod_db, analytics_db)
            processed += 1
        except Exception as e:
            failed += 1
            errors.append(f"inventory: {str(e)}")

    elif action_name == "ceo-dashboard":
        from app.actions.ceo_dashboard_action import process_ceo_dashboard_snapshot
        try:
            if not dryRun:
                await process_ceo_dashboard_snapshot(prod_db, analytics_db)
            processed += 1
        except Exception as e:
            failed += 1
            errors.append(f"ceo-dashboard: {str(e)}")

    elif action_name == "clv":
        from app.actions.clv_sync_action import sync_clv
        try:
            if not dryRun:
                await sync_clv(prod_db, analytics_db)
            processed += 1
            logger.info("[BACKFILL] clv: snapshot synced")
        except Exception as e:
            failed += 1
            errors.append(f"clv: {str(e)}")
            logger.error(f"[BACKFILL] clv failed: {e}")

    elif action_name == "signup-cohorts":
        from app.actions.signup_cohort_action import sync_signup_cohorts
        try:
            if not dryRun:
                await sync_signup_cohorts(prod_db, analytics_db)
            processed += 1
            logger.info("[BACKFILL] signup-cohorts: sync complete")
        except Exception as e:
            failed += 1
            errors.append(f"signup-cohorts: {str(e)}")
            logger.error(f"[BACKFILL] signup-cohorts failed: {e}")

    duration = int((datetime.now(dt_tz.utc) - start_time).total_seconds() * 1000)

    return success_response(
        data={
            "action": action_name,
            "startDate": startDate, "endDate": endDate,
            "processed": processed, "skipped": skipped,
            "failed": failed, "duration": duration,
            "dryRun": dryRun,
            "errors": errors if errors else None,
        },
        path=str(request.url.path),
    )


@router.post("/run-all")
async def run_all_backfill(
    request: Request,
    startDate: str = Query(...), endDate: str = Query(...),
    timezone: str = Query("Asia/Kolkata"), dryRun: bool = Query(False),
    analytics_db: AsyncSession = Depends(get_analytics_db),
    prod_db: AsyncSession = Depends(get_prod_db),
):
    results = []
    for action in AVAILABLE_ACTIONS:
        # Reuse the single-action endpoint logic
        result = await run_backfill(
            request, action, startDate, endDate, timezone, dryRun, analytics_db, prod_db,
        )
        results.append(result)

    return success_response(data=results, path=str(request.url.path))


@router.post("/daily-orders/cleanup")
async def cleanup_daily_orders(
    request: Request,
    startDate: str = Query(..., description="Start date (YYYY-MM-DD)"),
    endDate: str = Query(..., description="End date (YYYY-MM-DD)"),
    tz: str = Query("Asia/Kolkata"),
    dryRun: bool = Query(False),
    analytics_db: AsyncSession = Depends(get_analytics_db),
    prod_db: AsyncSession = Depends(get_prod_db),
):
    """Remove duplicate daily_orders rows and backfill missing dates."""
    start_time = datetime.now(dt_tz.utc)

    # --- Phase 1: Remove duplicates (keep newest per date) ---
    dup_result = await analytics_db.execute(
        text("""
            SELECT date, COUNT(*) as cnt
            FROM daily_orders
            GROUP BY date
            HAVING COUNT(*) > 1
            ORDER BY date
        """)
    )
    dup_rows = dup_result.mappings().all()
    duplicates_removed = 0

    for row in dup_rows:
        dup_date = row["date"]
        if not dryRun:
            # Keep the newest row (by createdAt), delete the rest
            await analytics_db.execute(
                text("""
                    DELETE FROM daily_orders
                    WHERE date = :d AND id NOT IN (
                        SELECT id FROM daily_orders
                        WHERE date = :d
                        ORDER BY "createdAt" DESC
                        LIMIT 1
                    )
                """),
                {"d": dup_date},
            )
        duplicates_removed += int(row["cnt"]) - 1
        logger.info(f"[CLEANUP] Removed {int(row['cnt']) - 1} duplicate(s) for {dup_date}")

    if not dryRun and dup_rows:
        await analytics_db.commit()

    # --- Phase 2: Find and backfill missing dates ---
    from app.utils.date import get_date
    from app.actions.daily_order_action import store_daily_orders

    start = datetime.fromisoformat(startDate)
    end = datetime.fromisoformat(endDate)
    # Cap end date to yesterday
    today = datetime.now(dt_tz.utc).date()
    if end.date() >= today:
        end = datetime(today.year, today.month, today.day) - timedelta(days=1)

    # Get all existing dates
    existing_result = await analytics_db.execute(
        select(DailyOrders.date).where(
            DailyOrders.date >= get_date(date=startDate, timezone=tz)["start_of_day"],
            DailyOrders.date <= get_date(date=end.strftime("%Y-%m-%d"), timezone=tz)["start_of_day"],
        )
    )
    existing_dates = {r[0].date() if hasattr(r[0], 'date') else r[0] for r in existing_result.all()}

    # Build list of missing dates
    missing_dates = []
    current = start
    while current <= end:
        date_str = current.strftime("%Y-%m-%d")
        date_range = get_date(date=date_str, timezone=tz)
        sod = date_range["start_of_day"]
        sod_date = sod.date() if hasattr(sod, 'date') else sod
        if sod_date not in existing_dates:
            missing_dates.append(date_str)
        current += timedelta(days=1)

    backfilled = 0
    backfill_errors = []

    if prod_db is None:
        return error_response(
            message="PROD_DB not configured — backfill requires production database",
            status_code=500, path=str(request.url.path),
        )

    for date_str in missing_dates:
        try:
            if not dryRun:
                await store_daily_orders(prod_db, analytics_db, tz, date_str)
            backfilled += 1
            logger.info(f"[CLEANUP] Backfilled missing date: {date_str}")
        except Exception as e:
            backfill_errors.append(f"{date_str}: {str(e)}")
            logger.error(f"[CLEANUP] Backfill failed for {date_str}: {e}")

    duration = int((datetime.now(dt_tz.utc) - start_time).total_seconds() * 1000)

    return success_response(
        data={
            "duplicates_found": len(dup_rows),
            "duplicates_removed": duplicates_removed,
            "missing_dates_found": len(missing_dates),
            "missing_dates_backfilled": backfilled,
            "backfill_errors": backfill_errors if backfill_errors else None,
            "date_range": {"start": startDate, "end": end.strftime("%Y-%m-%d")},
            "dryRun": dryRun,
            "duration_ms": duration,
        },
        path=str(request.url.path),
    )
