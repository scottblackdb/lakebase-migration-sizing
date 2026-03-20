"""
Azure Database for PostgreSQL — Azure Monitor metrics export.

Uses the Azure management API and Monitor metrics for the PostgreSQL server
resource in your subscription.

Prerequisites:
    pip install azure-identity azure-mgmt-monitor azure-mgmt-rdbms

Auth: DefaultAzureCredential (``az login``, managed identity, service principal env, …).
"""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from collect_metrics.base import MetricsCollector

# Logical metric key -> Azure Monitor metric name (as shown in portal / REST)
METRICS: dict[str, str] = {
    "cpu_percent": "cpu_percent",
    "memory_percent": "memory_percent",
    "storage_percent": "storage_percent",
    "storage_used": "storage_used",
    "iops": "iops",
    "read_iops": "read_iops",
    "write_iops": "write_iops",
    "xact_commit": "xact_commit",
    "blks_hit": "blks_hit",
    "blks_read": "blks_read",
}

# Human-readable labels for JSON output (aligned with AWS exporter)
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


def build_resource_id(subscription_id: str, resource_group: str, server_name: str) -> str:
    # Required ARM segment for this PostgreSQL offering (Azure API).
    return (
        f"/subscriptions/{subscription_id}"
        f"/resourceGroups/{resource_group}"
        f"/providers/Microsoft.DBforPostgreSQL/flexibleServers/{server_name}"
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


def _parse_vcores_from_sku(sku_name: str) -> int | None:
    match = re.search(r"Standard_[A-Z](\d+)", sku_name)
    if match:
        return int(match.group(1))
    return None


def _parse_vm_type_from_sku(sku_name: str) -> str | None:
    if sku_name and sku_name.startswith("Standard_"):
        return sku_name[len("Standard_") :]
    return sku_name


BURSTABLE_SKU_MEMORY_GB = {
    "B1MS": 2,
    "B2S": 4,
    "B2MS": 8,
    "B4MS": 16,
    "B8MS": 32,
    "B12MS": 48,
    "B16MS": 64,
}


def _parse_memory_gb_from_sku(
    sku_name: str | None, sku_tier: str | None, vcores: int | None
) -> int | None:
    """Derive VM memory (GiB) from Azure SKU name/tier. Returns None if unknown."""
    if not sku_name:
        return None
    sku_upper = sku_name.strip().upper()
    tier = (sku_tier or "").strip().lower().replace(" ", "")
    if tier == "burstable":
        if sku_upper in BURSTABLE_SKU_MEMORY_GB:
            return BURSTABLE_SKU_MEMORY_GB[sku_upper]
        m = re.match(r"B(\d+)(?:MS|S)$", sku_upper)
        if m:
            n = int(m.group(1))
            if n <= 2:
                return 4 if n == 2 else 2
            return n * 4
        return None
    if tier == "generalpurpose":
        return (vcores * 4) if vcores else None
    if tier == "memoryoptimized":
        return (vcores * 8) if vcores else None
    if vcores and (sku_upper.startswith("STANDARD_") or "D" in sku_upper):
        return vcores * 4
    return None


def get_server_config(
    credential: Any,
    subscription_id: str,
    resource_group: str,
    server_name: str,
) -> dict:
    from azure.mgmt.rdbms.postgresql_flexibleservers import PostgreSQLManagementClient

    pg_client = PostgreSQLManagementClient(credential, subscription_id)
    server = pg_client.servers.get(resource_group, server_name)
    sku_name = server.sku.name if server.sku else None
    sku_tier = server.sku.tier if server.sku else None
    vcores = _parse_vcores_from_sku(sku_name) if sku_name else None
    memory_gb = _parse_memory_gb_from_sku(sku_name, sku_tier, vcores)
    return {
        "sku_name": sku_name,
        "sku_tier": sku_tier,
        "vm_type": _parse_vm_type_from_sku(sku_name) if sku_name else None,
        "vcores": vcores,
        "memory_gb": memory_gb,
        "storage_size_gb": server.storage.storage_size_gb if server.storage else None,
        "region": server.location,
    }


def export_metrics(
    subscription_id: str,
    resource_group: str,
    server_name: str,
    output_dir: str,
    granularity: str,
) -> None:
    from azure.identity import DefaultAzureCredential
    from azure.mgmt.monitor import MonitorManagementClient

    credential = DefaultAzureCredential()
    client = MonitorManagementClient(credential, subscription_id)

    resource_uri = build_resource_id(subscription_id, resource_group, server_name)

    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(days=90)

    os.makedirs(output_dir, exist_ok=True)

    print("Fetching server configuration ...")
    server_info = get_server_config(credential, subscription_id, resource_group, server_name)
    print(
        f"  SKU: {server_info['sku_name']} ({server_info['sku_tier']}), "
        f"vCores: {server_info['vcores']}, Memory: {server_info.get('memory_gb') or '?'} GB, "
        f"Storage: {server_info['storage_size_gb']} GB"
    )

    all_rows: list[dict] = []
    for logical_key, azure_name in METRICS.items():
        display = DISPLAY_NAMES[logical_key]
        print(f"Querying {display} ({azure_name}) ...")
        rows = query_metric(
            client,
            resource_uri,
            azure_name,
            logical_key,
            start_time,
            end_time,
            granularity,
        )
        all_rows.extend(rows)
        print(f"  -> {len(rows)} data points")

    if not all_rows:
        print("No data returned. Verify the resource exists and metrics are available.")
        return

    output = {
        "server_name": server_name,
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

    output_path = os.path.join(output_dir, f"{server_name}_metrics_90d.json")
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nMetrics saved to {output_path}")


class AzurePostgresCollector(MetricsCollector):
    provider_id = "azure-postgres"
    description = "Azure Database for PostgreSQL (Azure Monitor, ~90 days)"

    @classmethod
    def register_arguments(cls, parser: argparse.ArgumentParser) -> None:
        parser.add_argument("--subscription-id", required=True, help="Azure subscription ID")
        parser.add_argument("--resource-group", required=True, help="Resource group name")
        parser.add_argument(
            "--server-name",
            required=True,
            help="PostgreSQL server name in Azure",
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
            output_dir=args.output_dir,
            granularity=args.granularity,
        )
