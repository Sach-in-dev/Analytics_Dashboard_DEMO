"""Sync inventory metrics from production DB into analytics DB."""

import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, delete
from app.models.analytics import (
    InventorySummary,
    InventoryDeadStock,
    InventoryStockOuts,
    InventoryAgingStock,
)

logger = logging.getLogger(__name__)


async def sync_inventory_metrics(prod_db: AsyncSession, analytics_db: AsyncSession):
    """Fetch current inventory metrics from prod DB and insert into analytics DB as a snapshot."""
    dt = datetime.now(timezone.utc).replace(tzinfo=None)

    # Clean previous snapshot data (we replace it to keep the DB size minimal and serve only current snapshot)
    await analytics_db.execute(delete(InventoryDeadStock))
    await analytics_db.execute(delete(InventoryStockOuts))
    await analytics_db.execute(delete(InventoryAgingStock))
    await analytics_db.execute(delete(InventorySummary))

    # --- 1. Summary Metrics ---
    total_managed_q = text("SELECT COUNT(id) FROM product_variants WHERE manage_inventory = true AND deleted_at IS NULL")
    total_oos_q = text("SELECT COUNT(id) FROM product_variants WHERE manage_inventory = true AND inventory_quantity <= 0 AND deleted_at IS NULL")
    dead_stock_q = text("""
        SELECT COUNT(id), COALESCE(SUM(inventory_quantity * COALESCE(price, 0)), 0)
        FROM product_variants 
        WHERE manage_inventory = true 
        AND inventory_quantity > 0 
        AND deleted_at IS NULL
        AND id NOT IN (
            SELECT l.variant_id 
            FROM line_item l
            JOIN "order" o ON l.order_id = o.id
            WHERE o.created_at >= NOW() - INTERVAL '90 days'
            AND l.variant_id IS NOT NULL
        )
    """)
    locked_capital_q = text("""
        SELECT COALESCE(SUM(inventory_quantity * COALESCE(price, 0)), 0)
        FROM product_variants 
        WHERE manage_inventory = true 
        AND inventory_quantity > 0
        AND deleted_at IS NULL
    """)

    res_total = await prod_db.execute(total_managed_q)
    res_oos = await prod_db.execute(total_oos_q)
    res_dead = await prod_db.execute(dead_stock_q)
    res_locked = await prod_db.execute(locked_capital_q)

    total_managed = res_total.scalar() or 0
    total_oos = res_oos.scalar() or 0
    dead_row = res_dead.fetchone()
    dead_stock_count = dead_row[0] or 0
    dead_stock_value = dead_row[1] or 0
    total_locked_capital = res_locked.scalar() or 0

    analytics_db.add(InventorySummary(
        date=dt,
        total_tracked_variants=total_managed,
        total_stock_outs=total_oos,
        dead_stock_variants=dead_stock_count,
        dead_stock_value=float(dead_stock_value) / 100,
        total_locked_capital=float(total_locked_capital) / 100
    ))

    # --- 2. Dead Stock ---
    dead_stock_list_q = text("""
        SELECT p.title as product_title, v.sku, v.inventory_quantity, v.price, v.created_at
        FROM product_variants v
        JOIN product p ON v.product_id = p.id
        WHERE v.manage_inventory = true AND v.inventory_quantity > 0 AND v.deleted_at IS NULL
        AND v.id NOT IN (
            SELECT l.variant_id FROM line_item l JOIN "order" o ON l.order_id = o.id
            WHERE o.created_at >= NOW() - INTERVAL '90 days' AND l.variant_id IS NOT NULL
        )
    """)
    res_ds = await prod_db.execute(dead_stock_list_q)
    for r in res_ds.fetchall():
        analytics_db.add(InventoryDeadStock(
            product_title=r[0],
            sku=r[1],
            inventory_quantity=r[2],
            price=float(r[3] or 0) / 100,
            total_value=(r[2] * (r[3] or 0)) / 100,
            variant_created_at=r[4]
        ))

    # --- 3. Stock Outs ---
    stock_outs_list_q = text("""
        SELECT p.title as product_title, v.sku, v.inventory_quantity, v.updated_at
        FROM product_variants v
        JOIN product p ON v.product_id = p.id
        WHERE v.manage_inventory = true AND v.inventory_quantity <= 0 AND v.deleted_at IS NULL
    """)
    res_so = await prod_db.execute(stock_outs_list_q)
    for r in res_so.fetchall():
        analytics_db.add(InventoryStockOuts(
            product_title=r[0],
            sku=r[1],
            inventory_quantity=r[2],
            variant_updated_at=r[3]
        ))

    # --- 4. Aging Stock ---
    aging_stock_list_q = text("""
        SELECT p.title as product_title, v.sku, v.inventory_quantity, v.price, v.created_at
        FROM product_variants v
        JOIN product p ON v.product_id = p.id
        WHERE v.manage_inventory = true AND v.inventory_quantity > 0 AND v.deleted_at IS NULL
    """)
    res_as = await prod_db.execute(aging_stock_list_q)
    for r in res_as.fetchall():
        analytics_db.add(InventoryAgingStock(
            product_title=r[0],
            sku=r[1],
            inventory_quantity=r[2],
            total_value=(r[2] * (r[3] or 0)) / 100,
            variant_created_at=r[4]
        ))

    await analytics_db.commit()
    logger.info("Successfully synchronized inventory metrics snapshot to analytics db")
