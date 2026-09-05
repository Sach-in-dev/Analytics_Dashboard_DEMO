-- Customer LTV by Segment table
-- Stores aggregated LTV metrics per RFM customer segment

CREATE TABLE IF NOT EXISTS customer_ltv_by_segment (
    id VARCHAR NOT NULL PRIMARY KEY,
    segment VARCHAR NOT NULL,
    total_customers INTEGER NOT NULL DEFAULT 0,
    total_revenue DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    avg_ltv DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT customer_ltv_by_segment_segment_key UNIQUE (segment)
);

CREATE INDEX IF NOT EXISTS customer_ltv_by_segment_segment_idx
    ON customer_ltv_by_segment (segment);
