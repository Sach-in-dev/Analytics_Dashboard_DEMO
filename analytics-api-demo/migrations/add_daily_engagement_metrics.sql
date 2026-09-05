-- Cache table for daily engagement metrics sourced from Umami.
-- Lets the Engagement page read from the analytics DB like every other metric.
CREATE TABLE IF NOT EXISTS daily_engagement_metrics (
    id                 VARCHAR PRIMARY KEY,
    date               TIMESTAMP NOT NULL,
    pageviews          INTEGER NOT NULL DEFAULT 0,
    sessions           INTEGER NOT NULL DEFAULT 0,
    visitors           INTEGER NOT NULL DEFAULT 0,
    bounces            INTEGER NOT NULL DEFAULT 0,
    total_time_seconds DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt"        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_engagement_metrics_date_key ON daily_engagement_metrics (date);
CREATE INDEX IF NOT EXISTS daily_engagement_metrics_date_idx ON daily_engagement_metrics (date);
