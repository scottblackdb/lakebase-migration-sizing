-- DDL for Lakebase Migration Sizing app (matches backend/tables.py).
-- PostgreSQL database, schema: estimator.

CREATE SCHEMA IF NOT EXISTS estimator;
SET search_path TO estimator;

-- Analyses (one row per uploaded metrics run)
CREATE TABLE IF NOT EXISTS analyses (
    analysis_id TEXT,
    group_name TEXT,
    owner TEXT,
    server_name TEXT,
    granularity TEXT,
    start_time TEXT,
    end_time TEXT,
    created_at TEXT,
    sku_name TEXT,
    sku_tier TEXT,
    vm_type TEXT,
    vcores INT,
    memory_gb INT,
    storage_size_gb INT,
    region TEXT,
    ai_analysis TEXT
);

-- Existing deployments: add column if missing (PostgreSQL 11+)
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS owner TEXT;

-- Metric tables (one per metric type; rows keyed by analysis_id + timestamp)
CREATE TABLE IF NOT EXISTS metric_cpu_percent (
    analysis_id TEXT,
    timestamp TEXT,
    average DOUBLE PRECISION,
    maximum DOUBLE PRECISION,
    minimum DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS metric_memory_percent (
    analysis_id TEXT,
    timestamp TEXT,
    average DOUBLE PRECISION,
    maximum DOUBLE PRECISION,
    minimum DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS metric_storage_percent (
    analysis_id TEXT,
    timestamp TEXT,
    average DOUBLE PRECISION,
    maximum DOUBLE PRECISION,
    minimum DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS metric_storage_used (
    analysis_id TEXT,
    timestamp TEXT,
    average DOUBLE PRECISION,
    maximum DOUBLE PRECISION,
    minimum DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS metric_iops (
    analysis_id TEXT,
    timestamp TEXT,
    average DOUBLE PRECISION,
    maximum DOUBLE PRECISION,
    minimum DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS metric_read_iops (
    analysis_id TEXT,
    timestamp TEXT,
    average DOUBLE PRECISION,
    maximum DOUBLE PRECISION,
    minimum DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS metric_write_iops (
    analysis_id TEXT,
    timestamp TEXT,
    average DOUBLE PRECISION,
    maximum DOUBLE PRECISION,
    minimum DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS metric_xact_commit (
    analysis_id TEXT,
    timestamp TEXT,
    average DOUBLE PRECISION,
    maximum DOUBLE PRECISION,
    minimum DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS metric_blks_hit (
    analysis_id TEXT,
    timestamp TEXT,
    average DOUBLE PRECISION,
    maximum DOUBLE PRECISION,
    minimum DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS metric_blks_read (
    analysis_id TEXT,
    timestamp TEXT,
    average DOUBLE PRECISION,
    maximum DOUBLE PRECISION,
    minimum DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS metric_cache_hit_ratio (
    analysis_id TEXT,
    timestamp TEXT,
    average DOUBLE PRECISION,
    maximum DOUBLE PRECISION,
    minimum DOUBLE PRECISION
);
