-- DDL for Lakebase Migration Sizing app (matches backend/tables.py).
-- Schema: use main.default or set via env CATALOG and SCHEMA.

-- Analyses (one row per uploaded metrics run)
CREATE TABLE IF NOT EXISTS main.default.analyses (
    analysis_id STRING,
    group_name STRING,
    server_name STRING,
    granularity STRING,
    start_time STRING,
    end_time STRING,
    created_at STRING,
    sku_name STRING,
    sku_tier STRING,
    vm_type STRING,
    vcores INT,
    storage_size_gb INT,
    region STRING,
    ai_analysis STRING
);

-- Metric tables (one per metric type; rows keyed by analysis_id + timestamp)
CREATE TABLE IF NOT EXISTS main.default.metric_cpu_percent (
    analysis_id STRING,
    timestamp STRING,
    average DOUBLE,
    maximum DOUBLE,
    minimum DOUBLE
);

CREATE TABLE IF NOT EXISTS main.default.metric_memory_percent (
    analysis_id STRING,
    timestamp STRING,
    average DOUBLE,
    maximum DOUBLE,
    minimum DOUBLE
);

CREATE TABLE IF NOT EXISTS main.default.metric_storage_percent (
    analysis_id STRING,
    timestamp STRING,
    average DOUBLE,
    maximum DOUBLE,
    minimum DOUBLE
);

CREATE TABLE IF NOT EXISTS main.default.metric_storage_used (
    analysis_id STRING,
    timestamp STRING,
    average DOUBLE,
    maximum DOUBLE,
    minimum DOUBLE
);

CREATE TABLE IF NOT EXISTS main.default.metric_iops (
    analysis_id STRING,
    timestamp STRING,
    average DOUBLE,
    maximum DOUBLE,
    minimum DOUBLE
);

CREATE TABLE IF NOT EXISTS main.default.metric_read_iops (
    analysis_id STRING,
    timestamp STRING,
    average DOUBLE,
    maximum DOUBLE,
    minimum DOUBLE
);

CREATE TABLE IF NOT EXISTS main.default.metric_write_iops (
    analysis_id STRING,
    timestamp STRING,
    average DOUBLE,
    maximum DOUBLE,
    minimum DOUBLE
);

CREATE TABLE IF NOT EXISTS main.default.metric_xact_commit (
    analysis_id STRING,
    timestamp STRING,
    average DOUBLE,
    maximum DOUBLE,
    minimum DOUBLE
);

CREATE TABLE IF NOT EXISTS main.default.metric_blks_hit (
    analysis_id STRING,
    timestamp STRING,
    average DOUBLE,
    maximum DOUBLE,
    minimum DOUBLE
);

CREATE TABLE IF NOT EXISTS main.default.metric_blks_read (
    analysis_id STRING,
    timestamp STRING,
    average DOUBLE,
    maximum DOUBLE,
    minimum DOUBLE
);
