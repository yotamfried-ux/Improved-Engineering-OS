# Notion Connector

**Purpose:** Read and write Notion pages and databases. Used for knowledge base integration, project tracking, and content management.

## Capabilities
- Read and write pages and page content (blocks)
- Query databases with filters and sorts
- Create and update database records
- Manage page properties, covers, and icons
- Search across a workspace
- Comment on pages

## Authentication
| Method | Use Case |
|---|---|
| Internal Integration Token | Single-workspace app, private tools |
| OAuth 2.0 (Public Integration) | Multi-workspace app, distributable |

Integration must be granted access to specific pages/databases in Notion Settings → Integrations.

## Common Workflows
1. **Knowledge base search**: Query Notion docs → embed in RAG pipeline → answer questions
2. **Task sync**: Create Notion database records from GitHub issues or Linear tickets
3. **Content publishing**: Read Notion pages as CMS → render as website (Notion-to-web)
4. **Meeting notes**: Auto-create Notion page with AI-generated summary after each call

## Official MCP Server
[modelcontextprotocol/servers/notion](https://github.com/modelcontextprotocol/servers/tree/main/src/notion) — tools: `notion_search`, `notion_get_page`, `notion_create_page`, `notion_query_database`

## SDK / Client Libraries
- [@notionhq/client](https://github.com/makenotion/notion-sdk-js) — official JavaScript/TypeScript SDK
- [notion-client (Python)](https://github.com/ramnes/notion-sdk-py) — Python SDK

## Official Docs
- [Notion API Docs](https://developers.notion.com) — complete REST API reference
- [Notion SDK JS](https://github.com/makenotion/notion-sdk-js#readme) — JavaScript client

## Limitations
- API rate limit: 3 requests/second per integration
- Block content returned as array of block objects (not plain text) — requires parsing
- Nested block fetching requires recursive API calls (children not auto-included)
- Rich text formatting (bold, inline code) requires block-level manipulation
