from fastapi import APIRouter, HTTPException

from backend.config import settings
from backend.db import fetchall
from backend.models import AnalysisSummary

router = APIRouter()


@router.get("/analyses", response_model=list[AnalysisSummary])
def list_analyses():
    schema = settings.full_schema
    rows = fetchall(f"SELECT * FROM {schema}.analyses ORDER BY created_at DESC")
    return rows


@router.get("/analyses/groups", response_model=list[str])
def list_group_names():
    schema = settings.full_schema
    rows = fetchall(
        f"SELECT DISTINCT group_name FROM {schema}.analyses "
        f"WHERE group_name IS NOT NULL AND TRIM(group_name) <> '' "
        f"ORDER BY group_name"
    )
    return [row["group_name"] for row in rows]


@router.get("/analyses/{analysis_id}", response_model=AnalysisSummary)
def get_analysis(analysis_id: str):
    schema = settings.full_schema
    rows = fetchall(
        f"SELECT * FROM {schema}.analyses WHERE analysis_id = '{analysis_id}'"
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return rows[0]
