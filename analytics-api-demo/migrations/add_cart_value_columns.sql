-- Add cart value columns to daily_cart_metrics and monthly_cart_metrics
-- These store cart.total (in paise) summed by status

ALTER TABLE daily_cart_metrics
    ADD COLUMN IF NOT EXISTS total_cart_value INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS completed_cart_value INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS abandoned_cart_value INTEGER NOT NULL DEFAULT 0;

ALTER TABLE monthly_cart_metrics
    ADD COLUMN IF NOT EXISTS total_cart_value INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS completed_cart_value INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS abandoned_cart_value INTEGER NOT NULL DEFAULT 0;
