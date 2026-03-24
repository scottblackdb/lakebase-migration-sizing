"""
Run MCP Streamable HTTP transport on its own port (optional).

    cd app && python -m mcp_server.http_transport

Clients connect per MCP Streamable HTTP spec. Requires `mcp` package with streamable-http support.
"""

from mcp_server.mcp_tools import mcp

if __name__ == "__main__":
    # Args may vary by `mcp` version; see https://github.com/modelcontextprotocol/python-sdk
    mcp.run(transport="streamable-http", host="127.0.0.1", port=8765)
