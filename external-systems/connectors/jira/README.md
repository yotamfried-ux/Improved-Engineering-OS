# Jira Connector

**Purpose:** Manage Jira issues, sprints, and projects. Used for automated issue creation, sprint management, and engineering workflow integration.

## Capabilities
- Create, update, transition, and close issues
- Add comments and attachments
- Query issues with JQL (Jira Query Language)
- Manage sprints and backlog
- Access project metadata (statuses, issue types, priorities)
- Subscribe to issue events via webhooks

## Authentication
| Method | Use Case |
|---|---|
| API Token + Email | Personal scripts, server-to-server (Cloud) |
| OAuth 2.0 (3LO) | User-facing apps acting on behalf of user |
| Personal Access Token | Jira Data Center (self-hosted) |

Base URL format: `https://your-domain.atlassian.net/rest/api/3/`

## Common Workflows
1. **Bug report automation**: Error from Sentry → create Jira bug with stack trace, severity, and affected version
2. **Sprint planning assistant**: Query backlog with JQL → LLM analyzes → suggests sprint assignment
3. **Release gate**: Check all issues in sprint are "Done" before triggering deployment
4. **Weekly status report**: JQL query for resolved issues this week → generate Slack summary

## Official MCP Server
Community: [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian) — Jira + Confluence MCP server (tools: `jira_search`, `jira_get_issue`, `jira_create_issue`)

## SDK / Client Libraries
- [atlassian/jira.js](https://github.com/atlassian/jira.js) — official Jira REST API Node.js client
- [atlassian-api/atlassian-python-api](https://github.com/atlassian-api/atlassian-python-api) — Python client for Jira + Confluence

## Official Docs
- [Jira Cloud REST API v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/) — complete REST reference
- [JQL Reference](https://support.atlassian.com/jira-service-management-cloud/docs/use-advanced-search-with-jira-query-language-jql/) — Jira Query Language
- [Atlassian OAuth 2.0 Guide](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/) — 3-legged OAuth setup

## Limitations
- API v3 returns account IDs (not usernames) — must resolve display names with a separate `/users` call
- Rate limit: 10 requests/second per token (burst), 100 requests/minute sustained
- Webhooks don't retry on failure — use Forge or a dedicated queue for reliability
- JQL has a 32,000 character limit per query
