#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

DIST="frontend/dist/index.html"
if [[ ! -f "$DIST" ]]; then
  echo "frontend/dist missing — running npm install && npm run build in frontend/"
  (cd frontend && npm install && npm run build)
fi

PORT="${DATABRICKS_APP_PORT:-8000}"
exec opentelemetry-instrument uvicorn main:app --host 0.0.0.0 --port "$PORT"
