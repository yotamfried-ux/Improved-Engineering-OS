# Local Process MCP Server (stdio)

## Description
A local process MCP server runs as a child process on the user's machine, communicating with the MCP client (Claude Desktop, Claude Code) via stdin/stdout (stdio transport). The client starts the server process on demand and kills it when the session ends. This is the simplest deployment model — no HTTP, no auth, no infrastructure.

## When to Use
- Claude Desktop or Claude Code integrations for a single developer
- Accessing local files, databases, or system resources
- Development tools that wrap local CLI commands (git, docker, npm)
- Rapid prototyping — zero infrastructure required
- Internal company tools where all users run the server locally

## When NOT to Use
- Multiple users need to share one server instance
- The server needs to maintain state between sessions
- The tool requires server-side auth flows (OAuth callback URLs)
- Latency matters — process startup adds 100-500ms per session

## Architecture

```
Claude Desktop / Claude Code
        │
        │ spawns process, pipes stdio
        ▼
   MCP Server (Node.js / Python)
        │
        ├── Tool handlers (async functions)
        ├── Resource providers (URI readers)
        └── Prompt templates
```

## Key Implementation Notes
- Server must read from `stdin` and write to `stdout` — never use `console.log` for debugging (it breaks the protocol); use `console.error` or a file logger instead
- Process must exit cleanly when stdin closes — the client signals session end by closing the pipe
- Environment variables set in the Claude Desktop config are the standard way to pass API keys and secrets to the server
- Long-running operations should stream progress via notifications, not block the response

## Reference Implementations
- [modelcontextprotocol/servers/filesystem](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) — canonical stdio server example
- [modelcontextprotocol/servers/github](https://github.com/modelcontextprotocol/servers/tree/main/src/github) — stdio server with external API calls

## Official Sources
- [MCP stdio Transport Spec](https://modelcontextprotocol.io/docs/concepts/transports#stdio) — specification for stdio transport
- [Claude Desktop MCP Config](https://modelcontextprotocol.io/quickstart/user) — configuring local MCP servers
