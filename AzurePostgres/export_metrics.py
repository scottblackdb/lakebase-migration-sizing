#!/usr/bin/env python3
"""
Export the past 90 days of CPU, Memory, and Disk metrics
for an Azure Database for PostgreSQL Flexible Server using Azure Monitor.

Prerequisites:
    pip install azure-identity azure-mgmt-monitor azure-mgmt-rdbms

Authentication:
    Uses DefaultAzureCredential (works with az login, managed identity,
    service principal env vars, etc.)

Usage:
    python export_metrics.py \
        --subscription-id <sub-id> \
        --resource-group <rg-name> \
        --server-name <pg-server-name> \
        [--output-dir ./output] \
        [--granularity PT1H]
"""

import argparse
import json
import os
import re
from datetime import datetime, timedelta, timezone

from azure.identity import DefaultAzureCredential
from azure.mgmt.monitor import MonitorManagementClient
from azure.mgmt.rdbms.postgresql_flexibleservers import PostgreSQLManagementClient


# Azure Monitor metric names for PostgreSQL Flexible Server
METRICS = {
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
    return (
        f"/subscriptions/{subscription_id}"
        f"/resourceGroups/{resource_group}"
        f"/providers/Microsoft.DBforPostgreSQL/flexibleServers/{server_name}"
    )


def query_metric(
    client: MonitorManagementClient,
    resource_uri: str,
    metric_name: str,
    start: datetime,
    end: datetime,
    granularity: str,
) -> list[dict]:
    """Query a single metric and return rows as dicts."""
    timespan = f"{start.strftime('%Y-%m-%dT%H:%M:%SZ')}/{end.strftime('%Y-%m-%dT%H:%M:%SZ')}"

    response = client.metrics.list(
        resource_uri,
        metricnames=metric_name,
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
                        "metric": metric_name,
                        "average": dp.average,
                        "maximum": dp.maximum,
                        "minimum": dp.minimum,
                    }
                )
    return rows


def _parse_vcores_from_sku(sku_name: str) -> int | None:
    """Extract vCores from Azure SKU name (e.g., Standard_D4ds_v5 -> 4)."""
    match = re.search(r"Standard_[A-Z](\d+)", sku_name)
    if match:
        return int(match.group(1))
    return None


def _parse_vm_type_from_sku(sku_name: str) -> str | None:
    """Extract VM type from Azure SKU name (e.g., Standard_D4ds_v5 -> D4ds_v5)."""
    if sku_name and sku_name.startswith("Standard_"):
        return sku_name[len("Standard_"):]
    return sku_name


def get_server_config(
    credential: DefaultAzureCredential,
    subscription_id: str,
    resource_group: str,
    server_name: str,
) -> dict:
    """Fetch server SKU details including vCores."""
    pg_client = PostgreSQLManagementClient(credential, subscription_id)
    server = pg_client.servers.get(resource_group, server_name)
    sku_name = server.sku.name if server.sku else None
    return {
        "sku_name": sku_name,
        "sku_tier": server.sku.tier if server.sku else None,
        "vm_type": _parse_vm_type_from_sku(sku_name) if sku_name else None,
        "vcores": _parse_vcores_from_sku(sku_name) if sku_name else None,
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
    credential = DefaultAzureCredential()
    client = MonitorManagementClient(credential, subscription_id)

    resource_uri = build_resource_id(subscription_id, resource_group, server_name)

    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(days=90)

    os.makedirs(output_dir, exist_ok=True)

    print("Fetching server configuration ...")
    server_info = get_server_config(credential, subscription_id, resource_group, server_name)
    print(f"  SKU: {server_info['sku_name']} ({server_info['sku_tier']}), vCores: {server_info['vcores']}, Storage: {server_info['storage_size_gb']} GB")

    all_rows = []
    for metric_name, display_name in METRICS.items():
        print(f"Querying {display_name} ({metric_name}) ...")
        rows = query_metric(client, resource_uri, metric_name, start_time, end_time, granularity)
        all_rows.extend(rows)
        print(f"  -> {len(rows)} data points")

    if not all_rows:
        print("No data returned. Verify the resource exists and metrics are available.")
        return

    # Organize data by metric name
    output = {
        "server_name": server_name,
        "granularity": granularity,
        "start_time": start_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end_time": end_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "server_config": server_info,
        "metrics": {},
    }
    for metric_name, display_name in METRICS.items():
        metric_rows = [r for r in all_rows if r["metric"] == metric_name]
        output["metrics"][metric_name] = {
            "display_name": display_name,
            "data_points": len(metric_rows),
            "data": metric_rows,
        }

    output_path = os.path.join(output_dir, f"{server_name}_metrics_90d.json")
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nMetrics saved to {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Export 90 days of CPU, Memory, and Disk metrics for Azure PostgreSQL Flexible Server"
    )
    parser.add_argument("--subscription-id", required=True, help="Azure subscription ID")
    parser.add_argument("--resource-group", required=True, help="Resource group name")
    parser.add_argument("--server-name", required=True, help="PostgreSQL Flexible Server name")
    parser.add_argument("--output-dir", default="./output", help="Directory for JSON output (default: ./output)")
    parser.add_argument(
        "--granularity",
        default="PT1H",
        help="Time granularity in ISO 8601 duration (default: PT1H = 1 hour). Examples: PT5M, PT1H, P1D",
    )
    args = parser.parse_args()

    export_metrics(
        subscription_id=args.subscription_id,
        resource_group=args.resource_group,
        server_name=args.server_name,
        output_dir=args.output_dir,
        granularity=args.granularity,
    )


if __name__ == "__main__":
    main()
