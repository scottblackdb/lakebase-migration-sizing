"""
Shared metrics JSON ingestion (used by HTTP upload route and MCP server).
"""
import json
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException

from backend.db import execute, executemany
from backend.models import UploadResponse
from backend.tables import METRIC_NAMES

BATCH_SIZE = 500


def _coerce_optional_int(value, field_name: str) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field_name}: must be an integer",
        ) from e


def _insert_metric_batch(
    schema_prefix: str, metric_name: str, analysis_id: str, rows: list[dict]
) -> None:
    if not rows:
        return

    table = f"{schema_prefix}metric_{metric_name}"
    sql = (
        f"INSERT INTO {table} "
        f"(analysis_id, timestamp, average, maximum, minimum) "
        f"VALUES (%s, %s, %s, %s, %s)"
    )

    params: list[tuple] = []
    for r in rows:
        params.append(
            (
                analysis_id,
                str(r.get("timestamp", "")),
                r.get("average"),
                r.get("maximum"),
                r.get("minimum"),
            )
        )

    for i in range(0, len(params), BATCH_SIZE):
        executemany(sql, params[i : i + BATCH_SIZE])


def ingest_metrics_payload(
    data: dict, group_name: str, owner: str | None = None
) -> UploadResponse:
    """
    Persist one metrics export document. Raises HTTPException on validation errors.
    """
    from backend.config import settings

    s = settings.schema_prefix

    required_keys = {"server_name", "metrics"}
    if not required_keys.issubset(data.keys()):
        missing = required_keys - data.keys()
        raise HTTPException(status_code=400, detail=f"Missing keys: {missing}")

    analysis_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    server_name = str(data["server_name"])
    granularity = str(data.get("granularity") or "")
    start_time = str(data.get("start_time") or "")
    end_time = str(data.get("end_time") or "")

    server_config = data.get("server_config", {})
    sku_name = str(server_config.get("sku_name") or "")
    sku_tier = str(server_config.get("sku_tier") or "")
    vm_type = str(server_config.get("vm_type") or "")
    vcores = _coerce_optional_int(server_config.get("vcores"), "vcores")
    memory_gb = _coerce_optional_int(server_config.get("memory_gb"), "memory_gb")
    storage_size_gb = _coerce_optional_int(
        server_config.get("storage_size_gb"), "storage_size_gb"
    )
    region = str(server_config.get("region") or "")
    normalized_group = group_name.strip()
    normalized_owner = (owner or "").strip()

    execute(
        f"INSERT INTO {s}analyses "
        f"(analysis_id, group_name, owner, server_name, granularity, "
        f"start_time, end_time, created_at, sku_name, sku_tier, vm_type, "
        f"vcores, memory_gb, storage_size_gb, region) "
        f"VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (
            analysis_id,
            normalized_group or None,
            normalized_owner or None,
            server_name,
            granularity,
            start_time,
            end_time,
            now,
            sku_name,
            sku_tier,
            vm_type,
            vcores,
            memory_gb,
            storage_size_gb,
            region,
        ),
    )

    metrics_loaded = []
    metrics_data = data.get("metrics", {})
    for metric_name in METRIC_NAMES:
        if metric_name in metrics_data:
            metric_info = metrics_data[metric_name]
            rows = metric_info.get("data", [])
            _insert_metric_batch(s, metric_name, analysis_id, rows)
            metrics_loaded.append(metric_name)

    return UploadResponse(
        analysis_id=analysis_id,
        server_name=data["server_name"],
        metrics_loaded=metrics_loaded,
    )


def ingest_metrics_json_bytes(
    content: bytes, group_name: str, owner: str | None = None
) -> UploadResponse:
    try:
        data = json.loads(content)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}") from e
    return ingest_metrics_payload(data, group_name, owner)
