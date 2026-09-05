"""CEO Dashboard router — aggregated endpoint for executive overview.

Single GET endpoint that queries multiple analytics tables and returns
all metrics needed by the CEO Dashboard in one response.
Analytics DB only — no prod DB access.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, case, desc
from app.database import get_analytics_db
from app.schemas.responses import success_response, error_response
from app.dependencies import require_permission, require_admin
from app.models.analytics import (
    DailyOrders,
    CustomerFunnelMetrics,
    RepeatPurchaseRate,
    InventorySummary,
    InventoryStockOuts,
    InventoryAgingStock,
    InventoryDeadStock,
    UtmAttributionMetrics,
    DailyCartMetrics,
    CustomerRepeatCohort,
    CustomerRfmSegment,
    CustomerLtvBySegment,
    CeoDashboardSnapshot,
    DailyFulfillmentMetrics,
    CeoDashboardTargets,
    CampaignCacMetrics,
    MarketingCostPerOrder,
    CreativePerformanceMetrics,
    AudienceRoasMetrics,
    InfluencerAttributionMetrics,
    RtoMetrics,
    DeliveryTimeMetrics,
    CourierPerformanceMetrics,
    FailureZonesMetrics,
)
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ceo-dashboard",
    tags=["CEO Dashboard"],
    dependencies=[Depends(require_permission("ceo_dashboard"))],
)


def _safe_rate(numerator, denominator, decimals=2):
    """Compute percentage with rounding, returns 0.0 on divide-by-zero."""
    if not denominator:
        return 0.0
    return round((numerator / denominator) * 100, decimals)


def _pct_change(current, previous, decimals=1):
    """Calculate percentage change between current and previous values."""
    if not previous:
        return 0.0
    return round(((current - previous) / previous) * 100, decimals)


async def _get_latest_date(db: AsyncSession, model, date_col):
    """Get the latest date available in a table — used for adaptive date windowing.

    Floored at yesterday IST so today's (partial) data is never surfaced even
    if a cron has begun writing it.
    """
    from app.utils.date import yesterday_date as _yesterday_ist

    stmt = select(func.max(date_col))
    result = await db.execute(stmt)
    max_date = result.scalar()
    cap = _yesterday_ist()
    if max_date is None:
        return cap
    # Handle both datetime and date types
    if isinstance(max_date, datetime):
        max_date = max_date.date()
    return min(max_date, cap)


@router.get("")
async def get_ceo_dashboard(
    request: Request,
    db: AsyncSession = Depends(get_analytics_db),
    start_date: str | None = Query(None, description="Start date YYYY-MM-DD"),
    end_date: str | None = Query(None, description="End date YYYY-MM-DD"),
):
    """Aggregated CEO Dashboard data — single call, multiple analytics tables."""
    try:
        # ═══════════════════════════════════════════════════════════
        # DATE RANGE HANDLING
        # If start_date/end_date are provided, use end_date as anchor.
        # Otherwise fall back to adaptive latest-date approach.
        # ═══════════════════════════════════════════════════════════
        user_end_date = None
        user_start_date = None
        if end_date:
            try:
                user_end_date = datetime.strptime(end_date, "%Y-%m-%d").date()
            except ValueError:
                pass
        if start_date:
            try:
                user_start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
            except ValueError:
                pass

        # ═══════════════════════════════════════════════════════════
        # ADAPTIVE DATE WINDOWS
        # If user provides a date range, use the FULL range for current
        # metrics and a same-length previous window for comparison.
        # Otherwise default to a 7-day window from latest available date.
        # ═══════════════════════════════════════════════════════════
        orders_latest = await _get_latest_date(db, DailyOrders, DailyOrders.date)
        funnel_latest = await _get_latest_date(db, CustomerFunnelMetrics, CustomerFunnelMetrics.date)
        utm_latest = await _get_latest_date(db, UtmAttributionMetrics, UtmAttributionMetrics.date)
        cart_latest = await _get_latest_date(db, DailyCartMetrics, DailyCartMetrics.date)

        if user_start_date and user_end_date:
            # User provided date range — use it directly
            range_days = (user_end_date - user_start_date).days or 7

            orders_end = min(orders_latest, user_end_date)
            orders_start = min(user_start_date, orders_end)
            orders_prev_end = orders_start - timedelta(days=1)
            orders_prev_start = orders_prev_end - timedelta(days=range_days)

            funnel_end = min(funnel_latest, user_end_date)
            funnel_start = min(user_start_date, funnel_end)
            funnel_prev_end = funnel_start - timedelta(days=1)
            funnel_prev_start = funnel_prev_end - timedelta(days=range_days)

            utm_end = min(utm_latest, user_end_date)
            utm_start = min(user_start_date, utm_end)
            utm_prev_end = utm_start - timedelta(days=1)
            utm_prev_start = utm_prev_end - timedelta(days=range_days)

            cart_end = min(cart_latest, user_end_date)
            cart_start = min(user_start_date, cart_end)
            cart_prev_end = cart_start - timedelta(days=1)
            cart_prev_start = cart_prev_end - timedelta(days=range_days)

            anchor_date = user_end_date
        else:
            # No date range — use latest 7-day window per table
            orders_end = orders_latest
            orders_start = orders_end - timedelta(days=6)
            orders_prev_end = orders_start - timedelta(days=1)
            orders_prev_start = orders_prev_end - timedelta(days=6)

            funnel_end = funnel_latest
            funnel_start = funnel_end - timedelta(days=6)
            funnel_prev_end = funnel_start - timedelta(days=1)
            funnel_prev_start = funnel_prev_end - timedelta(days=6)

            utm_end = utm_latest
            utm_start = utm_end - timedelta(days=6)
            utm_prev_end = utm_start - timedelta(days=1)
            utm_prev_start = utm_prev_end - timedelta(days=6)

            cart_end = cart_latest
            cart_start = cart_end - timedelta(days=6)
            cart_prev_end = cart_start - timedelta(days=1)
            cart_prev_start = cart_prev_end - timedelta(days=6)

            anchor_date = orders_latest

        # ═══════════════════════════════════════════════════════════
        # 1. ORDERS — GMV, AOV, discount dependency (current + prev)
        # ═══════════════════════════════════════════════════════════
        orders_current = await _get_orders_summary(db, orders_start, orders_end)
        orders_prev = await _get_orders_summary(db, orders_prev_start, orders_prev_end)

        gmv = orders_current["total_revenue"]
        aov = orders_current["aov"]
        total_orders = orders_current["total_orders"]
        discount_dependency = orders_current["discount_pct"]

        gmv_prev = orders_prev["total_revenue"]
        aov_prev = orders_prev["aov"]
        total_orders_prev = orders_prev["total_orders"]
        discount_dependency_prev = orders_prev["discount_pct"]

        # ═══════════════════════════════════════════════════════════
        # 2. FUNNEL — Conversion rate + add-to-cart rate
        # ═══════════════════════════════════════════════════════════
        funnel_current = await _get_funnel_summary(db, funnel_start, funnel_end)
        funnel_prev = await _get_funnel_summary(db, funnel_prev_start, funnel_prev_end)

        conversion_rate = funnel_current["overall_conversion_rate"]
        add_to_cart_rate = funnel_current["click_rate"]  # click_rate = add-to-cart / open
        conversion_rate_prev = funnel_prev["overall_conversion_rate"]
        add_to_cart_rate_prev = funnel_prev["click_rate"]

        # ═══════════════════════════════════════════════════════════
        # 3. RPR — rolling 60-day repeat rate, a point-in-time snapshot.
        # Anchor to the SELECTED PERIOD END (latest snapshot on/before end_date),
        # not the range — RPR snapshots are sparse, so a BETWEEN filter would
        # return nothing for most windows. Fall back to the earliest snapshot.
        # ═══════════════════════════════════════════════════════════
        rpr_stmt = select(RepeatPurchaseRate)
        if user_end_date:
            rpr_stmt = rpr_stmt.where(func.date(RepeatPurchaseRate.createdAt) <= user_end_date)
        rpr_stmt = rpr_stmt.order_by(desc(RepeatPurchaseRate.createdAt)).limit(1)
        rpr_result = await db.execute(rpr_stmt)
        rpr_record = rpr_result.scalars().first()
        if not rpr_record:
            fb = await db.execute(
                select(RepeatPurchaseRate).order_by(RepeatPurchaseRate.createdAt.asc()).limit(1)
            )
            rpr_record = fb.scalars().first()
        rpr_percentage = rpr_record.rpr_percentage if rpr_record else 0.0

        # ═══════════════════════════════════════════════════════════
        # 4. INVENTORY — Latest snapshot (point-in-time, not date-range dependent)
        # ═══════════════════════════════════════════════════════════
        inv_stmt = (
            select(InventorySummary)
            .order_by(desc(InventorySummary.date))
            .limit(1)
        )
        inv_result = await db.execute(inv_stmt)
        inv_record = inv_result.scalars().first()

        total_tracked = inv_record.total_tracked_variants if inv_record else 0
        stock_outs = inv_record.total_stock_outs if inv_record else 0
        dead_stock_variants = inv_record.dead_stock_variants if inv_record else 0
        dead_stock_value = inv_record.dead_stock_value if inv_record else 0.0
        total_locked_capital = inv_record.total_locked_capital if inv_record else 0.0

        # Dead inventory percentage — fixed: no double multiplication
        dead_inventory_pct = round((dead_stock_variants / total_tracked) * 100, 1) if total_tracked else 0.0

        # Aging stock count (>120 days)
        aging_count_result = await db.execute(
            select(func.count(InventoryAgingStock.id))
        )
        aging_count = aging_count_result.scalar() or 0
        aging_pct = round((aging_count / total_tracked) * 100, 1) if total_tracked else 0.0

        # ═══════════════════════════════════════════════════════════
        # 5. DEMAND ENGINE — UTM attribution for sessions/users
        # ═══════════════════════════════════════════════════════════
        demand_current = await _get_demand_summary(db, utm_start, utm_end)
        demand_prev = await _get_demand_summary(db, utm_prev_start, utm_prev_end)

        # ═══════════════════════════════════════════════════════════
        # 6. CART — Checkout completion rate
        # ═══════════════════════════════════════════════════════════
        cart_current = await _get_cart_summary(db, cart_start, cart_end)
        cart_prev = await _get_cart_summary(db, cart_prev_start, cart_prev_end)

        checkout_completion = cart_current["checkout_completion"]
        checkout_completion_prev = cart_prev["checkout_completion"]

        # ═══════════════════════════════════════════════════════════
        # 7. RETENTION — Cohort rebuy (latest month-1 average)
        # ═══════════════════════════════════════════════════════════
        cohort_stmt = (
            select(func.avg(CustomerRepeatCohort.retention_rate))
            .where(CustomerRepeatCohort.cohort_index == 1)
        )
        cohort_result = await db.execute(cohort_stmt)
        cohort_rebuy = round(cohort_result.scalar() or 0.0, 1)

        # Previous period: structural metric, use same value
        cohort_rebuy_prev = cohort_rebuy

        # ═══════════════════════════════════════════════════════════
        # 8. FULFILLMENT METRICS — dynamic from DailyFulfillmentMetrics
        # ═══════════════════════════════════════════════════════════
        f_current = await _get_fulfillment_summary(db, orders_start, orders_end)
        f_prev = await _get_fulfillment_summary(db, orders_prev_start, orders_prev_end)
        
        c_del = f_current["delivered"]
        avg_delivery = f_current["delivery_days"] / c_del if c_del > 0 else 0
        sla_pct = (f_current["within_sla"] / c_del * 100) if c_del > 0 else 0
        rto_rate = (f_current["rto"] / c_del * 100) if c_del > 0 else 0
        
        p_del = f_prev["delivered"]
        avg_delivery_prev = f_prev["delivery_days"] / p_del if p_del > 0 else 0
        sla_pct_prev = (f_prev["within_sla"] / p_del * 100) if p_del > 0 else 0
        rto_rate_prev = (f_prev["rto"] / p_del * 100) if p_del > 0 else 0


        # ═══════════════════════════════════════════════════════════
        # 9. CEO DASHBOARD SNAPSHOTS — (for other snapshot metrics)
        # Filter by date range if provided, else use latest 2
        # ═══════════════════════════════════════════════════════════
        if user_end_date:
            # Get snapshot closest to (but <= ) user_end_date
            snap_current_stmt = (
                select(CeoDashboardSnapshot)
                .where(CeoDashboardSnapshot.snapshot_date <= user_end_date)
                .order_by(desc(CeoDashboardSnapshot.snapshot_date))
                .limit(1)
            )
            # Get previous snapshot (before the current one, or before start_date)
            snap_prev_boundary = user_start_date or (user_end_date - timedelta(days=7))
            snap_prev_stmt = (
                select(CeoDashboardSnapshot)
                .where(CeoDashboardSnapshot.snapshot_date <= snap_prev_boundary)
                .order_by(desc(CeoDashboardSnapshot.snapshot_date))
                .limit(1)
            )
            snap_c_result = await db.execute(snap_current_stmt)
            snap_p_result = await db.execute(snap_prev_stmt)
            snap_current = snap_c_result.scalars().first()
            snap_prev = snap_p_result.scalars().first()
        else:
            snapshot_stmt = (
                select(CeoDashboardSnapshot)
                .order_by(desc(CeoDashboardSnapshot.snapshot_date))
                .limit(2)
            )
            snapshot_result = await db.execute(snapshot_stmt)
            snapshots = snapshot_result.scalars().all()
            snap_current = snapshots[0] if len(snapshots) > 0 else None
            snap_prev = snapshots[1] if len(snapshots) > 1 else None


        # Extract snapshot values (with fallback to static if no snapshots yet)
        s_avg_delivery = snap_current.avg_delivery_days if snap_current else 3.3
        s_avg_delivery_prev = snap_prev.avg_delivery_days if snap_prev else 3.6
        s_sla = snap_current.sla_pct if snap_current else 93.0
        s_sla_prev = snap_prev.sla_pct if snap_prev else 90.0
        s_hero_sku = snap_current.hero_sku_sellthrough if snap_current else 82.0
        s_hero_sku_prev = snap_prev.hero_sku_sellthrough if snap_prev else 79.0
        s_inv_coverage = snap_current.inventory_coverage_days if snap_current else 48.0
        s_inv_coverage_prev = snap_prev.inventory_coverage_days if snap_prev else 52.0
        s_email_share = snap_current.email_revenue_share if snap_current else 14.0
        s_email_share_prev = snap_prev.email_revenue_share if snap_prev else 13.0
        s_rto_rate = snap_current.rto_rate if snap_current else 3.4
        s_rto_rate_prev = snap_prev.rto_rate if snap_prev else 3.0
        has_snapshots = snap_current is not None

        # ═══════════════════════════════════════════════════════════
        # BUILD RESPONSE & TARGETS
        # ═══════════════════════════════════════════════════════════
        week_number = anchor_date.isocalendar()[1]

        # Fetch targets from DB instead of hardcoding
        targets_result = await db.execute(select(CeoDashboardTargets))
        targets_db = {t.metric_key: t.target_value for t in targets_result.scalars().all()}
        
        # Default fallbacks representing original hardcodes
        target_gmv = targets_db.get("gmv", 20000000)
        target_cac = targets_db.get("cac", 450)
        target_conversion = targets_db.get("conversion_rate", 2.1)
        target_aov = targets_db.get("aov", 1600)
        target_rpr = targets_db.get("rpr_60d", 35.0)
        target_dead_inv = targets_db.get("dead_inventory", 10.0)
        target_marketing_salary = targets_db.get("marketing_salary", 0.0)

        # Stored GMV target is a 30-day baseline; scale linearly to the user-selected
        # range so a 90-day window compares against 3× the monthly target. Rate metrics
        # (CAC, conversion %, AOV, RPR %, dead inventory %) are scale-invariant.
        # Use the user's selected range (not data-capped range) for target scaling.
        if user_start_date and user_end_date:
            range_days = max((user_end_date - user_start_date).days + 1, 1)
        else:
            range_days = max((orders_end - orders_start).days + 1, 1)
        BASELINE_DAYS = 30
        months = max(round(range_days / BASELINE_DAYS), 1)
        scaled_target_gmv = round(target_gmv * months, 2)

        # Period display based on latest available data
        current_week_start = orders_start
        current_week_end = orders_end

        data = {
            "week_number": week_number,
            "period": {
                "current_start": current_week_start.isoformat(),
                "current_end": current_week_end.isoformat(),
                "prev_start": orders_prev_start.isoformat(),
                "prev_end": orders_prev_end.isoformat(),
            },

            # ── Executive Summary KPIs ──
            "executive_summary": {
                "gmv": {
                    "current": gmv,
                    "target": scaled_target_gmv,
                    "target_baseline": target_gmv,
                    "target_baseline_days": BASELINE_DAYS,
                    "range_days": range_days,
                    "status": _kpi_status(gmv, scaled_target_gmv, lower_warn=0.9),
                },
                "cac": await _get_live_cac(db, orders_start, orders_end, target_cac, target_marketing_salary),
                "conversion_rate": {
                    "current": conversion_rate,
                    "target": target_conversion,
                    "status": _kpi_status_higher_better(conversion_rate, target_conversion),
                },
                "aov": {
                    "current": aov,
                    "target": target_aov,
                    "status": _kpi_status_higher_better(aov, target_aov),
                },
                "rpr_60d": {
                    "current": rpr_percentage,
                    "target": target_rpr,
                    "status": _kpi_status_higher_better(rpr_percentage, target_rpr, warn_ratio=0.95),
                },
                "dead_inventory": {
                    "current": round(dead_inventory_pct, 1),
                    "target": target_dead_inv,
                    "status": _kpi_status_lower_better(dead_inventory_pct, target_dead_inv),
                },
                "marketing_salary": {
                    "target": target_marketing_salary
                }
            },

            # ── Demand Engine ──
            "demand": {
                "sessions": {
                    "current": demand_current["sessions"],
                    "previous": demand_prev["sessions"],
                    "delta_pct": _pct_change(demand_current["sessions"], demand_prev["sessions"]),
                },
                "new_users": {
                    "current": demand_current["new_users"],
                    "previous": demand_prev["new_users"],
                    "delta_pct": _pct_change(demand_current["new_users"], demand_prev["new_users"]),
                },
                "paid_vs_organic": {
                    "paid_pct": demand_current["paid_pct"],
                    "organic_pct": demand_current["organic_pct"],
                    "prev_paid_pct": demand_prev["paid_pct"],
                    "prev_organic_pct": demand_prev["organic_pct"],
                },
                "influencer_traffic": {
                    "current": demand_current["influencer_sessions"],
                    "previous": demand_prev["influencer_sessions"],
                    "delta_pct": _pct_change(
                        demand_current["influencer_sessions"],
                        demand_prev["influencer_sessions"]
                    ),
                },
            },

            # ── Conversion Engine ──
            "conversion": {
                "add_to_cart_rate": {
                    "current": add_to_cart_rate,
                    "previous": add_to_cart_rate_prev,
                    "delta": round(add_to_cart_rate - add_to_cart_rate_prev, 1),
                },
                "checkout_completion": {
                    "current": checkout_completion,
                    "previous": checkout_completion_prev,
                    "delta": round(checkout_completion - checkout_completion_prev, 1),
                },
                "hero_sku_sellthrough": {
                    "current": s_hero_sku,
                    "previous": s_hero_sku_prev,
                    "delta": round(s_hero_sku - s_hero_sku_prev, 1),
                    "static": not has_snapshots,
                },
                "discount_dependency": {
                    "current": discount_dependency,
                    "previous": discount_dependency_prev,
                    "delta": round(discount_dependency - discount_dependency_prev, 1),
                },
            },

            # ── Inventory & Cash Engine ──
            "inventory": {
                "stock_out_skus": {
                    "current": stock_outs,
                    "previous": None,  # No historical inventory snapshots
                },
                "inventory_coverage_days": {
                    "current": s_inv_coverage,
                    "previous": s_inv_coverage_prev,
                    "delta": round(s_inv_coverage - s_inv_coverage_prev, 1),
                    "static": not has_snapshots,
                },
                "aging_stock_pct": {
                    "current": round(aging_pct, 1),
                    "previous": None,
                },
                "gross_margin": {
                    "current": 39,  # Static — needs COGS data
                    "previous": 37,
                    "delta": 2,
                    "static": True,
                },
            },

            # ── Fulfillment (from DailyFulfillmentMetrics) ──
            "fulfillment": {
                "avg_delivery_days": {
                    "current": round(avg_delivery, 1),
                    "previous": round(avg_delivery_prev, 1),
                    "delta": round(avg_delivery - avg_delivery_prev, 1),
                },
                "sla_pct": {
                    "current": round(sla_pct, 1),
                    "previous": round(sla_pct_prev, 1),
                    "delta": round(sla_pct - sla_pct_prev, 1),
                },
                "rto_rate": {
                    "current": round(rto_rate, 1),
                    "previous": round(rto_rate_prev, 1),
                    "delta": round(rto_rate - rto_rate_prev, 1),
                },
                "support_tickets_per_1k": {"current": 0, "previous": 0, "delta": 0, "static": True},
            },

            # ── Retention ──
            "retention": await _get_retention_summary(db, orders_start, orders_end),

            # ── Issues (Removed) ──
            "issues": [],

            # ── Top Creative (Real ROAS) ──
            "top_creative": await _get_top_creative(db, orders_start, orders_end),

            # ── Best Audience (Adset ROAS) ──
            "best_audience": await _get_best_audience(db, orders_start, orders_end),

            # ── Top Influencer ──
            "top_influencer": await _get_top_influencer(db, orders_start, orders_end),

            # ── Contribution Margin ──
            "contribution_margin": await _get_contribution_margin(db, orders_start, orders_end),

            # ── North Star Trend (GMV + orders 30-day daily trend) ──
            "north_star_trend": await _get_north_star_trend(db, orders_start, orders_end),

            # ── Channel Drilldown (revenue per UTM source) ──
            "channel_drilldown": await _get_channel_drilldown(db, orders_start, orders_end),

            # ── Metric Library ──
            "metric_library": await _get_metric_library(db, orders_start, orders_end),

            # ── Operations Overview ──
            "operations": await _get_operations_overview(db, orders_start, orders_end),
        }

        return success_response(data=data, path=str(request.url.path))

    except Exception as e:
        logger.error(f"CEO Dashboard aggregation failed: {e}", exc_info=True)
        return error_response(
            message=f"Failed to load CEO dashboard: {str(e)}",
            path=str(request.url.path),
        )


# ── Helper queries ─────────────────────────────────────────────────

async def _get_orders_summary(db: AsyncSession, start: date, end: date) -> dict:
    """Aggregate daily_orders for a date range."""
    start_dt = datetime.combine(start, datetime.min.time())
    end_dt = datetime.combine(end, datetime.max.time())

    stmt = select(
        func.coalesce(func.sum(DailyOrders.total), 0).label("total_revenue"),
        func.coalesce(func.sum(DailyOrders.dailyOrdersCount), 0).label("total_orders"),
        func.coalesce(func.sum(DailyOrders.orders_with_discount_count), 0).label("discount_orders"),
    ).where(
        DailyOrders.date >= start_dt,
        DailyOrders.date <= end_dt,
    )

    result = await db.execute(stmt)
    row = result.one()

    total_revenue = int(row[0])
    total_orders = int(row[1])
    discount_orders = int(row[2])

    return {
        "total_revenue": total_revenue,
        "total_orders": total_orders,
        "aov": round(total_revenue / total_orders) if total_orders else 0,
        "discount_pct": round((discount_orders / total_orders) * 100) if total_orders else 0,
    }


async def _get_funnel_summary(db: AsyncSession, start: date, end: date) -> dict:
    """Aggregate customer_funnel_metrics for a date range."""
    stmt = select(
        func.coalesce(func.sum(CustomerFunnelMetrics.total_users), 0),
        func.coalesce(func.sum(CustomerFunnelMetrics.open_users), 0),
        func.coalesce(func.sum(CustomerFunnelMetrics.click_users), 0),
        func.coalesce(func.sum(CustomerFunnelMetrics.converted_users), 0),
    ).where(
        CustomerFunnelMetrics.date >= start,
        CustomerFunnelMetrics.date <= end,
    )

    result = await db.execute(stmt)
    row = result.one()

    total = int(row[0])
    open_users = int(row[1])
    click_users = int(row[2])
    converted = int(row[3])

    return {
        "total_users": total,
        "open_users": open_users,
        "click_users": click_users,
        "converted_users": converted,
        "open_rate": _safe_rate(open_users, total),
        "click_rate": _safe_rate(click_users, open_users),
        "conversion_rate": _safe_rate(converted, click_users),
        "overall_conversion_rate": _safe_rate(converted, total),
    }

async def _get_fulfillment_summary(db: AsyncSession, start: date, end: date) -> dict:
    """Aggregate daily_fulfillment_metrics dynamically for a date range."""
    stmt = select(
        func.coalesce(func.sum(DailyFulfillmentMetrics.total_delivered_orders), 0),
        func.coalesce(func.sum(DailyFulfillmentMetrics.total_delivery_days_sum), 0.0),
        func.coalesce(func.sum(DailyFulfillmentMetrics.orders_within_sla_count), 0),
        func.coalesce(func.sum(DailyFulfillmentMetrics.rto_orders_count), 0),
    ).where(
        DailyFulfillmentMetrics.date >= start,
        DailyFulfillmentMetrics.date <= end
    )
    result = await db.execute(stmt)
    row = result.one()
    
    return {
        "delivered": int(row[0]),
        "delivery_days": float(row[1]),
        "within_sla": int(row[2]),
        "rto": int(row[3]),
    }


async def _get_demand_summary(db: AsyncSession, start: date, end: date) -> dict:
    """Aggregate utm_attribution_metrics for session/user counts."""
    stmt = select(
        func.coalesce(func.sum(UtmAttributionMetrics.sessions), 0),
        func.coalesce(func.sum(UtmAttributionMetrics.users), 0),
        func.coalesce(func.sum(UtmAttributionMetrics.orders), 0),
        func.coalesce(func.sum(UtmAttributionMetrics.revenue), 0),
    ).where(
        UtmAttributionMetrics.date >= start,
        UtmAttributionMetrics.date <= end,
    )
    result = await db.execute(stmt)
    row = result.one()
    total_sessions = int(row[0])
    total_users = int(row[1])

    # Paid vs organic breakdown — match actual UTM medium values in DB
    paid_stmt = select(
        func.coalesce(func.sum(UtmAttributionMetrics.sessions), 0),
    ).where(
        UtmAttributionMetrics.date >= start,
        UtmAttributionMetrics.date <= end,
        func.lower(UtmAttributionMetrics.utm_medium).in_([
            'cpc', 'paid', 'paid_social', 'display',
            'paidads', 'fbads', 'googleads', 'igads',
            'ad', 'ads', 'sponsored',
        ]),
    )
    paid_result = await db.execute(paid_stmt)
    paid_sessions = int(paid_result.scalar() or 0)
    organic_sessions = max(total_sessions - paid_sessions, 0)

    paid_pct = round((paid_sessions / total_sessions) * 100) if total_sessions else 0
    organic_pct = 100 - paid_pct

    # Influencer traffic — match actual UTM medium values
    influencer_stmt = select(
        func.coalesce(func.sum(UtmAttributionMetrics.sessions), 0),
    ).where(
        UtmAttributionMetrics.date >= start,
        UtmAttributionMetrics.date <= end,
        func.lower(UtmAttributionMetrics.utm_medium).in_([
            'influencer', 'ugc', 'affiliate', 'creator', 'collab',
        ]),
    )
    influencer_result = await db.execute(influencer_stmt)
    influencer_sessions = int(influencer_result.scalar() or 0)

    return {
        "sessions": total_sessions,
        "new_users": total_users,
        "paid_pct": paid_pct,
        "organic_pct": organic_pct,
        "influencer_sessions": influencer_sessions,
    }


async def _get_cart_summary(db: AsyncSession, start: date, end: date) -> dict:
    """Aggregate cart metrics for checkout completion rate."""
    start_dt = datetime.combine(start, datetime.min.time())
    end_dt = datetime.combine(end, datetime.max.time())

    stmt = select(
        func.coalesce(func.sum(DailyCartMetrics.total_carts), 0),
        func.coalesce(func.sum(DailyCartMetrics.completed_carts), 0),
    ).where(
        DailyCartMetrics.date >= start_dt,
        DailyCartMetrics.date <= end_dt,
    )

    result = await db.execute(stmt)
    row = result.one()
    total = int(row[0])
    completed = int(row[1])

    return {
        "checkout_completion": round((completed / total) * 100) if total else 0,
    }


async def _get_live_cac(db: AsyncSession, start: date, end: date, target: float, marketing_salary_per_day: float) -> dict:
    """Compute weighted-average CAC from campaign_cac_metrics for the date range."""
    stmt = select(
        func.coalesce(func.sum(CampaignCacMetrics.total_spend), 0),
        func.coalesce(func.sum(CampaignCacMetrics.new_customers), 0),
    ).where(
        CampaignCacMetrics.date >= start,
        CampaignCacMetrics.date <= end,
    )
    result = await db.execute(stmt)
    row = result.one()

    total_spend = float(row[0])
    total_new = int(row[1])
    # Add the cost of marketing resource
    days_in_range = (end - start).days + 1
    if days_in_range < 1:
        days_in_range = 1
    total_spend += (marketing_salary_per_day * days_in_range)

    if total_new > 0 and total_spend > 0:
        cac = round(total_spend / total_new, 2)
        # For CAC, lower is better
        if cac <= target:
            status = "on_track"
        elif cac <= target * 1.2:
            status = "watch"
        else:
            status = "needs_attention"
        return {
            "current": cac,
            "target": target,
            "status": status,
            "static": False,
        }

    # Fallback — no campaign data yet
    return {
        "current": 0,
        "target": target,
        "status": "on_track",
        "static": True,
    }


# ── KPI Status helpers ───────────────────────────────────────────

def _kpi_status(value, target, lower_warn=0.9, lower_bad=0.75):
    """Status for metric where hitting target = good (e.g., GMV)."""
    if value >= target:
        return "on_track"
    elif value >= target * lower_warn:
        return "watch"
    else:
        return "needs_attention"


def _kpi_status_higher_better(value, target, warn_ratio=0.9):
    """Status for metrics where higher is better (conversion, RPR, AOV)."""
    if value >= target:
        return "on_track"
    elif value >= target * warn_ratio:
        return "watch"
    else:
        return "needs_attention"


def _kpi_status_lower_better(value, target, warn_ratio=1.1):
    """Status for metrics where lower is better (dead inventory)."""
    if value <= target:
        return "on_track"
    elif value <= target * warn_ratio:
        return "watch"
    else:
        return "needs_attention"

# ── Top Creative helper ────────────────────────────────────────

async def _get_top_creative(db: AsyncSession, start: date, end: date) -> dict:
    """Get the top creative by real ROAS from creative_performance_metrics."""
    try:
        stmt = select(
            CreativePerformanceMetrics.creative_name,
            func.coalesce(func.sum(CreativePerformanceMetrics.revenue_actual), 0).label("revenue"),
            func.coalesce(func.sum(CreativePerformanceMetrics.spend), 0).label("spend"),
        ).where(
            CreativePerformanceMetrics.date >= start,
            CreativePerformanceMetrics.date <= end,
            CreativePerformanceMetrics.spend > 0,
        ).group_by(
            CreativePerformanceMetrics.creative_name,
        )

        result = await db.execute(stmt)
        rows = result.all()

        if not rows:
            return {"name": "N/A", "roas": 0.0, "revenue": 0, "spend": 0, "static": True}

        best = None
        best_roas = -1
        for r in rows:
            rev = float(r.revenue)
            sp = float(r.spend)
            roas = rev / sp if sp > 0 else 0
            if roas > best_roas:
                best_roas = roas
                best = {"name": r.creative_name, "roas": round(roas, 2), "revenue": round(rev, 2), "spend": round(sp, 2)}

        return best if best else {"name": "N/A", "roas": 0.0, "revenue": 0, "spend": 0, "static": True}
    except Exception as e:
        logger.warning(f"[CEO_DASH] Top creative lookup failed: {e}")
        return {"name": "N/A", "roas": 0.0, "revenue": 0, "spend": 0, "static": True}


# ── Modifying targets ──────────────────────────────────────────

class TargetUpdatePayload(BaseModel):
    gmv: float
    cac: float
    conversion_rate: float
    aov: float
    rpr_60d: float
    dead_inventory: float
    marketing_salary: float

@router.post("/targets", dependencies=[Depends(require_admin)])
async def update_targets(
    payload: TargetUpdatePayload,
    request: Request,
    db: AsyncSession = Depends(get_analytics_db)
):
    """Update global CEO dashboard targets."""
    try:
        updated_keys = {
            "gmv": payload.gmv,
            "cac": payload.cac,
            "conversion_rate": payload.conversion_rate,
            "aov": payload.aov,
            "rpr_60d": payload.rpr_60d,
            "dead_inventory": payload.dead_inventory,
            "marketing_salary": payload.marketing_salary,
        }
        
        logger.info(f"[TARGETS] Received payload: {updated_keys}")
        
        # Load all existing
        result = await db.execute(select(CeoDashboardTargets))
        existing_targets = {t.metric_key: t for t in result.scalars().all()}
        
        logger.info(f"[TARGETS] Existing keys in DB: {list(existing_targets.keys())}")
        
        for k, v in updated_keys.items():
            if k in existing_targets:
                existing_targets[k].target_value = v
                logger.info(f"[TARGETS] Updated existing: {k} = {v}")
            else:
                new_targ = CeoDashboardTargets(metric_key=k, target_value=v)
                db.add(new_targ)
                logger.info(f"[TARGETS] Inserting new: {k} = {v}")
        
        await db.flush()
        await db.commit()
        logger.info("[TARGETS] Commit successful")
        return success_response(data={"message": "Targets updated"}, path=str(request.url.path))
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to update targets: {e}", exc_info=True)
        return error_response(message="Failed to update targets.", path=str(request.url.path))


async def _get_best_audience(db: AsyncSession, start: date, end: date) -> dict:
    """Return the best-performing audience (adset) by ROAS in the given date range."""
    try:
        stmt = select(
            AudienceRoasMetrics.adset_name,
            func.sum(AudienceRoasMetrics.spend).label("spend"),
            func.sum(AudienceRoasMetrics.revenue).label("revenue"),
        ).where(
            AudienceRoasMetrics.date >= start,
            AudienceRoasMetrics.date <= end,
        ).group_by(AudienceRoasMetrics.adset_name).having(
            func.sum(AudienceRoasMetrics.spend) > 0
        )
        result = await db.execute(stmt)
        rows = result.all()
        if not rows:
            return {"name": "N/A", "roas": 0.0, "spend": 0.0, "revenue": 0.0}
        best = max(rows, key=lambda r: float(r.revenue) / float(r.spend) if float(r.spend) > 0 else 0)
        spend_val = float(best.spend)
        rev_val = float(best.revenue)
        roas_val = round(rev_val / spend_val, 2) if spend_val > 0 else 0.0
        return {"name": best.adset_name, "roas": roas_val, "spend": round(spend_val, 2), "revenue": round(rev_val, 2)}
    except Exception as e:
        logger.error(f"Failed to get best audience: {e}")
        return {"name": "N/A", "roas": 0.0, "spend": 0.0, "revenue": 0.0}


async def _get_top_influencer(db: AsyncSession, start: date, end: date) -> dict:
    """Return the top influencer by revenue in the given date range."""
    try:
        stmt = select(
            InfluencerAttributionMetrics.influencer_name,
            func.sum(InfluencerAttributionMetrics.total_revenue).label("revenue"),
            func.sum(InfluencerAttributionMetrics.total_orders).label("orders"),
        ).where(
            InfluencerAttributionMetrics.date >= start,
            InfluencerAttributionMetrics.date <= end,
        ).group_by(InfluencerAttributionMetrics.influencer_name).order_by(
            func.sum(InfluencerAttributionMetrics.total_revenue).desc()
        ).limit(1)
        result = await db.execute(stmt)
        row = result.first()
        if not row:
            return {"name": "N/A", "revenue": 0.0, "orders": 0}
        return {
            "name": row.influencer_name,
            "revenue": round(float(row.revenue), 2),
            "orders": int(row.orders),
        }
    except Exception as e:
        logger.error(f"Failed to get top influencer: {e}")
        return {"name": "N/A", "revenue": 0.0, "orders": 0}


async def _get_contribution_margin(db: AsyncSession, start: date, end: date) -> dict:
    """Estimate contribution margin: Revenue - (COGS 58% estimate) - Meta Ads spend.
    Uses marketing_cost_per_order for spend and daily_orders for revenue.
    """
    try:
        from app.models.analytics import MarketingCostPerOrder
        rev_stmt = select(
            func.coalesce(func.sum(DailyOrders.total), 0),
            func.coalesce(func.sum(DailyOrders.dailyOrdersCount), 0),
        ).where(
            DailyOrders.date >= datetime.combine(start, datetime.min.time()),
            DailyOrders.date <= datetime.combine(end, datetime.max.time()),
        )
        rev_res = await db.execute(rev_stmt)
        rev_row = rev_res.one()
        total_revenue = float(rev_row[0])
        total_orders = int(rev_row[1])

        spend_stmt = select(
            func.coalesce(func.sum(MarketingCostPerOrder.total_spend), 0),
        ).where(
            MarketingCostPerOrder.date >= start,
            MarketingCostPerOrder.date <= end,
        )
        spend_res = await db.execute(spend_stmt)
        total_spend = float(spend_res.scalar() or 0)

        cogs_estimate = total_revenue * 0.58
        gross_profit = total_revenue - cogs_estimate
        contribution_margin = gross_profit - total_spend
        cm_pct = round((contribution_margin / total_revenue) * 100, 1) if total_revenue else 0.0

        return {
            "total_revenue": round(total_revenue, 2),
            "cogs_estimate": round(cogs_estimate, 2),
            "gross_profit": round(gross_profit, 2),
            "marketing_spend": round(total_spend, 2),
            "contribution_margin": round(contribution_margin, 2),
            "contribution_margin_pct": cm_pct,
            "gross_margin_pct": round((gross_profit / total_revenue) * 100, 1) if total_revenue else 0.0,
            "note": "COGS estimated at 58% of revenue; update when actuals available",
        }
    except Exception as e:
        logger.error(f"Failed to compute contribution margin: {e}")
        return {"contribution_margin": 0.0, "contribution_margin_pct": 0.0}


async def _get_north_star_trend(db: AsyncSession, start: date, end: date) -> list[dict]:
    """Daily GMV + order count trend for the date range."""
    try:
        stmt = select(
            DailyOrders.date,
            func.sum(DailyOrders.total).label("gmv"),
            func.sum(DailyOrders.dailyOrdersCount).label("orders"),
        ).where(
            DailyOrders.date >= datetime.combine(start, datetime.min.time()),
            DailyOrders.date <= datetime.combine(end, datetime.max.time()),
        ).group_by(DailyOrders.date).order_by(DailyOrders.date.asc())

        result = await db.execute(stmt)
        rows = result.all()
        return [
            {
                "date": r.date.strftime("%Y-%m-%d") if hasattr(r.date, "strftime") else str(r.date)[:10],
                "gmv": round(float(r.gmv), 2),
                "orders": int(r.orders),
            }
            for r in rows
        ]
    except Exception as e:
        logger.error(f"Failed to get north star trend: {e}")
        return []


async def _get_channel_drilldown(db: AsyncSession, start: date, end: date) -> list[dict]:
    """Revenue breakdown by UTM source (top 10)."""
    try:
        stmt = select(
            UtmAttributionMetrics.utm_source,
            func.sum(UtmAttributionMetrics.revenue).label("revenue"),
            func.sum(UtmAttributionMetrics.orders).label("orders"),
            func.sum(UtmAttributionMetrics.sessions).label("sessions"),
        ).where(
            UtmAttributionMetrics.date >= start,
            UtmAttributionMetrics.date <= end,
        ).group_by(UtmAttributionMetrics.utm_source).order_by(
            func.sum(UtmAttributionMetrics.revenue).desc()
        ).limit(10)

        result = await db.execute(stmt)
        rows = result.all()
        return [
            {
                "source": r.utm_source,
                "revenue": round(float(r.revenue), 2),
                "orders": int(r.orders),
                "sessions": int(r.sessions),
            }
            for r in rows
        ]
    except Exception as e:
        logger.error(f"Failed to get channel drilldown: {e}")
        return []


async def _get_metric_library(db: AsyncSession, start: date, end: date) -> dict:
    """Metric library: MER, CAC payback period, runway proxy."""
    try:
        from app.models.analytics import MarketingCostPerOrder, CampaignCacMetrics

        # MER = Total Revenue / Total Meta Spend
        rev_stmt = select(func.coalesce(func.sum(DailyOrders.total), 0)).where(
            DailyOrders.date >= datetime.combine(start, datetime.min.time()),
            DailyOrders.date <= datetime.combine(end, datetime.max.time()),
        )
        rev_res = await db.execute(rev_stmt)
        total_revenue = float(rev_res.scalar() or 0)

        spend_stmt = select(func.coalesce(func.sum(MarketingCostPerOrder.total_spend), 0)).where(
            MarketingCostPerOrder.date >= start,
            MarketingCostPerOrder.date <= end,
        )
        spend_res = await db.execute(spend_stmt)
        total_spend = float(spend_res.scalar() or 0)

        mer = round(total_revenue / total_spend, 2) if total_spend else 0.0

        # CAC payback: avg_cac / (avg_aov * gross_margin%)
        cac_stmt = select(
            func.coalesce(func.sum(CampaignCacMetrics.total_spend), 0),
            func.coalesce(func.sum(CampaignCacMetrics.new_customers), 0),
        ).where(
            CampaignCacMetrics.date >= start,
            CampaignCacMetrics.date <= end,
        )
        cac_res = await db.execute(cac_stmt)
        cac_row = cac_res.one()
        cac_spend = float(cac_row[0])
        new_customers = int(cac_row[1])
        avg_cac = round(cac_spend / new_customers, 2) if new_customers else 0.0

        orders_stmt = select(
            func.coalesce(func.sum(DailyOrders.total), 0),
            func.coalesce(func.sum(DailyOrders.dailyOrdersCount), 0),
        ).where(
            DailyOrders.date >= datetime.combine(start, datetime.min.time()),
            DailyOrders.date <= datetime.combine(end, datetime.max.time()),
        )
        orders_res = await db.execute(orders_stmt)
        o_row = orders_res.one()
        total_rev = float(o_row[0])
        total_orders = int(o_row[1])
        avg_aov = round(total_rev / total_orders, 2) if total_orders else 0.0

        gross_margin = 0.42
        monthly_margin_per_customer = avg_aov * gross_margin
        cac_payback_months = round(avg_cac / monthly_margin_per_customer, 1) if monthly_margin_per_customer else 0.0

        return {
            "mer": mer,
            "avg_cac": avg_cac,
            "avg_aov": avg_aov,
            "cac_payback_months": cac_payback_months,
            "total_revenue": round(total_revenue, 2),
            "total_spend": round(total_spend, 2),
            "new_customers": new_customers,
        }
    except Exception as e:
        logger.error(f"Failed to get metric library: {e}")
        return {"mer": 0.0, "avg_cac": 0.0, "cac_payback_months": 0.0}


async def _get_retention_summary(db: AsyncSession, start: date, end: date) -> dict:
    """Retention metrics from RPR and repeat cohort data."""
    try:
        # Latest RPR
        rpr_stmt = select(RepeatPurchaseRate.rpr_percentage).order_by(
            RepeatPurchaseRate.createdAt.desc()
        ).limit(1)
        rpr_res = await db.execute(rpr_stmt)
        rpr_val = float(rpr_res.scalar() or 0)

        # Avg month-1 retention from cohorts
        cohort_stmt = select(
            func.avg(CustomerRepeatCohort.retention_rate).label("avg_retention")
        ).where(
            CustomerRepeatCohort.cohort_index == 1
        )
        cohort_res = await db.execute(cohort_stmt)
        cohort_row = cohort_res.first()
        avg_m1_retention = round(float(cohort_row[0]), 1) if cohort_row and cohort_row[0] else 0.0

        # RFM champion + loyal count
        rfm_stmt = select(
            CustomerRfmSegment.segment,
            func.count(CustomerRfmSegment.id).label("count"),
        ).group_by(CustomerRfmSegment.segment)
        rfm_res = await db.execute(rfm_stmt)
        rfm_rows = rfm_res.all()
        rfm_dist = {r.segment: int(r.count) for r in rfm_rows}
        total_rfm = sum(rfm_dist.values()) or 1
        loyal_pct = round((rfm_dist.get("Champions", 0) + rfm_dist.get("Loyal", 0)) / total_rfm * 100, 1)

        return {
            "rpr_percentage": rpr_val,
            "avg_month1_retention": avg_m1_retention,
            "loyal_customer_pct": loyal_pct,
            "rfm_distribution": rfm_dist,
            "cohort_rebuy_30d": {"current": avg_m1_retention, "previous": 0, "delta": 0, "static": False},
            "email_revenue_share": {"current": 0, "previous": 0, "delta": 0, "static": True},
            "nps": {"current": 0, "previous": 0, "delta": 0, "static": True},
            "complaint_rate": {"current": 0, "previous": 0, "delta": 0, "static": True},
        }
    except Exception as e:
        logger.error(f"Failed to get retention summary: {e}")
        return {
            "rpr_percentage": 0.0,
            "avg_month1_retention": 0.0,
            "loyal_customer_pct": 0.0,
            "rfm_distribution": {},
            "cohort_rebuy_30d": {"current": 0, "previous": 0, "delta": 0, "static": True},
            "email_revenue_share": {"current": 0, "previous": 0, "delta": 0, "static": True},
            "nps": {"current": 0, "previous": 0, "delta": 0, "static": True},
            "complaint_rate": {"current": 0, "previous": 0, "delta": 0, "static": True},
        }


async def _get_operations_overview(db: AsyncSession, start: date, end: date) -> dict:
    """Operations: RTO rate, avg delivery, courier breakdown, failure zones."""
    try:
        from app.models.analytics import RtoMetrics, DeliveryTimeMetrics, CourierPerformanceMetrics, FailureZonesMetrics

        # RTO rate
        rto_stmt = select(
            func.sum(RtoMetrics.total_orders),
            func.sum(RtoMetrics.rto_orders),
        ).where(RtoMetrics.date >= start, RtoMetrics.date <= end)
        rto_res = await db.execute(rto_stmt)
        rto_row = rto_res.one()
        rto_total = int(rto_row[0] or 0)
        rto_orders = int(rto_row[1] or 0)
        rto_rate = round((rto_orders / rto_total) * 100, 1) if rto_total else 0.0

        # Avg delivery time
        del_stmt = select(
            func.avg(DeliveryTimeMetrics.avg_delivery_time),
            func.avg(DeliveryTimeMetrics.p90_delivery_time),
        ).where(DeliveryTimeMetrics.date >= start, DeliveryTimeMetrics.date <= end)
        del_res = await db.execute(del_stmt)
        del_row = del_res.first()
        avg_delivery = round(float(del_row[0]), 1) if del_row and del_row[0] else 0.0
        p90_delivery = round(float(del_row[1]), 1) if del_row and del_row[1] else 0.0

        # Top courier by orders
        courier_stmt = select(
            CourierPerformanceMetrics.courier_partner,
            func.sum(CourierPerformanceMetrics.total_orders).label("orders"),
        ).where(
            CourierPerformanceMetrics.date >= start,
            CourierPerformanceMetrics.date <= end,
        ).group_by(CourierPerformanceMetrics.courier_partner).order_by(
            func.sum(CourierPerformanceMetrics.total_orders).desc()
        ).limit(3)
        courier_res = await db.execute(courier_stmt)
        couriers = [{"name": r[0], "orders": int(r[1])} for r in courier_res.all()]

        # Top failure zone
        fz_stmt = select(
            FailureZonesMetrics.city,
            FailureZonesMetrics.state,
            func.sum(FailureZonesMetrics.total_orders).label("orders"),
            func.sum(FailureZonesMetrics.failed_orders).label("failed"),
        ).where(
            FailureZonesMetrics.date >= start,
            FailureZonesMetrics.date <= end,
        ).group_by(FailureZonesMetrics.city, FailureZonesMetrics.state).order_by(
            func.sum(FailureZonesMetrics.failed_orders).desc()
        ).limit(5)
        fz_res = await db.execute(fz_stmt)
        failure_zones = [
            {"city": r[0], "state": r[1], "orders": int(r[2]), "failed": int(r[3])}
            for r in fz_res.all()
        ]

        return {
            "rto_rate": rto_rate,
            "avg_delivery_days": avg_delivery,
            "p90_delivery_days": p90_delivery,
            "top_couriers": couriers,
            "top_failure_zones": failure_zones,
        }
    except Exception as e:
        logger.error(f"Failed to get operations overview: {e}")
        return {"rto_rate": 0.0, "avg_delivery_days": 0.0}
