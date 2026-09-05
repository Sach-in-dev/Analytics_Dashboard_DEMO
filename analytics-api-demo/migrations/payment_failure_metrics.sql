-- Payment Failure Metrics table migration
-- Run this against the analytics DB to create the required table.
--
-- Docker: docker exec <analytics-postgres-container> psql -U postgres -d analytics_db -f /path/to/this.sql
-- Or run directly via the admin panel / psql shell.

CREATE TABLE IF NOT EXISTS payment_failure_metrics (
    id TEXT PRIMARY KEY,
    date DATE NOT NULL,
    total_attempts INTEGER NOT NULL DEFAULT 0,
    failed_payments INTEGER NOT NULL DEFAULT 0,
    failure_rate FLOAT NOT NULL DEFAULT 0.0,
    lost_gmv FLOAT NOT NULL DEFAULT 0.0,
    affected_customers INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT payment_failure_metrics_date_key UNIQUE (date)
);

CREATE INDEX IF NOT EXISTS payment_failure_metrics_date_idx ON payment_failure_metrics (date);
