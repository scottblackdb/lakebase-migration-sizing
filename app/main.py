import os

from fastapi import FastAPI
from fastapi.responses import FileResponse
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


# SPA: serve index.html for direct analysis URLs (e.g. /analysis/abc123) so links work without visiting /
frontend_dir = os.path.join(os.path.dirname(__file__), "frontend", "dist")
index_path = os.path.join(frontend_dir, "index.html")


def _serve_index(id: str = ""):
    return FileResponse(index_path)


if os.path.isdir(frontend_dir) and os.path.isfile(index_path):
    app.get("/analysis")(lambda: _serve_index())
    app.get("/analysis/{id}")(_serve_index)

# Serve React build — must be last (catch-all)
if os.path.isdir(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
