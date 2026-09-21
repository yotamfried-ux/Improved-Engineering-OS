# Google Drive Connector

**Purpose:** Read, write, and manage files in Google Drive. Used for document processing, file storage integration, and knowledge base building from Drive content.

## Capabilities
- List files and folders by query (name, type, parent folder)
- Download file content (Docs as text/markdown, Sheets as CSV, PDFs as binary)
- Upload and update files
- Manage sharing permissions
- Search across Drive by filename or content (full-text search)
- Watch for file changes via Push Notifications

## Authentication
| Method | Use Case |
|---|---|
| OAuth 2.0 (user consent) | Apps accessing a user's personal Drive |
| Service Account | Server-to-server access to a shared Drive |

Service accounts require the Drive to be explicitly shared with the service account email.

## Common Workflows
1. **Knowledge base ingestion**: Crawl a shared Drive folder → extract text from Docs/PDFs → embed for RAG
2. **Report generation**: Write analysis results as a new Google Doc in a shared folder
3. **Asset management**: Upload processed media files to a designated Drive folder
4. **Meeting notes**: Create Doc with AI summary → share with meeting attendees

## Official MCP Server
[modelcontextprotocol/servers/gdrive](https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive) — tools: `gdrive_search`, `gdrive_read_file`

## SDK / Client Libraries
- [googleapis/google-api-nodejs-client](https://github.com/googleapis/google-api-nodejs-client) — official Node.js client
- [google-api-python-client](https://github.com/googleapis/google-api-python-client) — official Python client

## Official Docs
- [Drive API v3 Docs](https://developers.google.com/drive/api/guides/about-sdk) — REST reference
- [Google Workspace Auth Guide](https://developers.google.com/workspace/guides/auth-overview) — OAuth and service accounts

## Limitations
- Exporting Google Docs/Sheets requires a specific export MIME type (not the native format)
- Push notifications require a publicly accessible webhook endpoint with HTTPS
- Service accounts can't access user's personal Drive unless shared explicitly
