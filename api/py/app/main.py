"""FastAPI Application — Main entry point.
Replaces NestJS bootstrap.ts + app.module.ts.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import get_settings
from app.database import init_databases, close_databases
from app.redis_service import init_redis, close_redis
from app.cron.scheduler import start_scheduler, stop_scheduler

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("Starting Analytics API (FastAPI)")

    # Connect databases
    await init_databases()

    # Connect Redis
    try:
        await init_redis()
    except Exception as e:
        logger.warning(f"Redis not available: {e} — continuing without Redis")

    # Start cron scheduler (skipped in demo mode — there is no PROD_DB /
    # Umami / Meta to sync from; the demo DB is pre-seeded with fixture data)
    if get_settings().DEMO_MODE:
        logger.info("DEMO_MODE=true — cron scheduler not started")
    else:
        try:
            start_scheduler()
        except Exception as e:
            logger.warning(f"Scheduler start failed: {e}")

    logger.info("Analytics API started successfully")

    yield

    # Shutdown
    logger.info("Shutting down Analytics API")
    try:
        stop_scheduler()
    except Exception:
        pass
    await close_redis()
    await close_databases()
    logger.info("Analytics API shutdown complete")


# Create FastAPI app
app = FastAPI(
    title="Analytics API",
    description="Analytics API — converted from NestJS to FastAPI",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────────────────
# GLOBAL DATE CLAMP — never expose today's (partial / in-progress) data
# Clamps ?start_date, ?end_date and ?date query params to yesterday IST
# if a caller passes today or a future date. Applies to every router.
# ──────────────────────────────────────────────────────────────────────
@app.middleware("http")
async def clamp_dates_to_yesterday(request: Request, call_next):
    from urllib.parse import urlencode, parse_qsl
    from app.utils.date import clamp_date_str_to_yesterday

    qs = request.scope.get("query_string", b"").decode("latin-1")
    if qs and ("date=" in qs):
        params = parse_qsl(qs, keep_blank_values=True)
        new_params = []
        changed = False
        for k, v in params:
            if k in ("start_date", "end_date", "date") and v:
                clamped = clamp_date_str_to_yesterday(v)
                if clamped != v:
                    changed = True
                    v = clamped
            new_params.append((k, v))
        if changed:
            request.scope["query_string"] = urlencode(new_params).encode("latin-1")

    return await call_next(request)


# Global exception handler (replaces ResponseInterceptor error handling)
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "statusCode": 500,
            "data": None,
            "errors": None,
            "path": str(request.url.path),
            "message": str(exc),
        },
    )


# Register routers
from app.routers import orders, coupons, utm, admin, auth, backfill, carts, products, users, searches, active_users, reviews, inventory, correlations, rfm, ltv, rpr, funnel, repeat_cohort, lifetime_cohort, utm_attribution, flow_attribution, ceo_dashboard, rto, delivery_time, failure_zones, return_rate, geography_revenue, courier_performance, return_reason, channel_roi, campaign_cac, marketing_cost, creative_performance, audience_roas, influencer_attribution, meta_events, payment_failure, growth, metric_library, retention, marketing_platforms, clv, engagement, acquisition_retention, signup_cohorts

app.include_router(auth.router)
app.include_router(orders.router)
app.include_router(coupons.router)
app.include_router(utm.router)
app.include_router(admin.router)
app.include_router(backfill.router)
app.include_router(carts.router)
app.include_router(products.router)
app.include_router(users.router)
app.include_router(searches.router)
app.include_router(active_users.router)
app.include_router(reviews.router)
app.include_router(inventory.router)
app.include_router(correlations.router)
app.include_router(rfm.router)
app.include_router(ltv.router)
app.include_router(rpr.router)
app.include_router(funnel.router)
app.include_router(repeat_cohort.router)
app.include_router(lifetime_cohort.router)
app.include_router(utm_attribution.router)
app.include_router(flow_attribution.router)
app.include_router(ceo_dashboard.router)
app.include_router(rto.router)
app.include_router(delivery_time.router)
app.include_router(failure_zones.router)
app.include_router(return_rate.router)
app.include_router(geography_revenue.router)
app.include_router(courier_performance.router)
app.include_router(return_reason.router)
app.include_router(channel_roi.router)
app.include_router(campaign_cac.router)
app.include_router(marketing_cost.router)
app.include_router(creative_performance.router)
app.include_router(audience_roas.router)
app.include_router(influencer_attribution.router)
app.include_router(meta_events.router)
app.include_router(payment_failure.router)
app.include_router(growth.router)
app.include_router(metric_library.router)
app.include_router(retention.router)
app.include_router(marketing_platforms.router)
app.include_router(clv.router)
app.include_router(engagement.router)
app.include_router(acquisition_retention.router)
app.include_router(signup_cohorts.router)


# Health check
@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.PORT, reload=True)
