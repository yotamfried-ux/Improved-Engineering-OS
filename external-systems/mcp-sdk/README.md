# MCP SDK (Model Context Protocol)

## Overview
The Model Context Protocol (MCP) is an open standard by Anthropic that enables AI assistants (like Claude) to connect to external tools, data sources, and services through a unified protocol. An MCP server exposes Tools (functions the AI can call), Resources (data the AI can read), and Prompts (reusable prompt templates) over a standardized JSON-RPC transport. Official SDKs exist for TypeScript and Python; the TypeScript SDK is used by Claude Desktop, Claude Code, and most production integrations.

## Capabilities
- **Tools**: Callable functions the LLM can invoke (e.g., `search_database`, `create_issue`, `send_email`)
- **Resources**: Read-only data sources the LLM can access (e.g., files, database records, API responses)
- **Prompts**: Reusable prompt templates with arguments for common workflows
- **Transport layers**: stdio (local processes), HTTP+SSE (remote servers), and Streamable HTTP (modern remote)
- **TypeScript SDK**: `@modelcontextprotocol/sdk` — server and client implementations
- **Python SDK**: `mcp` package — server and client implementations with FastMCP high-level API
- **Sampling**: MCP servers can request the LLM to generate text (server-to-client LLM calls)
- **Authentication**: OAuth 2.0 support for remote MCP servers

## When to Use
- Exposing internal tools (APIs, databases, filesystems) to Claude or other MCP-compatible LLMs
- Building Claude Code extensions that provide project-specific context or capabilities
- Creating a reusable integration layer — build once, use from Claude Desktop, Claude Code, and any MCP client
- Replacing bespoke function-calling glue code with a standard, discoverable protocol
- Giving AI agents access to company data without exposing raw credentials to the model

## Limitations
- MCP is a relatively new standard (released November 2024); ecosystem and tooling are rapidly evolving
- stdio transport requires the MCP server to be a local process; remote servers need HTTP+SSE or Streamable HTTP
- No built-in auth for stdio; remote servers must implement OAuth 2.0 themselves
- Debugging is harder than REST APIs — use the MCP Inspector tool (`npx @modelcontextprotocol/inspector`)
- Each MCP client (Claude Desktop, Claude Code) manages its own server connections; there's no central registry

## Integration Guide
1. Install the TypeScript SDK: `npm install @modelcontextprotocol/sdk`
2. Create a server with Tools, Resources, or Prompts (see Setup below)
3. Register it in Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`) or Claude Code (`claude mcp add`)
4. Test with MCP Inspector: `npx @modelcontextprotocol/inspector node build/index.js`
5. For remote servers: implement HTTP+SSE transport and OAuth 2.0, then deploy to any Node/Python host

## Setup
```typescript
// TypeScript MCP server (stdio transport)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "my-server", version: "1.0.0" });

// Define a Tool
server.tool(
  "search_docs",
  "Search internal documentation",
  { query: z.string().describe("Search query") },
  async ({ query }) => ({
    content: [{ type: "text", text: `Results for: ${query}` }]
  })
);

// Define a Resource
server.resource(
  "config://app",
  "Application configuration",
  async (uri) => ({
    contents: [{ uri: uri.href, text: JSON.stringify({ env: "production" }) }]
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

```python
# Python MCP server using FastMCP (high-level API)
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("my-server")

@mcp.tool()
def search_docs(query: str) -> str:
    """Search internal documentation"""
    return f"Results for: {query}"

@mcp.resource("config://app")
def get_config() -> str:
    """Application configuration"""
    return '{"env": "production"}'

if __name__ == "__main__":
    mcp.run()
```

```json
// Claude Desktop config: ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/path/to/build/index.js"]
    }
  }
}
```

## Pricing Notes
- **MCP SDK**: Free and open-source (MIT license)
- **Hosting**: stdio servers run locally — free. Remote HTTP servers cost standard cloud hosting rates
- **API calls**: MCP tools that call third-party APIs (GitHub, Slack, etc.) incur those APIs' normal costs
- No licensing fees for building or distributing MCP servers

## Reference Repositories
- [modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) — official TypeScript MCP SDK
- [modelcontextprotocol/python-sdk](https://github.com/modelcontextprotocol/python-sdk) — official Python MCP SDK with FastMCP
- [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) — official reference MCP servers (filesystem, GitHub, Postgres, Slack, etc.)
- [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) — curated list of community MCP servers

## Official Documentation
- [MCP Specification](https://modelcontextprotocol.io/docs) — protocol spec, concepts, and transport docs
- [MCP TypeScript SDK Docs](https://github.com/modelcontextprotocol/typescript-sdk#readme) — SDK API reference
- [MCP Python SDK Docs](https://github.com/modelcontextprotocol/python-sdk#readme) — Python SDK + FastMCP reference
- [Claude Code MCP Docs](https://docs.anthropic.com/en/docs/claude-code/mcp) — adding MCP servers to Claude Code
- [MCP Inspector](https://github.com/modelcontextprotocol/inspector) — visual debugging tool for MCP servers

## Common Pitfalls
- **Blocking the event loop**: MCP tools run in the same process — use async functions and avoid blocking I/O; a slow tool blocks all requests
- **Over-exposing data via Resources**: Resources are readable by the LLM — don't expose sensitive data (secrets, PII) as resources; use tool-level auth checks instead
- **stdio vs HTTP confusion**: stdio servers must be started fresh per session by the client; they cannot be shared. Use HTTP+SSE for multi-session or remote servers
- **Missing error handling**: Unhandled exceptions crash the server and drop the client connection — always wrap tool handlers in try/catch and return error content instead of throwing
- **Schema drift**: Tool input schemas defined with Zod/Pydantic must stay in sync with the actual function signature; mismatches cause silent failures

## Examples
1. **Database query tool**: MCP server wraps a PostgreSQL connection; Claude calls `query_db("SELECT * FROM users WHERE active = true")` → server runs parameterized query → returns JSON rows. Gives Claude live data access without exposing credentials.
2. **GitHub issue manager**: MCP server wraps GitHub REST API; tools: `list_issues`, `create_issue`, `add_comment`. Claude Code uses this to let developers ask "what issues are blocking the release?" without leaving the terminal.
3. **RAG document search**: MCP server wraps a vector store (Pinecone/Qdrant); tool `search_knowledge_base(query, top_k)` → embeds query → returns top-k document chunks. Gives any MCP client access to a private knowledge base.
