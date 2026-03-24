"""
MCP tool definitions (Model Context Protocol) using FastMCP from the official SDK.

Run stdio transport:
    cd app && python -m mcp_server.stdio

Run streamable HTTP (MCP over HTTP, standalone):
    cd app && python -m mcp_server.http_transport
"""
from __future__ import annotations

from mcp.server.fastmcp import FastMCP

from mcp_server import services

mcp = FastMCP("lakebase-migration-sizing")


@mcp.tool()
def upload_metrics_json(json_body: str, group_name: str = "default") -> str:
    """
    Upload a metrics JSON document (same schema as collect_metrics AWS/Azure export):
    top-level keys should include at least `server_name` and `metrics` (per-metric series).

    Args:
        json_body: Full JSON as a string (not a file path).
        group_name: Logical group label stored with the analysis (required by the app).

    Returns:
        JSON string with analysis_id, server_name, metrics_loaded.

    Note:
        Owner is not set via this stdio tool; use HTTP upload with ``X-Forwarded-User`` for that.
    """
    return services.upload_metrics_json_string(json_body, group_name)


@mcp.tool()
def get_lakebase_estimate(
    analysis_id: str,
    safety_margin_pct: float = 15.0,
    scale_to_zero: bool = True,
) -> str:
    """
    Compute Lakebase monthly CU and estimated USD cost for a previously uploaded analysis.

    Args:
        analysis_id: Returned by upload_metrics_json.
        safety_margin_pct: Applied to peak cores per interval (default 15).
        scale_to_zero: When True, idle intervals (very low CPU) count as 0 CU unless
            any interval needs 32+ CUs (then scale-to-zero is disabled and peak sizing applies).

    Returns:
        JSON string with estimate breakdown and costs_usd_per_month.
    """
    return services.get_lakebase_estimate_json(
        analysis_id, safety_margin_pct, scale_to_zero
    )


@mcp.tool()
def list_analyses(limit: int = 50) -> str:
    """
    List recent analyses (server name, ids, vcores, region).

    Args:
        limit: Max rows (1–500, default 50).

    Returns:
        JSON array of analysis summaries.
    """
    return services.list_analyses_json(limit)
