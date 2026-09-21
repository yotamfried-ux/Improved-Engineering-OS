# Remote HTTP MCP Server

## Description
A remote MCP server exposes MCP protocol over HTTP, using Server-Sent Events (SSE) for streaming or the newer Streamable HTTP transport. It runs as a persistent web service (not a per-session process) and can serve multiple MCP clients simultaneously. Auth is handled via OAuth 2.0 (the MCP spec's recommended approach for remote servers).

## When to Use
- Shared team tool that multiple developers connect to
- SaaS product that exposes capabilities to AI clients
- Server needs to call services with OAuth callbacks (e.g., Google, Slack)
- Enterprise deployment where the server runs in a secured network and clients connect from outside

## When NOT to Use
- Single-developer local tool — stdio is simpler and has zero infra cost
- Extremely low-latency requirements — HTTP adds round-trip overhead vs. stdio

## Architecture

```
Claude Desktop / Claude Code / MCP Client
        │
        │ HTTP + SSE (or Streamable HTTP)
        ▼
   MCP HTTP Server (Node.js / Python)
        │
        ├── OAuth 2.0 auth middleware
        ├── Tool handlers
        └── Resource providers
```

## Key Implementation Notes
- Use Streamable HTTP transport (the 2025 standard) over SSE for new servers; SSE is the older approach
- Implement token-based auth: validate a bearer token or OAuth access token on every request
- The server is stateless per-request (like REST); session state must be stored externally (Redis, DB) if needed
- Use HTTPS in production — MCP clients will reject plaintext HTTP for remote servers

## Reference Implementations
- [modelcontextprotocol/typescript-sdk/examples](https://github.com/modelcontextprotocol/typescript-sdk/tree/main/examples) — HTTP server examples

## Official Sources
- [MCP HTTP Transport Spec](https://modelcontextprotocol.io/docs/concepts/transports#http-with-sse) — HTTP+SSE transport specification
- [MCP Authorization Spec](https://modelcontextprotocol.io/docs/concepts/authorization) — OAuth 2.0 for remote MCP servers
- [Cloudflare MCP Workers Tutorial](https://developers.cloudflare.com/workers/tutorials/build-mcp-server/) — deploying remote MCP servers on Cloudflare Workers
