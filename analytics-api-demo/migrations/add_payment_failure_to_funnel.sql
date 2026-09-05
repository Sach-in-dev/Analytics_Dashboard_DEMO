-- Migration: Add payment_failure_users to customer_funnel_metrics

ALTER TABLE customer_funnel_metrics
ADD COLUMN IF NOT EXISTS payment_failure_users INTEGER NOT NULL DEFAULT 0;
