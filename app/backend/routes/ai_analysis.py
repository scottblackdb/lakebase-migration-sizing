import json

import httpx
from fastapi import APIRouter, HTTPException

from backend.config import settings
from backend.db import execute, fetchall
from backend.models import AiAnalysisResponse

router = APIRouter()

SYSTEM_PROMPT = (
    "You are an analyst determining if a database server is over provisioned and if this "
    "should be a high priority target for a Databricks Lakebase migration. Examine the CPU "
    "utilization percentage to determine based on how frequently the server is 60% or more "
    "utilized. Then give your analysis how much or little the server is over provisioned. "
    "If the migration priority is high with lower utilization being higher priority, provide "
    "a short executive summary in addition to the detailed analysis. Executive summary should "
    "be delivered first."
)


def _build_cpu_summary(analysis_id: str) -> dict:
    """Build a CPU utilization summary from metric data."""
    schema = settings.full_schema
    rows = fetchall(
        f"SELECT timestamp, average, maximum, minimum "
        f"FROM {schema}.metric_cpu_percent "
        f"WHERE analysis_id = '{analysis_id}' "
        f"ORDER BY timestamp"
    )

    if not rows:
        return {"error": "No CPU data available"}

    averages = [r["average"] for r in rows if r["average"] is not None]
    maximums = [r["maximum"] for r in rows if r["maximum"] is not None]

    if not averages:
        return {"error": "No non-null CPU data"}

    total = len(averages)
    above_60 = sum(1 for v in averages if v >= 60)
    above_80 = sum(1 for v in averages if v >= 80)
    above_90 = sum(1 for v in averages if v >= 90)
    max_above_60 = sum(1 for v in maximums if v >= 60) if maximums else 0

    return {
        "total_data_points": total,
        "avg_cpu_percent": round(sum(averages) / total, 2),
        "max_cpu_percent": round(max(maximums), 2) if maximums else None,
        "min_cpu_percent": round(min(averages), 2),
        "p95_cpu_percent": round(sorted(averages)[int(total * 0.95)], 2),
        "periods_above_60_pct": above_60,
        "pct_time_above_60": round((above_60 / total) * 100, 2),
        "periods_above_80_pct": above_80,
        "pct_time_above_80": round((above_80 / total) * 100, 2),
        "periods_above_90_pct": above_90,
        "pct_time_above_90": round((above_90 / total) * 100, 2),
        "max_periods_above_60_pct": max_above_60,
        "max_pct_time_above_60": round((max_above_60 / len(maximums)) * 100, 2) if maximums else 0,
    }


def _call_foundation_model(prompt: str) -> str:
    """Call Databricks Foundation Model API."""
    host = settings.DATABRICKS_HOST.rstrip("/")
    if not host.startswith("https://"):
        host = f"https://{host}"
    model = settings.FOUNDATION_MODEL
    url = f"{host}/serving-endpoints/{model}/invocations"

    headers = {
        "Authorization": f"Bearer {settings.DATABRICKS_TOKEN}",
        "Content-Type": "application/json",
    }

    payload = {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 2000,
        "temperature": 0.3,
    }

    resp = httpx.post(url, headers=headers, json=payload, timeout=120)
    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Foundation model error ({resp.status_code}): {resp.text}",
        )

    data = resp.json()
    return data["choices"][0]["message"]["content"]


def _escape(value: str) -> str:
    return value.replace("'", "''").replace("\\", "\\\\")


@router.post(
    "/analyses/{analysis_id}/ai-analysis", response_model=AiAnalysisResponse
)
def generate_ai_analysis(analysis_id: str):
    schema = settings.full_schema

    # Fetch analysis metadata
    rows = fetchall(
        f"SELECT * FROM {schema}.analyses WHERE analysis_id = '{analysis_id}'"
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Analysis not found")

    analysis = rows[0]
    vcores = analysis.get("vcores")
    if not vcores:
        raise HTTPException(
            status_code=400, detail="No vCores info available for this analysis"
        )

    # Build CPU summary
    cpu_summary = _build_cpu_summary(analysis_id)
    if "error" in cpu_summary:
        raise HTTPException(status_code=400, detail=cpu_summary["error"])

    # Build the user prompt
    user_prompt = (
        f"Server: {analysis.get('server_name')}\n"
        f"Region: {analysis.get('region')}\n"
        f"VM Type: {analysis.get('vm_type')}\n"
        f"SKU Tier: {analysis.get('sku_tier')}\n"
        f"Number of CPUs (vCores): {vcores}\n"
        f"Storage: {analysis.get('storage_size_gb')} GB\n"
        f"Monitoring Period: {analysis.get('start_time')} to {analysis.get('end_time')}\n"
        f"Granularity: {analysis.get('granularity')}\n\n"
        f"CPU Utilization Summary:\n{json.dumps(cpu_summary, indent=2)}"
    )

    # Call the foundation model
    ai_response = _call_foundation_model(user_prompt)

    # Save to analyses table
    escaped = _escape(ai_response)
    execute(
        f"UPDATE {schema}.analyses "
        f"SET ai_analysis = '{escaped}' "
        f"WHERE analysis_id = '{analysis_id}'"
    )

    return AiAnalysisResponse(analysis_id=analysis_id, ai_analysis=ai_response)
