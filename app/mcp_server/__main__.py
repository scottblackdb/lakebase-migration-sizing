"""Default: run MCP over stdio. Use ``python -m mcp_server.stdio`` explicitly if preferred."""

from mcp_server.mcp_tools import mcp

if __name__ == "__main__":
    mcp.run(transport="stdio")
