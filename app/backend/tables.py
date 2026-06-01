"""
Table definitions for Lakebase Migration Sizing.
Canonical DDL (for reference / manual runs): see schema.sql in this directory.
"""
import logging

import psycopg.errors

from backend.config import settings
from backend.db import execute, fetchall, get_connection

logger = logging.getLogger(__name__)

METRIC_NAMES = [
    "cpu_percent",
    "memory_percent",
    "storage_percent",
    "storage_used",
    "iops",
    "read_iops",
    "write_iops",
    "xact_commit",
    "blks_hit",
    "blks_read",
    "cache_hit_ratio",
]

DISPLAY_NAMES = {
    "cpu_percent": "CPU Percent",
    "memory_percent": "Memory Percent",
    "storage_percent": "Storage Percent",
    "storage_used": "Storage Used (bytes)",
    "iops": "Disk IOPS",
    "read_iops": "Disk Read IOPS",
    "write_iops": "Disk Write IOPS",
    "xact_commit": "Transactions Committed Per Second",
    "blks_hit": "Buffer Cache Blocks Hit",
    "blks_read": "Disk Blocks Read",
    "cache_hit_ratio": "Buffer Cache Hit Ratio",
}


def _column_exists(table_schema: str, table_name: str, column_name: str) -> bool:
    rows = fetchall(
        """
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s AND column_name = %s
        LIMIT 1
        """,
        (table_schema, table_name, column_name),
    )
    return bool(rows)


def _ensure_analyses_owner_column(schema_prefix: str) -> None:
    if _column_exists(settings.PG_SCHEMA, "analyses", "owner"):
        return

    try:
        execute(
            f"ALTER TABLE {schema_prefix}analyses ADD COLUMN IF NOT EXISTS owner TEXT"
        )
    except psycopg.errors.InsufficientPrivilege:
        logger.warning(
            "ensure_tables: cannot add owner column to %sanalyses "
            "(table owned by another role). Run ALTER TABLE ... ADD COLUMN owner TEXT "
            "as the table owner or recreate tables in schema %s.",
            schema_prefix,
            settings.PG_SCHEMA,
        )


def ensure_tables() -> None:
    with get_connection() as conn:
        try:
            with conn.cursor() as cur:
                cur.execute(f"CREATE SCHEMA IF NOT EXISTS {settings.PG_SCHEMA}")
                cur.execute(
                    f"GRANT ALL ON SCHEMA {settings.PG_SCHEMA} TO {settings.PG_USER}"
                )
                cur.execute(
                    f"ALTER DEFAULT PRIVILEGES IN SCHEMA {settings.PG_SCHEMA} "
                    f"GRANT ALL ON TABLES TO {settings.PG_USER}"
                )
            conn.commit()
        except Exception as e:
            logger.debug(
                "ensure_tables: schema bootstrap skipped (%s)",
                e,
                exc_info=True,
            )
            conn.rollback()

    s = settings.schema_prefix

    execute(f"""
        CREATE TABLE IF NOT EXISTS {s}analyses (
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
        )
    """)

    _ensure_analyses_owner_column(s)

    for metric_name in METRIC_NAMES:
        execute(f"""
            CREATE TABLE IF NOT EXISTS {s}metric_{metric_name} (
                analysis_id TEXT,
                timestamp TEXT,
                average DOUBLE PRECISION,
                maximum DOUBLE PRECISION,
                minimum DOUBLE PRECISION
            )
        """)
