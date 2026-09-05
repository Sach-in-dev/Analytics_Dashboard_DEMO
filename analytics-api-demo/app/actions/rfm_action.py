"""RFM Segmentation Action — fetches customer order data from prod DB,
computes RFM scores, classifies into segments, and upserts into analytics DB.
"""

import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)

# --------------- Fixed Scoring Thresholds ---------------
RECENCY_THRESHOLDS = {"high": 30, "mid": 90}       # days
FREQUENCY_THRESHOLDS = {"high": 5, "mid": 2}       # order count
MONETARY_THRESHOLDS = {"high": 10000, "mid": 3000}  # total spend


def _score_recency(days: int) -> int:
    """Recency score: lower days = better (more recent)."""
    if days <= RECENCY_THRESHOLDS["high"]:
        return 3
    elif days <= RECENCY_THRESHOLDS["mid"]:
        return 2
    return 1


def _score_frequency(count: int) -> int:
    """Frequency score: higher count = better."""
    if count >= FREQUENCY_THRESHOLDS["high"]:
        return 3
    elif count >= FREQUENCY_THRESHOLDS["mid"]:
        return 2
    return 1


def _score_monetary(total: float) -> int:
    """Monetary score: higher spend = better."""
    if total >= MONETARY_THRESHOLDS["high"]:
        return 3
    elif total >= MONETARY_THRESHOLDS["mid"]:
        return 2
    return 1


def _classify_segment(r: int, f: int, m: int) -> str:
    """Map RFM scores to a customer segment.

    Champions:          R=3, F=3 (any M)
    Loyal Customers:    R>=2, F>=2 (not Champions)
    Potential Loyalists: R=3, F=1 (any M)
    At Risk:            R<=2, F>=2 (not already Loyal — handled by order)
    Lost Customers:     R=1, F=1 (any M)
    Fallback:           everything else
    """
    if r == 3 and f == 3:
        return "Champions"
    if r >= 2 and f >= 2:
        return "Loyal Customers"
    if r == 3 and f == 1:
        return "Potential Loyalists"
    if r <= 2 and f >= 2:
        return "At Risk"
    if r == 1 and f == 1:
        return "Lost Customers"
    # Catch-all for remaining combos (e.g., R=2,F=1)
    return "At Risk"


async def _inspect_order_statuses(prod_db: AsyncSession):
    """Log distinct order statuses in prod DB for transparency/debugging."""
    result = await prod_db.execute(
        text('SELECT status, COUNT(*)::bigint AS cnt FROM "order" GROUP BY status ORDER BY cnt DESC')
    )
    rows = result.fetchall()
    status_summary = {row[0]: row[1] for row in rows}
    logger.info(f"[RFM] Prod DB order status distribution: {status_summary}")
    return status_summary


async def process_rfm_segments(prod_db: AsyncSession, analytics_db: AsyncSession):
    """Full RFM pipeline: fetch → compute → upsert."""
    logger.info("[RFM] Starting RFM segmentation processing")

    # Step 0: Inspect order statuses for debugging
    await _inspect_order_statuses(prod_db)

    # Step 1: Fetch aggregated customer data from prod DB
    result = await prod_db.execute(
        text("""
            SELECT
                email,
                MAX(COALESCE(paid_at, created_at)) AS last_order_date,
                COUNT(*)::bigint AS total_orders,
                SUM(total)::numeric AS total_spend
            FROM "order"
            WHERE (paid_at IS NOT NULL OR status IN ('DELIVERED', 'COMPLETED'))
              AND email IS NOT NULL
              AND email != ''
            GROUP BY email
        """)
    )
    rows = result.fetchall()

    if not rows:
        logger.warning("[RFM] No customer order data found in prod DB")
        return

    logger.info(f"[RFM] Fetched {len(rows)} unique customers from prod DB")

    # Step 2: Compute RFM values and scores
    now = datetime.now(ZoneInfo("Asia/Kolkata"))
    segments_data = []

    for row in rows:
        email = row[0]
        last_order_date = row[1]
        total_orders = int(row[2] or 0)
        total_spend = float(row[3] or 0) / 100  # Convert from cents/paise to currency

        # Recency in days
        if last_order_date:
            if last_order_date.tzinfo is None:
                last_order_date = last_order_date.replace(tzinfo=ZoneInfo("Asia/Kolkata"))
            recency_days = (now - last_order_date).days
        else:
            recency_days = 9999  # Very old / unknown

        # Scores
        r_score = _score_recency(recency_days)
        f_score = _score_frequency(total_orders)
        m_score = _score_monetary(total_spend)

        # Segment
        segment = _classify_segment(r_score, f_score, m_score)

        # Store naive last_order_date for analytics DB
        naive_last_order = None
        if last_order_date:
            naive_last_order = last_order_date.replace(tzinfo=None)

        segments_data.append({
            "email": email,
            "recency_days": recency_days,
            "frequency": total_orders,
            "monetary": round(total_spend, 2),
            "r_score": r_score,
            "f_score": f_score,
            "m_score": m_score,
            "segment": segment,
            "last_order_date": naive_last_order,
        })

    # Step 3: Upsert into analytics DB (ON CONFLICT email DO UPDATE)
    upsert_sql = text("""
        INSERT INTO customer_rfm_segments
            (id, email, recency_days, frequency, monetary, r_score, f_score, m_score, segment, last_order_date, "createdAt")
        VALUES
            (gen_random_uuid()::text, :email, :recency_days, :frequency, :monetary,
             :r_score, :f_score, :m_score, :segment, :last_order_date, :created_at)
        ON CONFLICT (email) DO UPDATE SET
            recency_days = EXCLUDED.recency_days,
            frequency = EXCLUDED.frequency,
            monetary = EXCLUDED.monetary,
            r_score = EXCLUDED.r_score,
            f_score = EXCLUDED.f_score,
            m_score = EXCLUDED.m_score,
            segment = EXCLUDED.segment,
            last_order_date = EXCLUDED.last_order_date,
            "createdAt" = EXCLUDED."createdAt"
    """)

    # Make naive for SQLAlchemy DateTime mapping to naive Postgres column
    created_at = datetime.now(timezone.utc).replace(tzinfo=None)
    batch_size = 500
    total_upserted = 0

    for i in range(0, len(segments_data), batch_size):
        batch = segments_data[i:i + batch_size]
        for record in batch:
            record["created_at"] = created_at
        await analytics_db.execute(upsert_sql, batch)
        total_upserted += len(batch)

    await analytics_db.commit()
    logger.info(f"[RFM] Successfully upserted {total_upserted} customer RFM segments")

    # Log segment distribution
    segment_counts = {}
    for s in segments_data:
        segment_counts[s["segment"]] = segment_counts.get(s["segment"], 0) + 1
    logger.info(f"[RFM] Segment distribution: {segment_counts}")
