"""LTV by Segment Action — fetches customer order data from prod DB,
joins with RFM segments from analytics DB, computes LTV by segment, and upserts.
"""

import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def process_ltv_by_segment(prod_db: AsyncSession, analytics_db: AsyncSession):
    """Full LTV-by-segment pipeline: fetch prod orders → join RFM → aggregate → upsert."""
    logger.info("[LTV] Starting LTV by segment processing")

    # Step 1: Fetch per-customer lifetime order data from prod DB
    result = await prod_db.execute(
        text("""
            SELECT
                email,
                COUNT(*)::bigint AS total_orders,
                SUM(total)::numeric AS total_revenue
            FROM "order"
            WHERE (paid_at IS NOT NULL OR status IN ('DELIVERED', 'COMPLETED'))
              AND email IS NOT NULL
              AND email != ''
            GROUP BY email
        """)
    )
    prod_rows = result.fetchall()

    if not prod_rows:
        logger.warning("[LTV] No customer order data found in prod DB")
        return

    logger.info(f"[LTV] Fetched {len(prod_rows)} unique customers from prod DB")

    # Build email → revenue lookup  (convert from paise/cents to currency)
    customer_revenue: dict[str, float] = {}
    for row in prod_rows:
        email = row[0]
        revenue = float(row[2] or 0) / 100
        customer_revenue[email] = revenue

    # Step 2: Fetch RFM segments from analytics DB
    rfm_result = await analytics_db.execute(
        text("""
            SELECT email, segment
            FROM customer_rfm_segments
        """)
    )
    rfm_rows = rfm_result.fetchall()

    if not rfm_rows:
        logger.warning("[LTV] No RFM segments found in analytics DB — run RFM job first")
        return

    logger.info(f"[LTV] Fetched {len(rfm_rows)} RFM segment records")

    # Build email → segment lookup
    email_segment: dict[str, str] = {}
    for row in rfm_rows:
        email_segment[row[0]] = row[1]

    # Step 3: Aggregate LTV by segment
    #   { segment: { "total_customers": int, "total_revenue": float } }
    segment_agg: dict[str, dict] = {}

    for email, revenue in customer_revenue.items():
        segment = email_segment.get(email)
        if not segment:
            # Customer exists in prod but not in RFM — skip
            continue

        if segment not in segment_agg:
            segment_agg[segment] = {"total_customers": 0, "total_revenue": 0.0}

        segment_agg[segment]["total_customers"] += 1
        segment_agg[segment]["total_revenue"] += revenue

    if not segment_agg:
        logger.warning("[LTV] No matching customers between prod orders and RFM segments")
        return

    # Compute avg_ltv per segment
    segments_data = []
    for segment, agg in segment_agg.items():
        total_customers = agg["total_customers"]
        total_revenue = round(agg["total_revenue"], 2)
        avg_ltv = round(total_revenue / total_customers, 2) if total_customers > 0 else 0.0

        segments_data.append({
            "segment": segment,
            "total_customers": total_customers,
            "total_revenue": total_revenue,
            "avg_ltv": avg_ltv,
        })

    # Step 4: Upsert into analytics DB (ON CONFLICT segment DO UPDATE)
    upsert_sql = text("""
        INSERT INTO customer_ltv_by_segment
            (id, segment, total_customers, total_revenue, avg_ltv, "createdAt")
        VALUES
            (gen_random_uuid()::text, :segment, :total_customers, :total_revenue,
             :avg_ltv, :created_at)
        ON CONFLICT (segment) DO UPDATE SET
            total_customers = EXCLUDED.total_customers,
            total_revenue = EXCLUDED.total_revenue,
            avg_ltv = EXCLUDED.avg_ltv,
            "createdAt" = EXCLUDED."createdAt"
    """)

    created_at = datetime.now(timezone.utc).replace(tzinfo=None)

    for record in segments_data:
        record["created_at"] = created_at

    await analytics_db.execute(upsert_sql, segments_data)
    await analytics_db.commit()

    logger.info(f"[LTV] Successfully upserted {len(segments_data)} LTV segment records")

    # Log the breakdown
    for s in segments_data:
        logger.info(
            f"[LTV]   {s['segment']}: "
            f"{s['total_customers']} customers, "
            f"₹{s['total_revenue']:,.2f} revenue, "
            f"avg LTV ₹{s['avg_ltv']:,.2f}"
        )
