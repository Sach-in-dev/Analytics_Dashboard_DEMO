from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_analytics_db
from app.schemas.responses import success_response
from app.dependencies import require_permission
import math

# Use the analytics tables we created
from app.models.analytics import (
    InventorySummary,
    InventoryDeadStock,
    InventoryStockOuts,
    InventoryAgingStock
)

router = APIRouter(prefix="/inventory", tags=["Inventory"], dependencies=[Depends(require_permission("inventory"))])


def _isoformat(value):
    """Raw text() queries return a native datetime on Postgres but a plain
    string on SQLite — normalize either to an ISO date string."""
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else value

@router.get("/summary")
async def get_inventory_summary(
    request: Request,
    db: AsyncSession = Depends(get_analytics_db),
):
    query = text("SELECT * FROM inventory_summary ORDER BY \"createdAt\" DESC LIMIT 1")
    result = await db.execute(query)
    row = result.fetchone()

    total_managed = 0
    total_oos = 0
    dead_stock_count = 0
    dead_stock_value = 0.0
    total_locked_capital = 0.0

    if row:
        total_managed = row.total_tracked_variants
        total_oos = row.total_stock_outs
        dead_stock_count = row.dead_stock_variants
        dead_stock_value = row.dead_stock_value
        total_locked_capital = row.total_locked_capital

    data = {
        "total_tracked_variants": total_managed,
        "total_stock_outs": total_oos,
        "dead_stock_variants": dead_stock_count,
        "dead_stock_value": dead_stock_value,
        "total_locked_capital": total_locked_capital
    }
    
    return success_response(data=data, path=str(request.url.path))


@router.get("/dead-stock")
async def get_dead_stock(
    request: Request,
    page: int = Query(1, description="Page number"),
    limit: int = Query(10, description="Items per page"),
    db: AsyncSession = Depends(get_analytics_db),
):
    offset = (page - 1) * limit
    
    query = text("""
        SELECT 
            product_title, 
            sku, 
            inventory_quantity, 
            price,
            total_value,
            variant_created_at
        FROM inventory_dead_stock
        ORDER BY total_value DESC
        LIMIT :limit OFFSET :offset
    """)

    count_query = text("SELECT COUNT(id) FROM inventory_dead_stock")

    count_res = await db.execute(count_query)
    total = count_res.scalar() or 0

    result = await db.execute(query, {"limit": limit, "offset": offset})
    rows = result.fetchall()

    data = []
    for r in rows:
        data.append({
            "product_title": r.product_title,
            "sku": r.sku or "N/A",
            "inventory_quantity": r.inventory_quantity,
            "price": r.price,
            "total_value": r.total_value,
            "created_at": _isoformat(r.variant_created_at)
        })

    return success_response(
        data=data, 
        path=str(request.url.path),
        meta={"total": total, "lastPage": math.ceil(total / limit) if total else 1}
    )


@router.get("/stock-outs")
async def get_stock_outs(
    request: Request,
    page: int = Query(1, description="Page number"),
    limit: int = Query(10, description="Items per page"),
    db: AsyncSession = Depends(get_analytics_db),
):
    offset = (page - 1) * limit
    
    query = text("""
        SELECT 
            product_title, 
            sku, 
            inventory_quantity, 
            variant_updated_at
        FROM inventory_stock_outs
        ORDER BY variant_updated_at DESC
        LIMIT :limit OFFSET :offset
    """)

    count_query = text("SELECT COUNT(id) FROM inventory_stock_outs")

    count_res = await db.execute(count_query)
    total = count_res.scalar() or 0

    result = await db.execute(query, {"limit": limit, "offset": offset})
    rows = result.fetchall()

    data = []
    for r in rows:
        data.append({
            "product_title": r.product_title,
            "sku": r.sku or "N/A",
            "inventory_quantity": r.inventory_quantity,
            "updated_at": _isoformat(r.variant_updated_at)
        })

    return success_response(
        data=data, 
        path=str(request.url.path),
        meta={"total": total, "lastPage": math.ceil(total / limit) if total else 1}
    )


@router.get("/aging")
async def get_aging_stock(
    request: Request,
    page: int = Query(1, description="Page number"),
    limit: int = Query(10, description="Items per page"),
    db: AsyncSession = Depends(get_analytics_db),
):
    offset = (page - 1) * limit
    
    query = text("""
        SELECT 
            product_title, 
            sku, 
            inventory_quantity, 
            total_value,
            variant_created_at
        FROM inventory_aging_stock
        ORDER BY variant_created_at ASC
        LIMIT :limit OFFSET :offset
    """)

    count_query = text("SELECT COUNT(id) FROM inventory_aging_stock")

    count_res = await db.execute(count_query)
    total = count_res.scalar() or 0

    result = await db.execute(query, {"limit": limit, "offset": offset})
    rows = result.fetchall()

    data = []
    for r in rows:
        data.append({
            "product_title": r.product_title,
            "sku": r.sku or "N/A",
            "inventory_quantity": r.inventory_quantity,
            "total_value": r.total_value,
            "created_at": _isoformat(r.variant_created_at)
        })

    return success_response(
        data=data, 
        path=str(request.url.path),
        meta={"total": total, "lastPage": math.ceil(total / limit) if total else 1}
    )


@router.get("/merchandising-gaps")
async def get_merchandising_gaps(
    request: Request,
    db: AsyncSession = Depends(get_analytics_db),
):
    """Merchandising gaps: stock-outs with recent search demand (searched but out-of-stock)."""
    # Dialect-portable rewrite: CURRENT_DATE - INTERVAL and ILIKE are
    # Postgres-specific, so compute the cutoff in Python and match
    # keyword-in-title with a Python substring check (case-insensitive)
    # instead of a raw SQL join.
    from datetime import date, timedelta
    cutoff = date.today() - timedelta(days=30)

    kw_query = text("""
        SELECT keyword, SUM(count) AS total_searches
        FROM search_top_keywords
        WHERE date >= :cutoff
        GROUP BY keyword
    """)
    kw_rows = (await db.execute(kw_query, {"cutoff": cutoff})).fetchall()
    keyword_demand = [(str(k).lower(), int(c or 0)) for k, c in kw_rows]

    stockout_query = text("""
        SELECT product_title, sku, inventory_quantity
        FROM inventory_stock_outs
    """)
    stockout_rows = (await db.execute(stockout_query)).fetchall()

    data = []
    for product_title, sku, qty in stockout_rows:
        title_lower = (product_title or "").lower()
        search_demand = sum(count for kw, count in keyword_demand if kw in title_lower)
        data.append({
            "product_title": product_title,
            "sku": sku or "N/A",
            "inventory_quantity": qty,
            "search_demand": search_demand,
        })
    data.sort(key=lambda d: (-d["search_demand"], d["product_title"] or ""))
    data = data[:50]
    return success_response(data=data, path=str(request.url.path))


@router.get("/demand-forecast")
async def get_demand_forecast(
    request: Request,
    db: AsyncSession = Depends(get_analytics_db),
):
    """Demand forecasting: velocity-based reorder signals from order history.
    Computes avg daily units sold per product over last 30 days and flags
    variants where days-of-stock < 14 (reorder soon).
    Uses pre-aggregated analytics data only.
    """
    # Dialect-portable rewrite: CURRENT_DATE - INTERVAL, ::NUMERIC casts, and
    # NULLS LAST are all Postgres-only — compute the cutoff and derived
    # fields in Python instead of one combined raw-SQL query.
    from datetime import date, timedelta
    cutoff = date.today() - timedelta(days=30)

    velocity_query = text("""
        SELECT product_title, SUM(value) AS total_units_30d
        FROM daily_product_metrics
        WHERE metric_type = 'order' AND date >= :cutoff
        GROUP BY product_title
    """)
    velocity_rows = (await db.execute(velocity_query, {"cutoff": cutoff})).fetchall()

    inventory_query = text("""
        SELECT product_title, inventory_quantity FROM inventory_aging_stock
        UNION ALL
        SELECT product_title, inventory_quantity FROM inventory_dead_stock
    """)
    inventory_rows = (await db.execute(inventory_query)).fetchall()
    stock_by_title: dict = {}
    for title, qty in inventory_rows:
        stock_by_title[title] = stock_by_title.get(title, 0) + int(qty or 0)

    data = []
    for title, total_units_30d in velocity_rows:
        daily_velocity = float(total_units_30d or 0) / 30.0
        if daily_velocity <= 0:
            continue
        current_stock = stock_by_title.get(title, 0)
        days_of_stock = round(current_stock / daily_velocity)
        if days_of_stock < 7:
            reorder_signal = "CRITICAL"
        elif days_of_stock < 14:
            reorder_signal = "REORDER_SOON"
        else:
            reorder_signal = "OK"
        data.append({
            "product_title": title,
            "daily_velocity": round(daily_velocity, 2),
            "current_stock": current_stock,
            "days_of_stock": days_of_stock,
            "reorder_signal": reorder_signal,
        })
    data.sort(key=lambda d: d["days_of_stock"])
    data = data[:50]
    return success_response(data=data, path=str(request.url.path))
