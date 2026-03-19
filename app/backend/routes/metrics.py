from fastapi import APIRouter, HTTPException

from backend.config import settings
from backend.db import fetchall
from backend.models import MetricDataPoint, MetricResponse
from backend.tables import DISPLAY_NAMES, METRIC_NAMES

router = APIRouter()

s = settings.schema_prefix


@router.get(
    "/analyses/{analysis_id}/metrics/{metric_name}", response_model=MetricResponse
)
def get_metric(analysis_id: str, metric_name: str):
    if metric_name not in METRIC_NAMES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid metric: {metric_name}. Valid: {METRIC_NAMES}",
        )

    rows = fetchall(
        f"SELECT timestamp, average, maximum, minimum "
        f"FROM {s}metric_{metric_name} "
        f"WHERE analysis_id = '{analysis_id}' "
        f"ORDER BY timestamp"
    )

    return MetricResponse(
        metric_name=metric_name,
        display_name=DISPLAY_NAMES[metric_name],
        data_points=len(rows),
        data=[MetricDataPoint(**r) for r in rows],
    )


@router.get("/analyses/{analysis_id}/metrics", response_model=list[MetricResponse])
def get_all_metrics(analysis_id: str):
    results = []
    for metric_name in METRIC_NAMES:
        results.append(get_metric(analysis_id, metric_name))
    return results
