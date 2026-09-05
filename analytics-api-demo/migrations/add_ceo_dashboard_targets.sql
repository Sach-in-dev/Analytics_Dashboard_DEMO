CREATE TABLE ceo_dashboard_targets (
    id VARCHAR PRIMARY KEY,
    metric_key VARCHAR NOT NULL UNIQUE,
    target_value DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE ceo_dashboard_targets ADD CONSTRAINT ceo_dashboard_targets_metric_key UNIQUE (metric_key);

-- Initialize default targets
INSERT INTO ceo_dashboard_targets (id, metric_key, target_value) VALUES
    (gen_random_uuid()::varchar, 'gmv', 20000000),
    (gen_random_uuid()::varchar, 'cac', 450),
    (gen_random_uuid()::varchar, 'conversion_rate', 2.1),
    (gen_random_uuid()::varchar, 'aov', 1600),
    (gen_random_uuid()::varchar, 'rpr_60d', 35),
    (gen_random_uuid()::varchar, 'dead_inventory', 10)
ON CONFLICT (metric_key) DO NOTHING;
