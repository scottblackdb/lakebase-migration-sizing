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


@router.get("/analyses/{analysis_id}", response_model=AnalysisSummary)
def get_analysis(analysis_id: str):
    schema = settings.full_schema
    rows = fetchall(
        f"SELECT * FROM {schema}.analyses WHERE analysis_id = '{analysis_id}'"
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return rows[0]
