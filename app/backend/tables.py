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
}


def ensure_tables() -> None:
    schema = settings.full_schema

    execute(f"""
        CREATE TABLE IF NOT EXISTS {schema}.analyses (
            analysis_id STRING,
            server_name STRING,
            subscription_id STRING,
            resource_group STRING,
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
        )
    """)

    for metric_name in METRIC_NAMES:
        execute(f"""
            CREATE TABLE IF NOT EXISTS {schema}.metric_{metric_name} (
                analysis_id STRING,
                timestamp STRING,
                average DOUBLE,
                maximum DOUBLE,
                minimum DOUBLE
            )
        """)
