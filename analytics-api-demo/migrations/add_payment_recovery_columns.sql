-- Add recovered_orders and recovered_gmv columns to payment_failure_metrics
-- These track orders that had a failed payment but were later paid successfully.

ALTER TABLE payment_failure_metrics
    ADD COLUMN IF NOT EXISTS recovered_orders INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS recovered_gmv DOUBLE PRECISION NOT NULL DEFAULT 0.0;
