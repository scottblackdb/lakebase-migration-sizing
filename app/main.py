import os

from fastapi import FastAPI
from fastapi.responses import JSONResponse
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
_can_serve_static = os.path.isdir(_STATIC_ROOT) and os.path.isfile(_INDEX_HTML)

if _can_serve_static:
    # Mount entire dist at / so /, /assets/*, and SPA paths (e.g. /analysis/:id) work.
    # html=True returns index.html when no file matches (client-side routing).
    app.mount(
        "/",
        StaticFiles(directory=_STATIC_ROOT, html=True),
        name="frontend",
    )
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
