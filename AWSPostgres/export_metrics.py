#!/usr/bin/env python3
"""
Export the past 90 days of CPU, Memory, and Disk metrics
for an Amazon RDS for PostgreSQL instance using CloudWatch.

Prerequisites:
    pip install boto3

Authentication:
    Uses the default boto3 credential chain (works with aws configure,
    environment variables, IAM roles, SSO profiles, etc.)

Usage:
    python export_metrics.py \
        --db-instance-id <instance-id> \
        [--region us-east-1] \
        [--output-dir ./output] \
        [--granularity 3600]
"""

import argparse
import json
import os
from datetime import datetime, timedelta, timezone

import boto3


# CloudWatch metric mappings: (namespace, metric_name, stat_extra)
# We map the same logical metrics as the Azure script.
# Some metrics come from the "AWS/RDS" namespace, others from
# Performance Insights (which we approximate via CloudWatch).
METRICS = {
    "cpu_percent": {
        "display_name": "CPU Percent",
        "namespace": "AWS/RDS",
        "metric_name": "CPUUtilization",
    },
    "memory_percent": {
        "display_name": "Memory Percent",
        "namespace": "AWS/RDS",
        "metric_name": "FreeableMemory",
        "transform": "freeable_memory_to_percent",
    },
    "storage_percent": {
        "display_name": "Storage Percent",
        "namespace": "AWS/RDS",
        "metric_name": "FreeStorageSpace",
        "transform": "free_storage_to_percent",
    },
    "storage_used": {
        "display_name": "Storage Used (bytes)",
        "namespace": "AWS/RDS",
        "metric_name": "FreeStorageSpace",
        "transform": "free_storage_to_used",
    },
    "iops": {
        "display_name": "Disk IOPS",
        "namespace": "AWS/RDS",
        "metric_name": "ReadIOPS",  # We'll combine Read + Write
        "combined_with": "WriteIOPS",
    },
    "read_iops": {
        "display_name": "Disk Read IOPS",
        "namespace": "AWS/RDS",
        "metric_name": "ReadIOPS",
    },
    "write_iops": {
        "display_name": "Disk Write IOPS",
        "namespace": "AWS/RDS",
        "metric_name": "WriteIOPS",
    },
    "xact_commit": {
        "display_name": "Transactions Committed Per Second",
        "namespace": "AWS/RDS",
        "metric_name": "DatabaseConnections",
        "note": "RDS does not expose xact_commit directly; using DatabaseConnections as proxy",
    },
    "blks_hit": {
        "display_name": "Buffer Cache Blocks Hit",
        "namespace": "AWS/RDS",
        "metric_name": "BufferCacheHitRatio",
        "note": "RDS exposes cache hit ratio rather than raw block counts",
    },
    "blks_read": {
        "display_name": "Disk Blocks Read",
        "namespace": "AWS/RDS",
        "metric_name": "DiskQueueDepth",
        "note": "RDS does not expose blks_read directly; using DiskQueueDepth as proxy",
    },
}

# RDS instance class -> (vCPUs, memory_gb)
# Common instance types for RDS PostgreSQL
INSTANCE_TYPE_SPECS = {
    # Burstable
    "db.t3.micro": (2, 1),
    "db.t3.small": (2, 2),
    "db.t3.medium": (2, 4),
    "db.t3.large": (2, 8),
    "db.t3.xlarge": (4, 16),
    "db.t3.2xlarge": (8, 32),
    "db.t4g.micro": (2, 1),
    "db.t4g.small": (2, 2),
    "db.t4g.medium": (2, 4),
    "db.t4g.large": (2, 8),
    "db.t4g.xlarge": (4, 16),
    "db.t4g.2xlarge": (8, 32),
    # General Purpose
    "db.m5.large": (2, 8),
    "db.m5.xlarge": (4, 16),
    "db.m5.2xlarge": (8, 32),
    "db.m5.4xlarge": (16, 64),
    "db.m5.8xlarge": (32, 128),
    "db.m5.12xlarge": (48, 192),
    "db.m5.16xlarge": (64, 256),
    "db.m5.24xlarge": (96, 384),
    "db.m6g.large": (2, 8),
    "db.m6g.xlarge": (4, 16),
    "db.m6g.2xlarge": (8, 32),
    "db.m6g.4xlarge": (16, 64),
    "db.m6g.8xlarge": (32, 128),
    "db.m6g.12xlarge": (48, 192),
    "db.m6g.16xlarge": (64, 256),
    "db.m6i.large": (2, 8),
    "db.m6i.xlarge": (4, 16),
    "db.m6i.2xlarge": (8, 32),
    "db.m6i.4xlarge": (16, 64),
    "db.m6i.8xlarge": (32, 128),
    "db.m6i.12xlarge": (48, 192),
    "db.m6i.16xlarge": (64, 256),
    "db.m7g.large": (2, 8),
    "db.m7g.xlarge": (4, 16),
    "db.m7g.2xlarge": (8, 32),
    "db.m7g.4xlarge": (16, 64),
    "db.m7g.8xlarge": (32, 128),
    "db.m7g.12xlarge": (48, 192),
    "db.m7g.16xlarge": (64, 256),
    # Memory Optimized
    "db.r5.large": (2, 16),
    "db.r5.xlarge": (4, 32),
    "db.r5.2xlarge": (8, 64),
    "db.r5.4xlarge": (16, 128),
    "db.r5.8xlarge": (32, 256),
    "db.r5.12xlarge": (48, 384),
    "db.r5.16xlarge": (64, 512),
    "db.r5.24xlarge": (96, 768),
    "db.r6g.large": (2, 16),
    "db.r6g.xlarge": (4, 32),
    "db.r6g.2xlarge": (8, 64),
    "db.r6g.4xlarge": (16, 128),
    "db.r6g.8xlarge": (32, 256),
    "db.r6g.12xlarge": (48, 384),
    "db.r6g.16xlarge": (64, 512),
    "db.r6i.large": (2, 16),
    "db.r6i.xlarge": (4, 32),
    "db.r6i.2xlarge": (8, 64),
    "db.r6i.4xlarge": (16, 128),
    "db.r6i.8xlarge": (32, 256),
    "db.r6i.12xlarge": (48, 384),
    "db.r6i.16xlarge": (64, 512),
    "db.r7g.large": (2, 16),
    "db.r7g.xlarge": (4, 32),
    "db.r7g.2xlarge": (8, 64),
    "db.r7g.4xlarge": (16, 128),
    "db.r7g.8xlarge": (32, 256),
    "db.r7g.12xlarge": (48, 384),
    "db.r7g.16xlarge": (64, 512),
}


def _parse_vcores(instance_class: str) -> int | None:
    """Extract vCPU count from RDS instance class."""
    if instance_class in INSTANCE_TYPE_SPECS:
        return INSTANCE_TYPE_SPECS[instance_class][0]
    # Fallback: estimate from size suffix
    size_map = {
        "micro": 2, "small": 2, "medium": 2,
        "large": 2, "xlarge": 4, "2xlarge": 8,
        "4xlarge": 16, "8xlarge": 32, "12xlarge": 48,
        "16xlarge": 64, "24xlarge": 96,
    }
    parts = instance_class.split(".")
    if len(parts) == 3:
        return size_map.get(parts[2])
    return None


def _parse_memory_gb(instance_class: str) -> int | None:
    """Get memory in GiB from RDS instance class."""
    if instance_class in INSTANCE_TYPE_SPECS:
        return INSTANCE_TYPE_SPECS[instance_class][1]
    return None


def _get_sku_tier(instance_class: str) -> str | None:
    """Determine tier from instance class prefix."""
    if not instance_class:
        return None
    parts = instance_class.split(".")
    if len(parts) < 2:
        return None
    family = parts[1]
    if family.startswith("t"):
        return "Burstable"
    if family.startswith("m"):
        return "General Purpose"
    if family.startswith("r") or family.startswith("x"):
        return "Memory Optimized"
    return None


def get_server_config(rds_client, db_instance_id: str) -> dict:
    """Fetch RDS instance or Aurora cluster details including vCores and memory.

    Tries describe_db_instances first; if the identifier is not found,
    falls back to describe_db_clusters (Aurora). For Aurora clusters the
    first writer instance is used for instance-class details, and CloudWatch
    metrics should be queried per-instance (returned in 'cw_instance_id').
    """
    # Try as a standalone RDS instance first
    try:
        response = rds_client.describe_db_instances(DBInstanceIdentifier=db_instance_id)
        instance = response["DBInstances"][0]
        instance_class = instance.get("DBInstanceClass", "")
        vcores = _parse_vcores(instance_class)
        memory_gb = _parse_memory_gb(instance_class)
        storage_gb = instance.get("AllocatedStorage")

        return {
            "sku_name": instance_class,
            "sku_tier": _get_sku_tier(instance_class),
            "vm_type": instance_class.replace("db.", ""),
            "vcores": vcores,
            "memory_gb": memory_gb,
            "storage_size_gb": storage_gb,
            "region": instance.get("AvailabilityZone", "")[:-1],
            "engine": instance.get("Engine"),
            "engine_version": instance.get("EngineVersion"),
            "multi_az": instance.get("MultiAZ", False),
            "storage_type": instance.get("StorageType"),
            "is_cluster": False,
            "cw_instance_id": db_instance_id,
        }
    except rds_client.exceptions.DBInstanceNotFoundFault:
        pass

    # Fall back to Aurora cluster
    try:
        response = rds_client.describe_db_clusters(DBClusterIdentifier=db_instance_id)
    except rds_client.exceptions.DBClusterNotFoundFault:
        raise ValueError(
            f"'{db_instance_id}' was not found as an RDS instance or Aurora cluster "
            f"in this account/region. Verify the identifier and region are correct."
        )

    cluster = response["DBClusters"][0]
    members = cluster.get("DBClusterMembers", [])

    # Find the writer instance for class details
    writer_id = None
    for m in members:
        if m.get("IsClusterWriter"):
            writer_id = m["DBInstanceIdentifier"]
            break
    if not writer_id and members:
        writer_id = members[0]["DBInstanceIdentifier"]

    instance_class = ""
    vcores = None
    memory_gb = None
    if writer_id:
        try:
            inst_resp = rds_client.describe_db_instances(DBInstanceIdentifier=writer_id)
            inst = inst_resp["DBInstances"][0]
            instance_class = inst.get("DBInstanceClass", "")
            vcores = _parse_vcores(instance_class)
            memory_gb = _parse_memory_gb(instance_class)
        except Exception:
            pass

    # Aurora Serverless v2 — extract scaling config
    sv2 = cluster.get("ServerlessV2ScalingConfiguration")
    if sv2 and not vcores:
        # Max ACU: each ACU ≈ 2 GiB RAM, ~0.5 vCPU
        max_acu = sv2.get("MaxCapacity", 0)
        vcores = max(1, int(max_acu * 0.5))
        memory_gb = int(max_acu * 2)

    storage_gb = cluster.get("AllocatedStorage")

    member_ids = [m["DBInstanceIdentifier"] for m in members]
    print(f"  Aurora cluster with {len(members)} member(s): {member_ids}")
    if writer_id:
        print(f"  Using writer instance '{writer_id}' for CloudWatch metrics")

    return {
        "sku_name": instance_class or f"aurora-{cluster.get('EngineMode', 'provisioned')}",
        "sku_tier": "Aurora Serverless v2" if sv2 else "Aurora Provisioned",
        "vm_type": instance_class.replace("db.", "") if instance_class else None,
        "vcores": vcores,
        "memory_gb": memory_gb,
        "storage_size_gb": storage_gb,
        "region": cluster.get("AvailabilityZones", [""])[0][:-1] if cluster.get("AvailabilityZones") else None,
        "engine": cluster.get("Engine"),
        "engine_version": cluster.get("EngineVersion"),
        "multi_az": len(members) > 1,
        "storage_type": cluster.get("StorageType"),
        "is_cluster": True,
        "cluster_members": member_ids,
        "cw_instance_id": writer_id,
        "serverless_v2_config": sv2,
    }


def query_metric(
    cw_client,
    db_instance_id: str,
    namespace: str,
    metric_name: str,
    start: datetime,
    end: datetime,
    period: int,
) -> list[dict]:
    """Query a single CloudWatch metric and return rows as dicts."""
    # CloudWatch limits to 1440 data points per request.
    # For 90 days at 1-hour granularity = 2160 points, so we chunk.
    all_rows = []
    chunk_start = start

    while chunk_start < end:
        chunk_end = min(chunk_start + timedelta(days=30), end)

        response = cw_client.get_metric_statistics(
            Namespace=namespace,
            MetricName=metric_name,
            Dimensions=[
                {"Name": "DBInstanceIdentifier", "Value": db_instance_id},
            ],
            StartTime=chunk_start,
            EndTime=chunk_end,
            Period=period,
            Statistics=["Average", "Maximum", "Minimum"],
        )

        for dp in response.get("Datapoints", []):
            all_rows.append({
                "timestamp": dp["Timestamp"].isoformat(),
                "average": dp.get("Average"),
                "maximum": dp.get("Maximum"),
                "minimum": dp.get("Minimum"),
            })

        chunk_start = chunk_end

    # CloudWatch returns unsorted data
    all_rows.sort(key=lambda r: r["timestamp"])
    return all_rows


def _transform_freeable_memory(rows: list[dict], memory_gb: int | None) -> list[dict]:
    """Convert FreeableMemory (bytes) to memory usage percent."""
    if not memory_gb:
        return rows
    total_bytes = memory_gb * 1024 * 1024 * 1024
    transformed = []
    for r in rows:
        avg_pct = ((total_bytes - r["average"]) / total_bytes * 100) if r["average"] is not None else None
        max_pct = ((total_bytes - r["minimum"]) / total_bytes * 100) if r["minimum"] is not None else None  # min free = max used
        min_pct = ((total_bytes - r["maximum"]) / total_bytes * 100) if r["maximum"] is not None else None  # max free = min used
        transformed.append({
            "timestamp": r["timestamp"],
            "average": round(avg_pct, 2) if avg_pct is not None else None,
            "maximum": round(max_pct, 2) if max_pct is not None else None,
            "minimum": round(min_pct, 2) if min_pct is not None else None,
        })
    return transformed


def _transform_free_storage_to_percent(rows: list[dict], storage_gb: int | None) -> list[dict]:
    """Convert FreeStorageSpace (bytes) to storage usage percent."""
    if not storage_gb:
        return rows
    total_bytes = storage_gb * 1024 * 1024 * 1024
    transformed = []
    for r in rows:
        avg_pct = ((total_bytes - r["average"]) / total_bytes * 100) if r["average"] is not None else None
        max_pct = ((total_bytes - r["minimum"]) / total_bytes * 100) if r["minimum"] is not None else None
        min_pct = ((total_bytes - r["maximum"]) / total_bytes * 100) if r["maximum"] is not None else None
        transformed.append({
            "timestamp": r["timestamp"],
            "average": round(avg_pct, 2) if avg_pct is not None else None,
            "maximum": round(max_pct, 2) if max_pct is not None else None,
            "minimum": round(min_pct, 2) if min_pct is not None else None,
        })
    return transformed


def _transform_free_storage_to_used(rows: list[dict], storage_gb: int | None) -> list[dict]:
    """Convert FreeStorageSpace (bytes) to storage used (bytes)."""
    if not storage_gb:
        return rows
    total_bytes = storage_gb * 1024 * 1024 * 1024
    transformed = []
    for r in rows:
        avg_used = (total_bytes - r["average"]) if r["average"] is not None else None
        max_used = (total_bytes - r["minimum"]) if r["minimum"] is not None else None
        min_used = (total_bytes - r["maximum"]) if r["maximum"] is not None else None
        transformed.append({
            "timestamp": r["timestamp"],
            "average": avg_used,
            "maximum": max_used,
            "minimum": min_used,
        })
    return transformed


def _combine_iops(read_rows: list[dict], write_rows: list[dict]) -> list[dict]:
    """Combine read and write IOPS into a single total IOPS metric."""
    write_by_ts = {r["timestamp"]: r for r in write_rows}
    combined = []
    for r in read_rows:
        w = write_by_ts.get(r["timestamp"], {})
        avg = None
        if r["average"] is not None and w.get("average") is not None:
            avg = r["average"] + w["average"]
        mx = None
        if r["maximum"] is not None and w.get("maximum") is not None:
            mx = r["maximum"] + w["maximum"]
        mn = None
        if r["minimum"] is not None and w.get("minimum") is not None:
            mn = r["minimum"] + w["minimum"]
        combined.append({
            "timestamp": r["timestamp"],
            "average": avg,
            "maximum": mx,
            "minimum": mn,
        })
    return combined


def export_metrics(
    db_instance_id: str,
    region: str,
    output_dir: str,
    granularity: int,
    profile: str | None = None,
) -> None:
    session = boto3.Session(region_name=region, profile_name=profile)
    rds_client = session.client("rds")
    cw_client = session.client("cloudwatch")

    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(days=90)

    os.makedirs(output_dir, exist_ok=True)

    print("Fetching instance configuration ...")
    server_info = get_server_config(rds_client, db_instance_id)
    print(
        f"  Instance Class: {server_info['sku_name']} ({server_info['sku_tier']}), "
        f"vCPUs: {server_info['vcores']}, Memory: {server_info.get('memory_gb') or '?'} GB, "
        f"Storage: {server_info['storage_size_gb']} GB"
    )

    # CloudWatch metrics use the instance identifier, not the cluster identifier
    cw_instance_id = server_info.get("cw_instance_id") or db_instance_id
    if server_info.get("is_cluster") and not server_info.get("cw_instance_id"):
        print("  WARNING: No writer instance found for Aurora cluster. CloudWatch metrics may be empty.")

    # Determine granularity string for output
    if granularity < 3600:
        gran_str = f"PT{granularity // 60}M"
    elif granularity < 86400:
        gran_str = f"PT{granularity // 3600}H"
    else:
        gran_str = f"P{granularity // 86400}D"

    # Query all metrics
    raw_data: dict[str, list[dict]] = {}
    for key, spec in METRICS.items():
        # Skip combined metrics (iops uses read + write)
        if key == "iops":
            continue
        if key == "storage_used":
            # Reuse storage_percent's raw data
            continue

        print(f"Querying {spec['display_name']} ({spec['metric_name']}) ...")
        rows = query_metric(
            cw_client, cw_instance_id, spec["namespace"],
            spec["metric_name"], start_time, end_time, granularity,
        )
        raw_data[key] = rows
        print(f"  -> {len(rows)} data points")

    # Apply transforms
    processed: dict[str, list[dict]] = {}

    # cpu_percent: no transform needed
    processed["cpu_percent"] = raw_data.get("cpu_percent", [])

    # memory_percent: convert FreeableMemory -> usage percent
    processed["memory_percent"] = _transform_freeable_memory(
        raw_data.get("memory_percent", []), server_info.get("memory_gb")
    )

    # storage_percent: convert FreeStorageSpace -> usage percent
    processed["storage_percent"] = _transform_free_storage_to_percent(
        raw_data.get("storage_percent", []), server_info.get("storage_size_gb")
    )

    # storage_used: convert FreeStorageSpace -> used bytes
    processed["storage_used"] = _transform_free_storage_to_used(
        raw_data.get("storage_percent", []), server_info.get("storage_size_gb")
    )

    # iops: combine read + write
    print(f"Combining Read + Write IOPS ...")
    processed["iops"] = _combine_iops(
        raw_data.get("read_iops", []), raw_data.get("write_iops", [])
    )
    print(f"  -> {len(processed['iops'])} data points")

    # read_iops, write_iops: no transform
    processed["read_iops"] = raw_data.get("read_iops", [])
    processed["write_iops"] = raw_data.get("write_iops", [])

    # xact_commit (DatabaseConnections), blks_hit (BufferCacheHitRatio), blks_read (DiskQueueDepth)
    processed["xact_commit"] = raw_data.get("xact_commit", [])
    processed["blks_hit"] = raw_data.get("blks_hit", [])
    processed["blks_read"] = raw_data.get("blks_read", [])

    # Add metric tag to each row for consistency with Azure output format
    output = {
        "server_name": db_instance_id,
        "granularity": gran_str,
        "start_time": start_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end_time": end_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "server_config": server_info,
        "metrics": {},
    }

    for key, spec in METRICS.items():
        rows = processed.get(key, [])
        # Add metric name to each row for compatibility with upload endpoint
        tagged_rows = [
            {**r, "metric": key} for r in rows
        ]
        output["metrics"][key] = {
            "display_name": spec["display_name"],
            "data_points": len(tagged_rows),
            "data": tagged_rows,
        }
        if "note" in spec:
            output["metrics"][key]["note"] = spec["note"]

    output_path = os.path.join(output_dir, f"{db_instance_id}_metrics_90d.json")
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nMetrics saved to {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Export 90 days of CPU, Memory, and Disk metrics for an Amazon RDS PostgreSQL instance"
    )
    parser.add_argument("--db-instance-id", required=True, help="RDS DB instance identifier")
    parser.add_argument("--region", default="us-east-1", help="AWS region (default: us-east-1)")
    parser.add_argument("--profile", default=None, help="AWS CLI profile name (optional)")
    parser.add_argument("--output-dir", default="./output", help="Directory for JSON output (default: ./output)")
    parser.add_argument(
        "--granularity",
        type=int,
        default=3600,
        help="Time granularity in seconds (default: 3600 = 1 hour). Examples: 300 (5min), 3600 (1hr), 86400 (1day)",
    )
    args = parser.parse_args()

    export_metrics(
        db_instance_id=args.db_instance_id,
        region=args.region,
        output_dir=args.output_dir,
        granularity=args.granularity,
        profile=args.profile,
    )


if __name__ == "__main__":
    main()
