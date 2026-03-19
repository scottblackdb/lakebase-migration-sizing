from fastapi import APIRouter, HTTPException

from backend.config import settings
from backend.db import fetchall
from backend.models import AnalysisSummary

router = APIRouter()

s = settings.schema_prefix


@router.get("/analyses", response_model=list[AnalysisSummary])
def list_analyses():
    rows = fetchall(f"SELECT * FROM {s}analyses ORDER BY created_at DESC")
    return rows


@router.get("/analyses/groups", response_model=list[str])
def list_group_names():
    rows = fetchall(
        f"SELECT DISTINCT group_name FROM {s}analyses "
        f"WHERE group_name IS NOT NULL AND TRIM(group_name) <> '' "
        f"ORDER BY group_name"
    )
    return [row["group_name"] for row in rows]


@router.get("/analyses/{analysis_id}", response_model=AnalysisSummary)
def get_analysis(analysis_id: str):
    rows = fetchall(
        f"SELECT * FROM {s}analyses WHERE analysis_id = '{analysis_id}'"
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return rows[0]
