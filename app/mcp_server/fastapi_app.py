"""
FastAPI application exposing the same operations as MCP tools over JSON HTTP.

    cd app && uvicorn mcp_server.fastapi_app:app --host 0.0.0.0 --port 8888

Routes are under /mcp/v1/ so they can sit beside the main app on another port or be mounted.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import Body, FastAPI, HTTPException, Query, Request
from pydantic import BaseModel

from backend.identity import current_user_from_request
from backend.ingest import ingest_metrics_payload
from backend.models import UploadResponse
from backend.tables import ensure_tables

from mcp_server import services


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_tables()
    yield


app = FastAPI(
    title="Lakebase Migration Sizing — MCP HTTP bridge",
    description="JSON HTTP API mirroring MCP tools: upload metrics, Lakebase estimate, list analyses.",
    lifespan=lifespan,
)


@app.post("/mcp/v1/upload-json", response_model=UploadResponse)
def http_upload_json(
    request: Request,
    payload: dict[str, Any] = Body(
        ...,
        description="Full metrics export: must include server_name and metrics (and optional server_config, etc.)",
    ),
    group_name: str = Query("default", description="Logical group stored with the analysis"),
):
    if "server_name" not in payload or "metrics" not in payload:
        raise HTTPException(
            status_code=400,
            detail="JSON body must include server_name and metrics",
        )
    try:
        owner = current_user_from_request(request.headers)
        return ingest_metrics_payload(payload, group_name, owner)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


class EstimateBody(BaseModel):
    analysis_id: str
    safety_margin_pct: float = 15.0
    scale_to_zero: bool = True
    branched_database: bool = False


@app.post("/mcp/v1/lakebase-estimate")
def http_lakebase_estimate(body: EstimateBody):
    try:
        return services.get_lakebase_estimate_dict(
            body.analysis_id,
            body.safety_margin_pct,
            body.scale_to_zero,
            body.branched_database,
        )
    except ValueError as e:
        msg = str(e).lower()
        code = 404 if "not found" in msg else 400
        raise HTTPException(status_code=code, detail=str(e)) from e


@app.get("/mcp/v1/analyses")
def http_list_analyses(limit: int = Query(50, ge=1, le=500)):
    import json

    return json.loads(services.list_analyses_json(limit))


@app.get("/health")
def health():
    return {"status": "ok"}
