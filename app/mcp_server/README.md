# Lakebase Migration Sizing — MCP + FastAPI

This package exposes **Model Context Protocol (MCP)** tools and a **FastAPI** JSON API for:

1. **Uploading** metrics JSON (same schema as `collect_metrics` output: `server_name`, `metrics`, optional `server_config`, …).
2. **Lakebase estimates** — monthly CU and USD (aligned with the web app’s Python/TS logic, including ≥32 CU peak-sizing rule).

It uses the same **PostgreSQL** database and tables as `app/main.py` (`backend.config` / `ensure_tables`).

## Setup

From the `app/` directory (same env vars as the main API: `PG_HOST`, `PG_DATABASE`, etc.):

```bash
pip install -r requirements.txt
```

## MCP (stdio) — Cursor / Claude Desktop

Run the server on stdio (working directory **`app/`** so imports resolve):

```bash
cd app
PYTHONPATH=. python -m mcp_server
# or: PYTHONPATH=. python -m mcp_server.stdio
```

**Cursor** (example `~/.cursor/mcp.json` fragment):

```json
{
  "mcpServers": {
    "lakebase-sizing": {
      "command": "python",
      "args": ["-m", "mcp_server"],
      "cwd": "/absolute/path/to/lakebase-migration-sizing/app",
      "env": {
        "PYTHONPATH": "."
      }
    }
  }
}
```

Add your Postgres env vars to `"env"` if they are not already in the shell profile the IDE uses.

### MCP tools

| Tool | Purpose |
|------|--------|
| `upload_metrics_json` | `json_body` string + `group_name` → stores analysis, returns `analysis_id` |
| `get_lakebase_estimate` | `analysis_id` + optional `safety_margin_pct`, `scale_to_zero` → JSON estimate |
| `list_analyses` | Recent analyses (optional `limit`) |

## MCP (Streamable HTTP) — optional

If your `mcp` SDK supports it:

```bash
cd app
PYTHONPATH=. python -m mcp_server.http_transport
```

Default bind: `127.0.0.1:8765` (edit `http_transport.py` if needed). Use an MCP client that speaks Streamable HTTP.

## FastAPI HTTP bridge

Same operations as REST (handy for automation without an MCP client):

```bash
cd app
PYTHONPATH=. uvicorn mcp_server.fastapi_app:app --host 127.0.0.1 --port 8888
```

| Method | Path | Body / params |
|--------|------|----------------|
| `POST` | `/mcp/v1/upload-json` | JSON body = full export; `?group_name=` |
| `POST` | `/mcp/v1/lakebase-estimate` | `{"analysis_id","safety_margin_pct","scale_to_zero"}` |
| `GET` | `/mcp/v1/analyses?limit=50` | |
| `GET` | `/health` | |

Example upload:

```bash
curl -s -X POST "http://127.0.0.1:8888/mcp/v1/upload-json?group_name=demo" \
  -H "Content-Type: application/json" \
  -d @path/to/server_metrics_90d.json
```

## Layout

| Module | Role |
|--------|------|
| `mcp_tools.py` | `FastMCP` tool definitions |
| `stdio.py` / `__main__.py` | MCP stdio entry |
| `http_transport.py` | MCP Streamable HTTP entry (optional) |
| `fastapi_app.py` | FastAPI app |
| `services.py` | Shared logic for tools + HTTP |
| `lakebase_estimate.py` | Lakebase CU math (mirror of frontend `lakebaseEstimate.ts`) |

The main web app’s `POST /api/upload` now delegates to `backend.ingest` so behavior matches MCP upload.
