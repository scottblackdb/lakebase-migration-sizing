"""
Business logic for MCP tools and REST /mcp routes (shared).
"""
from __future__ import annotations

import json

from fastapi import HTTPException

from backend.config import settings
from backend.db import fetchall
from backend.ingest import ingest_metrics_payload

from mcp_server.lakebase_estimate import (
    LAKEBASE_100_PERCENT_UPTIME_DISCOUNT_PCT,
    compute_lakebase_estimate,
    count_usable_cpu_samples,
    effective_storage_gb_for_lakebase_sizing,
    metrics_rows_to_cpu_points,
    monthly_cu_cost_usd,
    monthly_cu_cost_usd_after_uptime_discount,
    total_monthly_cost_usd,
    total_monthly_cost_usd_after_uptime_discount,
)


def upload_metrics_json_string(
    json_body: str, group_name: str = "default", owner: str | None = None
) -> str:
    """
    Parse metrics JSON string and persist. Returns JSON string with analysis_id, server_name, metrics_loaded.
    Raises ValueError on validation / DB errors surfaced as HTTPException from ingest.
    """
    try:
        data = json.loads(json_body)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON: {e}") from e

    try:
        result = ingest_metrics_payload(data, group_name, owner)
    except HTTPException as e:
        raise ValueError(str(e.detail)) from e

    return json.dumps(
        {
            "analysis_id": result.analysis_id,
            "server_name": result.server_name,
            "metrics_loaded": result.metrics_loaded,
        }
    )


def get_lakebase_estimate_dict(
    analysis_id: str,
    safety_margin_pct: float = 15.0,
    scale_to_zero: bool = True,
    branched_database: bool = False,
) -> dict:
    """Compute Lakebase estimate for a stored analysis. Raises ValueError if not found or invalid."""
    s = settings.schema_prefix
    rows = fetchall(
        f"SELECT * FROM {s}analyses WHERE analysis_id = %s", (analysis_id,)
    )
    if not rows:
        raise ValueError(f"Analysis not found: {analysis_id}")
    row = dict(rows[0])
    vcores = row.get("vcores")
    if vcores is None:
        raise ValueError("vCores missing or invalid for this analysis")
    try:
        vc = int(vcores)
    except (TypeError, ValueError) as e:
        raise ValueError("vCores missing or invalid for this analysis") from e
    if vc <= 0:
        raise ValueError("vCores missing or invalid for this analysis")

    mrows = fetchall(
        f"SELECT timestamp, average, maximum, minimum FROM {s}metric_cpu_percent "
        f"WHERE analysis_id = %s ORDER BY timestamp",
        (analysis_id,),
    )
    if not mrows:
        raise ValueError("No cpu_percent metric data for this analysis")

    cpu_data = metrics_rows_to_cpu_points([dict(r) for r in mrows])
    if count_usable_cpu_samples(cpu_data) == 0:
        raise ValueError("No usable CPU samples (maximum values are null)")
    est = compute_lakebase_estimate(
        cpu_data,
        vc,
        float(safety_margin_pct),
        bool(scale_to_zero),
        row.get("granularity"),
    )
    if not est.metrics.monthly_cu_projection_reliable:
        raise ValueError(
            "Cannot project monthly CU: need ≥2 CPU samples or analysis granularity"
        )
    m = est.metrics
    sku = row.get("sku_name")
    raw_storage = row.get("storage_size_gb")
    storage_gb: int | None
    if raw_storage is None:
        storage_gb = None
    else:
        try:
            storage_gb = int(raw_storage)
        except (TypeError, ValueError) as e:
            raise ValueError(
                "storage_size_gb invalid for this analysis"
            ) from e
    storage_for_sizing = effective_storage_gb_for_lakebase_sizing(
        storage_gb, bool(branched_database)
    )
    monthly = m.monthly_cu
    uptime_discount = m.qualifies_for_100_percent_uptime_discount
    compute_usd = monthly_cu_cost_usd_after_uptime_discount(monthly, uptime_discount)
    total_usd = total_monthly_cost_usd_after_uptime_discount(
        monthly, storage_for_sizing, sku, uptime_discount
    )

    return {
        "analysis_id": analysis_id,
        "server_name": row.get("server_name"),
        "safety_margin_pct": safety_margin_pct,
        "scale_to_zero_requested": scale_to_zero,
        "branched_database": bool(branched_database),
        "estimate": {
            "monthly_cu": monthly,
            "peak_cores": m.peak_cores,
            "avg_cores": m.avg_cores,
            "safety_line_cores": m.safety_line_cores,
            "scale_to_zero_periods": m.scale_to_zero_periods,
            "total_periods": m.total_periods,
            "interval_hours": round(m.interval_hours, 4),
            "periods_per_month": round(m.periods_per_month, 2),
            "avg_cu_per_period": round(m.avg_cu_per_period, 4),
            "used_peak_cu_constant_sizing": m.used_peak_cu_constant_sizing,
            "peak_period_lakebase_cu": m.peak_period_lakebase_cu,
            "qualifies_for_100_percent_uptime_discount": uptime_discount,
        },
        "costs_usd_per_month": {
            "compute": round(compute_usd, 2),
            "compute_before_discount": round(monthly_cu_cost_usd(monthly), 2),
            "total_cu_plus_storage": round(total_usd, 2),
            "total_cu_plus_storage_before_discount": round(
                total_monthly_cost_usd(monthly, storage_for_sizing, sku), 2
            ),
            "uptime_discount_pct": (
                LAKEBASE_100_PERCENT_UPTIME_DISCOUNT_PCT if uptime_discount else 0
            ),
        },
        "storage_size_gb": storage_gb,
        "storage_size_gb_for_sizing": storage_for_sizing,
        "sku_name": sku,
    }


def get_lakebase_estimate_json(
    analysis_id: str,
    safety_margin_pct: float = 15.0,
    scale_to_zero: bool = True,
    branched_database: bool = False,
) -> str:
    return json.dumps(
        get_lakebase_estimate_dict(
            analysis_id, safety_margin_pct, scale_to_zero, branched_database
        ),
        default=str,
    )


def list_analyses_json(limit: int = 100) -> str:
    s = settings.schema_prefix
    lim = max(1, min(int(limit), 500))
    rows = fetchall(
        f"SELECT analysis_id, group_name, owner, server_name, vcores, region, created_at "
        f"FROM {s}analyses ORDER BY created_at DESC LIMIT %s",
        (lim,),
    )
    return json.dumps([dict(r) for r in rows], default=str)
