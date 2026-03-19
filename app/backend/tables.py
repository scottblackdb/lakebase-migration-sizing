"""
Table definitions for Lakebase Migration Sizing.
Canonical DDL (for reference / manual runs): see schema.sql in this directory.
"""
import psycopg2

from backend.config import settings
from backend.db import execute

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
}


def ensure_tables() -> None:
    # Create schema using a direct connection since it may not exist yet.
    conn = psycopg2.connect(
        host=settings.PG_HOST,
        port=settings.PG_PORT,
        dbname=settings.PG_DATABASE,
        user=settings.PG_USER,
        password=settings.PG_PASSWORD,
        sslmode="require",
    )
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
    except Exception:
        # Schema may already exist with correct permissions — proceed
        conn.rollback()
    finally:
        conn.close()

    s = settings.schema_prefix

    execute(f"""
        CREATE TABLE IF NOT EXISTS {s}analyses (
            analysis_id TEXT,
            group_name TEXT,
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
