# Google Sheets Connector

**Purpose:** Read and write spreadsheet data programmatically. Used for data entry automation, reporting pipelines, and lightweight database replacement in non-technical workflows.

## Capabilities
- Read cell ranges (A1 notation)
- Write and append rows of data
- Create and manage sheets within a spreadsheet
- Format cells (bold, color, borders) via the Sheets API
- Batch read/write for performance (batchGet / batchUpdate)
- Subscribe to spreadsheet change events
- Use as a simple database for low-volume structured data

## Authentication
| Method | Use Case |
|---|---|
| Service Account | Server-to-server automation (share sheet with service account email) |
| OAuth 2.0 | User-facing apps writing to user's sheets |

Service account requires sharing the target spreadsheet with the service account email address.

## Common Workflows
1. **Report generation**: Query database → format results → append rows to a shared Google Sheet weekly
2. **Form response processing**: Google Form submits to Sheet → webhook or poll → process and route responses
3. **Content calendar**: AI generates content ideas → writes rows to a content calendar sheet
4. **Lightweight CRM**: Read leads from Sheet → enrich with API → write back enriched data

## Official MCP Server
Community: [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) — check for Google Sheets support; basic read/write via community contributions

## SDK / Client Libraries
- [googleapis/google-api-nodejs-client](https://github.com/googleapis/google-api-nodejs-client) — official Node.js client (Sheets v4)
- [google-api-python-client](https://github.com/googleapis/google-api-python-client) — official Python client

## Official Docs
- [Sheets API v4 Docs](https://developers.google.com/sheets/api/guides/concepts) — concepts and reference
- [Sheets API Quickstart](https://developers.google.com/sheets/api/quickstart/nodejs) — Node.js getting started
- [Service Account Guide](https://developers.google.com/identity/protocols/oauth2/service-account) — server-to-server auth

## Limitations
- Sheets API quota: 300 requests/minute per project (batch operations count as 1)
- Spreadsheets have a 10M cell limit — not suitable for large datasets
- No real-time push from Sheets (polling required unless using Google Apps Script triggers)
- Complex formatting (merged cells, conditional formatting) significantly complicates read logic
