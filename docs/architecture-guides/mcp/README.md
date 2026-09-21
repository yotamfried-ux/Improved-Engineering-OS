# MCP Architecture Guide

> Navigation index for Model Context Protocol (MCP) server architecture patterns.

## Overview
MCP (Model Context Protocol) is Anthropic's open standard for connecting AI assistants to external tools and data. This guide covers the architecture of MCP servers — how to design, build, test, and deploy them in production.

## Architecture Patterns

| Pattern | Transport | Best For |
|---|---|---|
| [Local Process Server](./local-process.md) | stdio | Claude Desktop/Code integrations, dev tools, local file access |
| [Remote HTTP Server](./remote-server.md) | HTTP+SSE / Streamable HTTP | Multi-user SaaS, shared team tools, cloud-hosted data |
| [Proxy / Gateway Server](./gateway.md) | Any | Aggregating multiple MCP servers, adding auth to existing APIs |

## Decision Guide

```
Is this server for one developer / local machine?
  → stdio (Local Process) — zero infrastructure, no auth needed

Does the server need to serve multiple users or clients?
  → Remote HTTP Server — deploy like any API, add OAuth 2.0

Are you aggregating 10+ MCP servers into a unified interface?
  → Gateway / Proxy pattern — single endpoint, fan-out routing
```

## Core Concepts

| Primitive | Description | Use When |
|---|---|---|
| **Tool** | Callable function the LLM invokes | Write actions, API calls, computations |
| **Resource** | Read-only URI-addressable data | Files, configs, database records the LLM can read |
| **Prompt** | Reusable prompt template with args | Common workflows, standardized task templates |

## Key Reference MCP Servers

| Server | Transport | What It Provides |
|---|---|---|
| [Filesystem](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) | stdio | Read/write local files and directories |
| [GitHub](https://github.com/modelcontextprotocol/servers/tree/main/src/github) | stdio | Repos, issues, PRs, code search |
| [PostgreSQL](https://github.com/modelcontextprotocol/servers/tree/main/src/postgres) | stdio | Read-only SQL queries on PostgreSQL |
| [Slack](https://github.com/modelcontextprotocol/servers/tree/main/src/slack) | stdio | Send messages, read channels |
| [Google Drive](https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive) | stdio | List, read, search Drive files |
| [Linear](https://github.com/modelcontextprotocol/servers/tree/main/src/linear) | stdio | Issues, projects, cycles, comments |
| [Notion](https://github.com/modelcontextprotocol/servers/tree/main/src/notion) | stdio | Pages, databases, blocks |

## Testing & Debugging

- **MCP Inspector**: `npx @modelcontextprotocol/inspector <server-command>` — visual UI showing all tools/resources/prompts; call tools interactively
- **Unit tests**: Test tool handler functions directly, independent of MCP transport
- **Integration tests**: Use the MCP client SDK to start the server and call tools programmatically

## Related

- [external-systems/mcp-sdk](../../../external-systems/mcp-sdk/README.md) — SDK setup and code examples
- [external-systems/anthropic](../../../external-systems/anthropic/README.md) — Claude API integration
- [patterns/ai](../../../patterns/ai/README.md) — AI agent patterns that use MCP
