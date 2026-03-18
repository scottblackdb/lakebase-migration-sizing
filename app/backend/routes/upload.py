import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Form, HTTPException, UploadFile

from backend.config import settings
from backend.db import execute
from backend.models import UploadResponse
from backend.tables import METRIC_NAMES

router = APIRouter()

BATCH_SIZE = 500


def _escape(value: str) -> str:
    return value.replace("'", "''")


def _sql_val(v) -> str:
    if v is None:
        return "NULL"
    return str(v)


def _insert_metric_batch(
    schema: str, metric_name: str, analysis_id: str, rows: list[dict]
) -> None:
    if not rows:
        return

    table = f"{schema}.metric_{metric_name}"

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        values = []
        for r in batch:
            ts = _escape(str(r.get("timestamp", "")))
            avg = _sql_val(r.get("average"))
            mx = _sql_val(r.get("maximum"))
            mn = _sql_val(r.get("minimum"))
            values.append(f"('{analysis_id}', '{ts}', {avg}, {mx}, {mn})")

        sql_stmt = (
            f"INSERT INTO {table} (analysis_id, timestamp, average, maximum, minimum) "
            f"VALUES {', '.join(values)}"
        )
        execute(sql_stmt)


@router.post("/upload", response_model=UploadResponse)
async def upload_metrics(file: UploadFile, group_name: str = Form("")):
    if not file.filename or not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="File must be a .json file")

    try:
        content = await file.read()
        data = json.loads(content)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}")

    required_keys = {"server_name", "metrics"}
    if not required_keys.issubset(data.keys()):
        missing = required_keys - data.keys()
        raise HTTPException(status_code=400, detail=f"Missing keys: {missing}")

    analysis_id = uuid.uuid4().hex[:12]
    schema = settings.full_schema
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    server_name = _escape(data["server_name"])
    granularity = _escape(data.get("granularity", ""))
    start_time = _escape(data.get("start_time", ""))
    end_time = _escape(data.get("end_time", ""))

    server_config = data.get("server_config", {})
    sku_name = _escape(str(server_config.get("sku_name") or ""))
    sku_tier = _escape(str(server_config.get("sku_tier") or ""))
    vm_type = _escape(str(server_config.get("vm_type") or ""))
    vcores = server_config.get("vcores")
    memory_gb = server_config.get("memory_gb")
    storage_size_gb = server_config.get("storage_size_gb")
    region = _escape(str(server_config.get("region") or ""))
    normalized_group = group_name.strip()
    group_name_sql = f"'{_escape(normalized_group)}'" if normalized_group else "NULL"

    execute(
        f"INSERT INTO {schema}.analyses "
        f"(analysis_id, group_name, server_name, granularity, "
        f"start_time, end_time, created_at, sku_name, sku_tier, vm_type, vcores, memory_gb, storage_size_gb, region) "
        f"VALUES ('{analysis_id}', {group_name_sql}, '{server_name}', '{granularity}', "
        f"'{start_time}', '{end_time}', '{now}', "
        f"'{sku_name}', '{sku_tier}', '{vm_type}', {vcores if vcores is not None else 'NULL'}, "
        f"{memory_gb if memory_gb is not None else 'NULL'}, {storage_size_gb if storage_size_gb is not None else 'NULL'}, '{region}')"
    )

    metrics_loaded = []
    metrics_data = data.get("metrics", {})
    for metric_name in METRIC_NAMES:
        if metric_name in metrics_data:
            metric_info = metrics_data[metric_name]
            rows = metric_info.get("data", [])
            _insert_metric_batch(schema, metric_name, analysis_id, rows)
            metrics_loaded.append(metric_name)

    return UploadResponse(
        analysis_id=analysis_id,
        server_name=data["server_name"],
        metrics_loaded=metrics_loaded,
    )
