from fastapi import APIRouter, HTTPException, Request

from backend.config import settings
from backend.db import execute, fetchall
from backend.identity import current_user_from_request
from backend.models import (
    AnalysisSummary,
    BatchDeleteAnalysesRequest,
    BatchDeleteAnalysesResponse,
    CurrentUser,
    GroupNameUpdate,
    OwnerUpdate,
)
from backend.tables import METRIC_NAMES

router = APIRouter()

s = settings.schema_prefix

# Server-enforced; must match proxy user header (see GET /me).
ALLOWED_BATCH_DELETE_EMAIL = "scott.black@databricks.com"
BATCH_DELETE_MAX = 100


def _escape(value: str) -> str:
    return value.replace("'", "''")


def _delete_analysis_cascade(escaped_analysis_id: str) -> None:
    for metric_name in METRIC_NAMES:
        execute(
            f"DELETE FROM {s}metric_{metric_name} "
            f"WHERE analysis_id = '{escaped_analysis_id}'"
        )
    execute(f"DELETE FROM {s}analyses WHERE analysis_id = '{escaped_analysis_id}'")


@router.get("/me", response_model=CurrentUser, operation_id="get_current_user")
def get_current_user(request: Request):
    return CurrentUser(user=current_user_from_request(request.headers))


@router.post(
    "/analyses/batch-delete",
    response_model=BatchDeleteAnalysesResponse,
    operation_id="batch_delete_analyses",
)
def batch_delete_analyses(request: Request, body: BatchDeleteAnalysesRequest):
    user = current_user_from_request(request.headers)
    if (
        not user
        or user.strip().lower() != ALLOWED_BATCH_DELETE_EMAIL.lower()
    ):
        raise HTTPException(
            status_code=403,
            detail="Batch delete is not allowed for this user",
        )
    seen: list[str] = []
    for raw in body.analysis_ids:
        t = (raw or "").strip()
        if t and t not in seen:
            seen.append(t)
    if not seen:
        raise HTTPException(
            status_code=400,
            detail="analysis_ids must include at least one non-empty id",
        )
    if len(seen) > BATCH_DELETE_MAX:
        raise HTTPException(
            status_code=400,
            detail=f"At most {BATCH_DELETE_MAX} analyses per request",
        )
    deleted_ids: list[str] = []
    for aid in seen:
        esc = _escape(aid)
        existing = fetchall(
            f"SELECT analysis_id FROM {s}analyses WHERE analysis_id = '{esc}' LIMIT 1"
        )
        if not existing:
            continue
        _delete_analysis_cascade(esc)
        deleted_ids.append(aid)
    return BatchDeleteAnalysesResponse(
        deleted=len(deleted_ids),
        analysis_ids=deleted_ids,
    )


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


@router.patch("/analyses/{analysis_id}/owner", response_model=AnalysisSummary, operation_id="update_analysis_owner")
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
