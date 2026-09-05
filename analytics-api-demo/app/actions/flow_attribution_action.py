"""Flow Revenue Attribution Action — builds user journey flows and attributes revenue.

Pipeline:
  1. Fetch all completed orders with customer linkage from prod DB
  2. Fetch customer activities (LOGIN, WISHLIST, CREATE_ACCOUNT) per customer
  3. Infer cart/checkout events from cart & line_item tables
  4. Build ordered flow sequences per (customer, order) capped at 7 steps
  5. Aggregate by (date, flow_path) → users, orders, revenue, conversion, AOV
  6. Upsert into flow_revenue_attribution (analytics DB)

Uses SQL CTEs for data extraction, Python for flow construction.
"""

import logging
from datetime import datetime, timezone
from collections import defaultdict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)

MAX_FLOW_STEPS = 7

# Map raw activity types to user-friendly step names
ACTIVITY_MAP = {
    "CREATE_ACCOUNT": "signup",
    "LOGIN": "login",
    "ADD_TO_WISHLIST": "wishlist",
    "REMOVE_FROM_WISHLIST": "wishlist",
    "LOGOUT": "logout",
}


async def process_flow_attribution(
    prod_db: AsyncSession,
    analytics_db: AsyncSession,
):
    """Full flow attribution pipeline: fetch events → build flows → aggregate → upsert."""
    logger.info("[FLOW-ATTR] Starting flow revenue attribution processing")

    # ── Step 1: Fetch all completed orders with customer and cart info ──
    orders_result = await prod_db.execute(
        text("""
            SELECT
                o.id AS order_id,
                o.customer_id,
                o.email,
                o.cart_id,
                o.total,
                o.created_at AS order_time,
                DATE(COALESCE(o.paid_at, o.created_at)) AS order_date,
                o.referral,
                o.metadata->>'source' AS meta_source
            FROM "order" o
            WHERE (o.paid_at IS NOT NULL
                   OR (o.paid_at IS NULL AND o.status IN ('DELIVERED', 'COMPLETED')))
              AND o.customer_id IS NOT NULL
              AND o.created_at IS NOT NULL
            ORDER BY COALESCE(o.paid_at, o.created_at)
        """)
    )
    orders = orders_result.fetchall()

    if not orders:
        logger.warning("[FLOW-ATTR] No order data found")
        return

    logger.info(f"[FLOW-ATTR] Processing {len(orders)} orders")

    # Collect all customer IDs
    customer_ids = list(set(o[1] for o in orders if o[1]))

    # ── Step 2: Fetch customer activities in bulk ──
    # Build customer → activities mapping
    customer_activities: dict[str, list[tuple[str, datetime]]] = defaultdict(list)

    # Process in chunks to avoid query size limits
    chunk_size = 500
    for i in range(0, len(customer_ids), chunk_size):
        chunk = customer_ids[i:i + chunk_size]
        placeholders = ", ".join(f":cid_{j}" for j in range(len(chunk)))
        params = {f"cid_{j}": cid for j, cid in enumerate(chunk)}

        act_result = await prod_db.execute(
            text(f"""
                SELECT customer_id, activity, created_at
                FROM customer_activities
                WHERE customer_id IN ({placeholders})
                ORDER BY created_at
            """),
            params,
        )
        for row in act_result.fetchall():
            cust_id, activity, act_time = row
            step = ACTIVITY_MAP.get(str(activity), str(activity).lower())
            customer_activities[cust_id].append((step, act_time))

    # ── Step 3: Fetch cart creation events ──
    cart_events: dict[str, datetime] = {}
    cart_ids = list(set(o[3] for o in orders if o[3]))

    for i in range(0, len(cart_ids), chunk_size):
        chunk = cart_ids[i:i + chunk_size]
        placeholders = ", ".join(f":crt_{j}" for j in range(len(chunk)))
        params = {f"crt_{j}": cid for j, cid in enumerate(chunk)}

        cart_result = await prod_db.execute(
            text(f"""
                SELECT id, customer_id, created_at
                FROM cart
                WHERE id IN ({placeholders})
            """),
            params,
        )
        for row in cart_result.fetchall():
            cart_events[row[0]] = row[2]

    # ── Step 4: Check if cart has items (add_to_cart event) ──
    cart_has_items: set[str] = set()
    for i in range(0, len(cart_ids), chunk_size):
        chunk = cart_ids[i:i + chunk_size]
        placeholders = ", ".join(f":li_{j}" for j in range(len(chunk)))
        params = {f"li_{j}": cid for j, cid in enumerate(chunk)}

        li_result = await prod_db.execute(
            text(f"""
                SELECT DISTINCT cart_id
                FROM line_item
                WHERE cart_id IN ({placeholders})
            """),
            params,
        )
        for row in li_result.fetchall():
            cart_has_items.add(row[0])

    logger.info(
        f"[FLOW-ATTR] Loaded {len(customer_activities)} customers with activities, "
        f"{len(cart_events)} carts, {len(cart_has_items)} carts with items"
    )

    # ── Step 5: Build flow for each order ──
    # Aggregation key: (date, flow_path)
    aggregated: dict[tuple, dict] = {}

    for order in orders:
        order_id, cust_id, email, cart_id, total, order_time, order_date, referral, meta_src = order
        revenue = float(total) if total else 0.0

        # Collect all events before this order
        events: list[tuple[str, datetime]] = []

        # Customer activities before order
        for step, act_time in customer_activities.get(cust_id, []):
            if act_time < order_time:
                events.append((step, act_time))

        # Cart creation event
        if cart_id and cart_id in cart_events:
            cart_time = cart_events[cart_id]
            if cart_time <= order_time:
                events.append(("cart_created", cart_time))

        # Add to cart event (if cart has items)
        if cart_id and cart_id in cart_has_items:
            cart_time = cart_events.get(cart_id, order_time)
            events.append(("add_to_cart", cart_time))

        # Determine entry source
        if referral and "utm_source=" in str(referral).lower():
            events.insert(0, ("paid_ad", order_time))
        elif meta_src and meta_src.lower() == "website":
            events.insert(0, ("website_visit", order_time))

        # Sort by time
        events.sort(key=lambda x: x[1])

        # Deduplicate consecutive same steps
        deduped: list[str] = []
        for step, _ in events:
            if not deduped or deduped[-1] != step:
                deduped.append(step)

        # Cap at MAX_FLOW_STEPS and add purchase
        flow_steps = deduped[-MAX_FLOW_STEPS:] if len(deduped) > MAX_FLOW_STEPS else deduped
        flow_steps.append("purchase")

        # Build flow path string
        flow_path = " > ".join(flow_steps)
        steps_count = len(flow_steps)

        key = (order_date, flow_path)
        if key not in aggregated:
            aggregated[key] = {
                "steps_count": steps_count,
                "users": set(),
                "orders": 0,
                "revenue": 0.0,
            }

        agg = aggregated[key]
        if email:
            agg["users"].add(email)
        elif cust_id:
            agg["users"].add(cust_id)
        agg["orders"] += 1
        agg["revenue"] += revenue

    logger.info(f"[FLOW-ATTR] Aggregated into {len(aggregated)} flow-date combos")

    # ── Step 6: Upsert into analytics DB ──
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    upsert_count = 0

    for key, agg in aggregated.items():
        order_date, flow_path = key
        user_count = len(agg["users"])
        orders_count = agg["orders"]
        revenue = round(agg["revenue"], 2)
        conversion_rate = round((orders_count / user_count) * 100, 2) if user_count > 0 else 0.0
        aov = round(revenue / orders_count, 2) if orders_count > 0 else 0.0

        await analytics_db.execute(
            text("""
                INSERT INTO flow_revenue_attribution
                    (id, date, flow_path, steps_count, users, orders,
                     revenue, conversion_rate, aov,
                     "createdAt", "updatedAt")
                VALUES
                    (gen_random_uuid()::text, :date, :flow_path, :steps_count, :users, :orders,
                     :revenue, :conversion_rate, :aov,
                     :now, :now)
                ON CONFLICT (date, flow_path) DO UPDATE SET
                    steps_count = EXCLUDED.steps_count,
                    users = EXCLUDED.users,
                    orders = EXCLUDED.orders,
                    revenue = EXCLUDED.revenue,
                    conversion_rate = EXCLUDED.conversion_rate,
                    aov = EXCLUDED.aov,
                    "updatedAt" = EXCLUDED."updatedAt"
            """),
            {
                "date": order_date,
                "flow_path": flow_path,
                "steps_count": agg["steps_count"],
                "users": user_count,
                "orders": orders_count,
                "revenue": revenue,
                "conversion_rate": conversion_rate,
                "aov": aov,
                "now": now,
            },
        )
        upsert_count += 1

    await analytics_db.commit()
    logger.info(f"[FLOW-ATTR] Successfully upserted {upsert_count} flow attribution rows")
