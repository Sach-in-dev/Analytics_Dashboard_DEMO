-- Migration: Add search_analytics_snapshot table
-- This table stores pre-computed search analytics data across 8 sections as JSONB snapshots

CREATE TABLE IF NOT EXISTS public.search_analytics_snapshot (
    id TEXT PRIMARY KEY,
    snapshot_date DATE NOT NULL,
    top_keywords_data JSONB NOT NULL DEFAULT '[]'::JSONB,
    zero_result_data JSONB NOT NULL DEFAULT '[]'::JSONB,
    low_result_data JSONB NOT NULL DEFAULT '[]'::JSONB,
    high_exit_data JSONB NOT NULL DEFAULT '[]'::JSONB,
    brand_volume_data JSONB NOT NULL DEFAULT '[]'::JSONB,
    category_demand_data JSONB NOT NULL DEFAULT '[]'::JSONB,
    attributes_frequency_data JSONB NOT NULL DEFAULT '[]'::JSONB,
    new_vs_returning_data JSONB NOT NULL DEFAULT '[]'::JSONB,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Unique constraint on snapshot_date (one snapshot per day)
ALTER TABLE public.search_analytics_snapshot
    DROP CONSTRAINT IF EXISTS search_analytics_snapshot_date_key;
ALTER TABLE public.search_analytics_snapshot
    ADD CONSTRAINT search_analytics_snapshot_date_key UNIQUE (snapshot_date);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS search_analytics_snapshot_date_idx
    ON public.search_analytics_snapshot USING btree (snapshot_date);

ALTER TABLE public.search_analytics_snapshot OWNER TO postgres;
