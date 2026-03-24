from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.routes import ai_analysis, analyses, metrics, upload
from backend.tables import ensure_tables

app = FastAPI(title="Lakebase Migration Sizing")

app.include_router(upload.router, prefix="/api")
app.include_router(analyses.router, prefix="/api")
app.include_router(metrics.router, prefix="/api")
app.include_router(ai_analysis.router, prefix="/api")


@app.on_event("startup")
async def startup():
    ensure_tables()


# Vite production build: app/frontend/dist (run `bun run build` in app/frontend)
_STATIC_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "frontend", "dist")
)
_INDEX_HTML = os.path.join(_STATIC_ROOT, "index.html")
_STATIC_ROOT_PATH = Path(_STATIC_ROOT).resolve()
_can_serve_static = os.path.isdir(_STATIC_ROOT) and os.path.isfile(_INDEX_HTML)


def _file_under_static_root(rel_path: str) -> Optional[Path]:
    """Resolve rel_path inside dist; return path only if it is a real file under _STATIC_ROOT."""
    try:
        candidate = (_STATIC_ROOT_PATH / rel_path).resolve()
        candidate.relative_to(_STATIC_ROOT_PATH)
    except (OSError, ValueError):
        return None
    return candidate if candidate.is_file() else None


if _can_serve_static:
    # Starlette StaticFiles(html=True) does NOT fall back to index.html for unknown paths
    # (only directory index + optional 404.html). SPA deep links need an explicit fallback.
    _assets_dir = os.path.join(_STATIC_ROOT, "assets")
    if os.path.isdir(_assets_dir):
        app.mount(
            "/assets",
            StaticFiles(directory=_assets_dir),
            name="frontend_assets",
        )

    @app.get("/")
    def spa_index():
        return FileResponse(_INDEX_HTML)

    @app.get("/{full_path:path}")
    def spa_or_static(full_path: str):
        # Should not run for /api/* (API routes are registered above), but guard anyway.
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        under = _file_under_static_root(full_path)
        if under is not None:
            return FileResponse(under)
        return FileResponse(_INDEX_HTML)
else:

    @app.get("/")
    def frontend_bundle_missing():
        """`frontend/dist` missing (often not committed — run Vite build before deploy)."""
        return JSONResponse(
            status_code=503,
            content={
                "detail": "Frontend bundle not found.",
                "expected_path": _STATIC_ROOT,
                "fix": "Run: cd app/frontend && bun install && bun run build. "
                "Deploy app/frontend/dist/ next to main.py.",
                "doc": "See DATABRICKS_DEPLOY.md in this app folder.",
            },
        )
