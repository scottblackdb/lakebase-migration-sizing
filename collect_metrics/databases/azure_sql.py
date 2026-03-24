"""
Azure SQL Database — Azure Monitor metrics export.

Uses Azure Resource Manager for database SKU / sizing and Azure Monitor metrics
for the **database** resource (``Microsoft.Sql/servers/databases``).

Prerequisites::

    pip install azure-identity azure-mgmt-monitor azure-mgmt-sql

Auth: DefaultAzureCredential (``az login``, managed identity, service principal env, …).

**Metric alignment with PostgreSQL export**

Most logical keys match :mod:`collect_metrics.databases.azure_postgres`. Azure SQL
Database does not expose PostgreSQL-style block / transaction counters at this
scope; those series are still emitted in the JSON with **empty** ``data`` arrays
so the upload schema stays consistent. I/O utilization is approximated where
possible using **Data IO %** and **Log IO %** (see ``METRICS`` comments).
"""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from collect_metrics.base import MetricsCollector

# Logical metric key -> Azure Monitor metric name, or None if not available (empty series).
# storage_percent: Azure removed the ``storage_percent`` Monitor metric for databases; we
# synthesize it from ``storage`` (bytes used) and ``max_size_bytes`` from ARM (see below).
# I/O: Azure SQL Database exposes IO as percentages, not raw IOPS; we map them to the same
# logical keys used elsewhere so charts show utilization on a 0–100 scale (see README).
METRICS: dict[str, Optional[str]] = {
    # Filled dynamically for cpu_percent: cpu_percent (vCore) or dtu_consumption_percent (DTU)
    "cpu_percent": None,
    "memory_percent": "sql_instance_memory_percent",
    "storage_percent": None,  # synthesized after storage_used is fetched
    "storage_used": "storage",
    "iops": None,
    "read_iops": "physical_data_read_percent",
    "write_iops": "log_write_percent",
    "xact_commit": None,
    "blks_hit": None,
    "blks_read": None,
}

DISPLAY_NAMES: dict[str, str] = {
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


def build_resource_id(
    subscription_id: str,
    resource_group: str,
    server_name: str,
    database_name: str,
) -> str:
    return (
        f"/subscriptions/{subscription_id}"
        f"/resourceGroups/{resource_group}"
        f"/providers/Microsoft.Sql/servers/{server_name}"
        f"/databases/{database_name}"
    )


def query_metric(
    client: Any,
    resource_uri: str,
    azure_metric_name: str,
    logical_key: str,
    start: datetime,
    end: datetime,
    granularity: str,
) -> list[dict]:
    """Query Azure Monitor; tag each row with logical metric key (upload JSON schema)."""
    timespan = f"{start.strftime('%Y-%m-%dT%H:%M:%SZ')}/{end.strftime('%Y-%m-%dT%H:%M:%SZ')}"

    response = client.metrics.list(
        resource_uri,
        metricnames=azure_metric_name,
        timespan=timespan,
        interval=granularity,
        aggregation="Average,Maximum,Minimum",
    )

    rows = []
    for metric in response.value:
        for ts in metric.timeseries:
            for dp in ts.data:
                rows.append(
                    {
                        "timestamp": dp.time_stamp.isoformat(),
                        "metric": logical_key,
                        "average": dp.average,
                        "maximum": dp.maximum,
                        "minimum": dp.minimum,
                    }
                )
    return rows


def query_metric_safe(
    client: Any,
    resource_uri: str,
    azure_metric_name: str,
    logical_key: str,
    start: datetime,
    end: datetime,
    granularity: str,
) -> list[dict]:
    try:
        return query_metric(
            client,
            resource_uri,
            azure_metric_name,
            logical_key,
            start,
            end,
            granularity,
        )
    except Exception as exc:  # noqa: BLE001 — surface provider errors to CLI
        print(f"  !! {logical_key} ({azure_metric_name}): {exc}")
        return []


def _is_dtu_service_objective(tier: str | None) -> bool:
    if not tier:
        return False
    t = tier.replace(" ", "").lower()
    return t in ("basic", "standard", "premium", "stretch", "datawarehouse")


def _cpu_azure_metric_name(service_tier: str | None) -> str:
    return (
        "dtu_consumption_percent"
        if _is_dtu_service_objective(service_tier)
        else "cpu_percent"
    )


def _valid_max_size_bytes_for_percent(max_size_bytes: int | None) -> bool:
    """True when ARM max size is a positive integer (synthesis denominator)."""
    if max_size_bytes is None:
        return False
    try:
        return int(max_size_bytes) > 0
    except (TypeError, ValueError):
        return False


def _pct_of_max(used: float | None, max_bytes: int) -> float | None:
    if used is None or max_bytes <= 0:
        return None
    try:
        p = 100.0 * float(used) / float(max_bytes)
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    return min(100.0, max(0.0, p))


def synthesize_storage_percent_rows(
    storage_used_rows: list[dict], max_size_bytes: int | None
) -> list[dict]:
    """Build storage_percent series from Monitor ``storage`` + ARM ``max_size_bytes``."""
    if not _valid_max_size_bytes_for_percent(max_size_bytes):
        return []
    assert max_size_bytes is not None
    denom = int(max_size_bytes)
    out: list[dict] = []
    for r in storage_used_rows:
        if r.get("metric") != "storage_used":
            continue
        avg = _pct_of_max(r.get("average"), denom)
        mx = _pct_of_max(r.get("maximum"), denom)
        mn = _pct_of_max(r.get("minimum"), denom)
        if avg is None and mx is None and mn is None:
            continue
        out.append(
            {
                "timestamp": r["timestamp"],
                "metric": "storage_percent",
                "average": avg,
                "maximum": mx,
                "minimum": mn,
            }
        )
    return out


def _parse_vcores_from_sql_sku(
    sku_name: str | None, service_tier: str | None, capacity: int | None
) -> int | None:
    """Best-effort vCore count from Hyperscale / GP / BC style SKU names."""
    if not sku_name:
        return None
    tier = (service_tier or "").replace(" ", "").lower()
    if _is_dtu_service_objective(service_tier):
        return None
    m = re.search(r"_(\d+)$", sku_name.strip())
    if m and tier in (
        "generalpurpose",
        "businesscritical",
        "hyperscale",
        "gp",
        "bc",
        "hs",
    ):
        return int(m.group(1))
    if capacity and tier in ("generalpurpose", "businesscritical", "hyperscale"):
        return int(capacity)
    return None


def _memory_gb_from_sql_sku(
    sku_name: str | None, service_tier: str | None, vcores: int | None
) -> int | None:
    """Same heuristics as flexible Postgres (GB per vCore by tier) when vCores known."""
    if not vcores:
        return None
    tier = (service_tier or "").replace(" ", "").lower()
    if tier in ("generalpurpose", "gp"):
        return vcores * 4
    if tier in ("businesscritical", "bc"):
        return vcores * 8
    if tier in ("hyperscale", "hs"):
        return vcores * 4
    return None


def get_database_config(
    credential: Any,
    subscription_id: str,
    resource_group: str,
    server_name: str,
    database_name: str,
) -> dict:
    from azure.mgmt.sql import SqlManagementClient

    sql_client = SqlManagementClient(credential, subscription_id)
    db = sql_client.databases.get(resource_group, server_name, database_name)
    sku = db.sku
    sku_name = sku.name if sku else None
    sku_tier = sku.tier if sku else None
    capacity = sku.capacity if sku else None
    vcores = _parse_vcores_from_sql_sku(sku_name, sku_tier, capacity)
    memory_gb = _memory_gb_from_sql_sku(sku_name, sku_tier, vcores)

    max_size_bytes = getattr(db, "max_size_bytes", None)
    storage_gb = None
    if max_size_bytes is not None:
        try:
            storage_gb = max(1, int(max_size_bytes // (1024**3)))
        except (TypeError, ValueError):
            storage_gb = None

    return {
        "sku_name": sku_name,
        "sku_tier": sku_tier,
        "vm_type": sku_name,
        "vcores": vcores,
        "memory_gb": memory_gb,
        "storage_size_gb": storage_gb,
        "max_size_bytes": max_size_bytes,
        "region": db.location,
        "azure_sql_server_name": server_name,
        "azure_sql_database_name": database_name,
    }


def export_metrics(
    subscription_id: str,
    resource_group: str,
    server_name: str,
    database_name: str,
    output_dir: str,
    granularity: str,
) -> None:
    from azure.identity import DefaultAzureCredential
    from azure.mgmt.monitor import MonitorManagementClient

    credential = DefaultAzureCredential()
    monitor = MonitorManagementClient(credential, subscription_id)

    resource_uri = build_resource_id(
        subscription_id, resource_group, server_name, database_name
    )

    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(days=90)

    os.makedirs(output_dir, exist_ok=True)

    print("Fetching database configuration ...")
    server_info = get_database_config(
        credential, subscription_id, resource_group, server_name, database_name
    )
    cpu_metric = _cpu_azure_metric_name(server_info.get("sku_tier"))
    print(
        f"  SKU: {server_info['sku_name']} ({server_info['sku_tier']}), "
        f"vCores: {server_info['vcores']}, Memory: {server_info.get('memory_gb') or '?'} GB, "
        f"Storage cap: {server_info['storage_size_gb']} GB, CPU metric: {cpu_metric}"
    )

    all_rows: list[dict] = []

    for logical_key, azure_name in METRICS.items():
        display = DISPLAY_NAMES[logical_key]
        if logical_key == "storage_percent":
            # Not a Monitor metric anymore; filled after ``storage`` + max_size_bytes.
            continue
        if logical_key == "cpu_percent":
            rows = query_metric_safe(
                monitor,
                resource_uri,
                cpu_metric,
                logical_key,
                start_time,
                end_time,
                granularity,
            )
            if not rows and cpu_metric != "cpu_percent":
                print("  (retrying cpu_percent with cpu_percent metric ...)")
                rows = query_metric_safe(
                    monitor,
                    resource_uri,
                    "cpu_percent",
                    logical_key,
                    start_time,
                    end_time,
                    granularity,
                )
        elif logical_key == "iops":
            # Not exposed as a single series; optional composite could be added later.
            rows = []
        elif azure_name is None:
            rows = []
        else:
            rows = query_metric_safe(
                monitor,
                resource_uri,
                azure_name,
                logical_key,
                start_time,
                end_time,
                granularity,
            )
        print(f"Querying {display} ... -> {len(rows)} data points")
        all_rows.extend(rows)

    max_b = server_info.get("max_size_bytes")
    used_count = sum(1 for r in all_rows if r.get("metric") == "storage_used")
    pct_rows = synthesize_storage_percent_rows(all_rows, max_b)
    if pct_rows:
        print(
            f"Querying {DISPLAY_NAMES['storage_percent']} (from storage / max_size_bytes) "
            f"... -> {len(pct_rows)} data points"
        )
        all_rows.extend(pct_rows)
    elif used_count and not _valid_max_size_bytes_for_percent(max_b):
        print(
            "  !! storage_percent: skipped (max_size_bytes missing or not a positive value; "
            "cannot derive percent from storage metric)"
        )

    export_server_name = f"{server_name}.{database_name}"

    output = {
        "server_name": export_server_name,
        "granularity": granularity,
        "start_time": start_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end_time": end_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "server_config": server_info,
        "metrics": {},
    }
    for logical_key, display_name in DISPLAY_NAMES.items():
        metric_rows = [r for r in all_rows if r["metric"] == logical_key]
        output["metrics"][logical_key] = {
            "display_name": display_name,
            "data_points": len(metric_rows),
            "data": metric_rows,
        }

    safe_file = database_name.replace("/", "_").replace("\\", "_")
    output_path = os.path.join(output_dir, f"{server_name}_{safe_file}_metrics_90d.json")
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nMetrics saved to {output_path}")


class AzureSqlCollector(MetricsCollector):
    provider_id = "azure-sql"
    description = "Azure SQL Database (Azure Monitor, ~90 days)"

    @classmethod
    def register_arguments(cls, parser: argparse.ArgumentParser) -> None:
        parser.add_argument("--subscription-id", required=True, help="Azure subscription ID")
        parser.add_argument("--resource-group", required=True, help="Resource group name")
        parser.add_argument(
            "--server-name",
            required=True,
            help="Logical SQL server name (short name, not FQDN)",
        )
        parser.add_argument(
            "--database-name",
            required=True,
            help="Database name on that server",
        )
        parser.add_argument(
            "--output-dir",
            default="./output",
            help="Directory for JSON output (default: ./output)",
        )
        parser.add_argument(
            "--granularity",
            default="PT1H",
            help="ISO 8601 interval (default: PT1H). Examples: PT5M, PT1H, P1D",
        )

    @classmethod
    def run(cls, args: argparse.Namespace) -> None:
        export_metrics(
            subscription_id=args.subscription_id,
            resource_group=args.resource_group,
            server_name=args.server_name,
            database_name=args.database_name,
            output_dir=args.output_dir,
            granularity=args.granularity,
        )
