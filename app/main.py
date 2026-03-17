import os

from fastapi import FastAPI
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


# Serve React build — must be last (catch-all)
frontend_dir = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.isdir(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
