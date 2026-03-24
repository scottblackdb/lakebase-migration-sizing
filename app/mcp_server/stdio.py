"""Run MCP server over stdio (Claude Desktop, Cursor, etc.)."""

from mcp_server.mcp_tools import mcp

if __name__ == "__main__":
    mcp.run(transport="stdio")
