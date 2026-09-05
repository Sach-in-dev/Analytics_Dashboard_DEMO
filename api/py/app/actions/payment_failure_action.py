"""Payment Failure Action — fetches order data from prod DB,
computes daily payment failure metrics (total attempts, failed, failure rate, lost GMV),
and upserts into the analytics DB.

Definition of a Payment Failure:
- A payment attempt was recorded in the `payment` table.
- Condition: The payment `status` is either `FAILED` (explicitly failed) or `PENDING` (abandoned/unresolved).
- We group by the `payment.created_at` date.
- We join with the `"order"` table to extract the `customer_id` for counting affected customers.

Recomputes last 30 days to capture late status resolutions.
"""

import logging
from datetime import datetime, timezone, date, timedelta
from app.utils.date import get_date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def process_payment_failure_metrics(prod_db: AsyncSession, analytics_db: AsyncSession):
    """Full payment failure pipeline: fetch prod orders → compute metrics per day → upsert snapshots.

    Recomputes the last 30 days to capture late payment resolutions.
    """
    logger.info("[PaymentFailure] Starting payment failure metrics processing")

    today = date.today()

    for i in range(1, 32):
        target_date = today - timedelta(days=i)
        await _process_day(prod_db, analytics_db, target_date)

    logger.info("[PaymentFailure] Completed payment failure metrics processing (last 30 days)")


async def _process_day(
    prod_db: AsyncSession,
    analytics_db: AsyncSession,
    target_date: date,
):
    """Compute payment failure metrics for a specific date and upsert into analytics DB."""
    date_range = get_date(date=target_date.isoformat())
    start_time = date_range["start_of_day"]
    end_time = date_range["end_of_day"]

    result = await prod_db.execute(
        text("""
            SELECT
                COUNT(p.id) AS total_attempts,
                COUNT(p.id) FILTER (
                    WHERE p.status IN ('FAILED', 'PENDING')
                ) AS failed_payments,
                COALESCE(SUM(p.amount) FILTER (
                    WHERE p.status IN ('FAILED', 'PENDING')
                ), 0) AS lost_gmv,
                COUNT(DISTINCT o.customer_id) FILTER (
                    WHERE p.status IN ('FAILED', 'PENDING')
                ) AS affected_customers
            FROM payment p
            LEFT JOIN "order" o ON p.order_id = o.id
            WHERE p.created_at >= :start_time
              AND p.created_at <= :end_time
        """),
        {
            "start_time": start_time,
            "end_time": end_time,
        },
    )
    row = result.one()

    total_attempts = int(row[0])
    failed_payments = int(row[1])
    lost_gmv = float(row[2])
    affected_customers = int(row[3])
    failure_rate = round((failed_payments / total_attempts) * 100, 2) if total_attempts > 0 else 0.0

    # Recovery: orders that had a FAILED/PENDING payment on this day
    # but also have a successful payment (any status NOT IN FAILED/PENDING) on the same order.
    recovery_result = await prod_db.execute(
        text("""
            WITH failed_orders AS (
                SELECT DISTINCT p.order_id
                FROM payment p
                WHERE p.created_at >= :start_time
                  AND p.created_at <= :end_time
                  AND p.status IN ('FAILED', 'PENDING')
                  AND p.order_id IS NOT NULL
            )
            SELECT
                COUNT(DISTINCT p2.order_id),
                COALESCE(SUM(p2.amount), 0)
            FROM failed_orders fo
            JOIN payment p2 ON p2.order_id = fo.order_id
                           AND p2.status NOT IN ('FAILED', 'PENDING')
        """),
        {"start_time": start_time, "end_time": end_time},
    )
    recovery_row = recovery_result.one()
    recovered_orders = int(recovery_row[0])
    recovered_gmv = float(recovery_row[1])

    # Upsert into analytics DB
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await analytics_db.execute(
        text("""
            INSERT INTO payment_failure_metrics
                (id, date, total_attempts, failed_payments, failure_rate, lost_gmv,
                 affected_customers, recovered_orders, recovered_gmv,
                 "createdAt", "updatedAt")
            VALUES
                (gen_random_uuid()::text, :date, :total_attempts, :failed_payments,
                 :failure_rate, :lost_gmv, :affected_customers,
                 :recovered_orders, :recovered_gmv, :now, :now)
            ON CONFLICT (date) DO UPDATE SET
                total_attempts    = EXCLUDED.total_attempts,
                failed_payments   = EXCLUDED.failed_payments,
                failure_rate      = EXCLUDED.failure_rate,
                lost_gmv          = EXCLUDED.lost_gmv,
                affected_customers = EXCLUDED.affected_customers,
                recovered_orders  = EXCLUDED.recovered_orders,
                recovered_gmv     = EXCLUDED.recovered_gmv,
                "updatedAt"       = EXCLUDED."updatedAt"
        """),
        {
            "date": target_date,
            "total_attempts": total_attempts,
            "failed_payments": failed_payments,
            "failure_rate": failure_rate,
            "lost_gmv": lost_gmv,
            "affected_customers": affected_customers,
            "recovered_orders": recovered_orders,
            "recovered_gmv": recovered_gmv,
            "now": now,
        }
    )

    # ── Breakdowns: by payment method + by failure reason ──
    # Stored in payment_failure_by_method / payment_failure_by_reason.
    # Same window (start_time/end_time) and same status definition
    # (FAILED, PENDING) as the daily summary above so totals reconcile.
    await _process_day_breakdowns(
        prod_db, analytics_db, target_date, start_time, end_time, now
    )

    await analytics_db.commit()

    logger.info(
        f"[PaymentFailure] {target_date}: {total_attempts} attempts, "
        f"{failed_payments} failures ({failure_rate}%), ₹{lost_gmv:,.0f} lost GMV, "
        f"{affected_customers} customers affected, "
        f"{recovered_orders} recovered (₹{recovered_gmv:,.0f})"
    )


async def _process_day_breakdowns(
    prod_db: AsyncSession,
    analytics_db: AsyncSession,
    target_date: date,
    start_time,
    end_time,
    now: datetime,
):
    """Compute and persist per-method and per-reason breakdowns for one day.

    Each daily run wipes the date's existing breakdown rows and re-inserts
    fresh ones (dimensions can change as new providers / error codes appear).
    """
    # ─── 1. BY METHOD: provider × payment_mode ───
    method_rows = (await prod_db.execute(
        text("""
            SELECT
                COALESCE(NULLIF(TRIM(p.provider_id), ''), 'unknown') AS provider,
                COALESCE(
                    NULLIF(TRIM(p.data->>'paymentMode'), ''),
                    NULLIF(TRIM(p.data->>'cardName'), ''),
                    'UNKNOWN'
                ) AS payment_mode,
                COUNT(p.id) AS attempts,
                COUNT(p.id) FILTER (WHERE p.status IN ('FAILED','PENDING')) AS failed,
                COALESCE(
                    SUM(p.amount) FILTER (WHERE p.status IN ('FAILED','PENDING')),
                    0
                ) AS lost_gmv
            FROM payment p
            WHERE p.created_at >= :start_time
              AND p.created_at <= :end_time
            GROUP BY 1, 2
        """),
        {"start_time": start_time, "end_time": end_time},
    )).all()

    await analytics_db.execute(
        text("DELETE FROM payment_failure_by_method WHERE date = :date"),
        {"date": target_date},
    )
    for r in method_rows:
        await analytics_db.execute(
            text("""
                INSERT INTO payment_failure_by_method
                    (id, date, provider, payment_mode, attempts, failed, lost_gmv,
                     "createdAt", "updatedAt")
                VALUES
                    (gen_random_uuid()::text, :date, :provider, :payment_mode,
                     :attempts, :failed, :lost_gmv, :now, :now)
            """),
            {
                "date": target_date,
                "provider": r[0],
                "payment_mode": r[1],
                "attempts": int(r[2]),
                "failed": int(r[3]),
                "lost_gmv": float(r[4]),
                "now": now,
            },
        )

    # ─── 2. BY REASON: error_code from metadata JSONB ───
    reason_rows = (await prod_db.execute(
        text("""
            SELECT
                COALESCE(NULLIF(TRIM(p.metadata->>'errorCode'), ''), 'UNKNOWN') AS error_code,
                COUNT(p.id) AS failed,
                COALESCE(SUM(p.amount), 0) AS lost_gmv,
                COUNT(DISTINCT o.customer_id) AS affected_customers
            FROM payment p
            LEFT JOIN "order" o ON p.order_id = o.id
            WHERE p.created_at >= :start_time
              AND p.created_at <= :end_time
              AND p.status IN ('FAILED','PENDING')
            GROUP BY 1
        """),
        {"start_time": start_time, "end_time": end_time},
    )).all()

    await analytics_db.execute(
        text("DELETE FROM payment_failure_by_reason WHERE date = :date"),
        {"date": target_date},
    )
    for r in reason_rows:
        await analytics_db.execute(
            text("""
                INSERT INTO payment_failure_by_reason
                    (id, date, error_code, failed, lost_gmv, affected_customers,
                     "createdAt", "updatedAt")
                VALUES
                    (gen_random_uuid()::text, :date, :error_code, :failed,
                     :lost_gmv, :affected_customers, :now, :now)
            """),
            {
                "date": target_date,
                "error_code": r[0],
                "failed": int(r[1]),
                "lost_gmv": float(r[2]),
                "affected_customers": int(r[3]),
                "now": now,
            },
        )
