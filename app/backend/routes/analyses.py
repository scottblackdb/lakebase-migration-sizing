from fastapi import APIRouter, HTTPException

from backend.config import settings
from backend.db import execute, fetchall
from backend.models import AnalysisSummary, GroupNameUpdate, OwnerUpdate

router = APIRouter()

s = settings.schema_prefix


def _escape(value: str) -> str:
    return value.replace("'", "''")


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
    aid = _escape(analysis_id)
    rows = fetchall(f"SELECT * FROM {s}analyses WHERE analysis_id = '{aid}'")
    if not rows:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return rows[0]


@router.patch("/analyses/{analysis_id}/group", response_model=AnalysisSummary)
def update_analysis_group(analysis_id: str, body: GroupNameUpdate):
    normalized = body.group_name.strip()
    if not normalized:
        raise HTTPException(
            status_code=400, detail="group_name is required and cannot be blank"
        )
    aid = _escape(analysis_id)
    g = _escape(normalized)
    existing = fetchall(f"SELECT * FROM {s}analyses WHERE analysis_id = '{aid}'")
    if not existing:
        raise HTTPException(status_code=404, detail="Analysis not found")
    execute(f"UPDATE {s}analyses SET group_name = '{g}' WHERE analysis_id = '{aid}'")
    rows = fetchall(f"SELECT * FROM {s}analyses WHERE analysis_id = '{aid}'")
    return rows[0]


@router.patch("/analyses/{analysis_id}/owner", response_model=AnalysisSummary)
def update_analysis_owner(analysis_id: str, body: OwnerUpdate):
    aid = _escape(analysis_id)
    existing = fetchall(f"SELECT * FROM {s}analyses WHERE analysis_id = '{aid}'")
    if not existing:
        raise HTTPException(status_code=404, detail="Analysis not found")
    normalized = body.owner.strip()
    if not normalized:
        execute(f"UPDATE {s}analyses SET owner = NULL WHERE analysis_id = '{aid}'")
    else:
        o = _escape(normalized)
        execute(f"UPDATE {s}analyses SET owner = '{o}' WHERE analysis_id = '{aid}'")
    rows = fetchall(f"SELECT * FROM {s}analyses WHERE analysis_id = '{aid}'")
    return rows[0]
