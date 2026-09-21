# Linear Connector

**Purpose:** Manage issues, projects, and cycles in Linear. Used for automated issue creation, sprint planning, and engineering workflow automation.

## Capabilities
- Create, update, and close issues
- Assign issues to team members and set priority
- Manage projects, cycles (sprints), and milestones
- Add labels and comments
- Query issues by team, project, assignee, or state
- Subscribe to webhooks for issue events

## Authentication
| Method | Use Case |
|---|---|
| API Key | Personal scripts, single-user integrations |
| OAuth 2.0 | Team apps, multi-user access |

## Common Workflows
1. **Bug report automation**: Error from Sentry → create Linear issue with stack trace
2. **Sprint planning assistant**: LLM analyzes backlog → suggests cycle assignments
3. **PR → Issue linker**: GitHub PR merged → auto-close linked Linear issue
4. **Weekly digest**: Query all issues updated this week → generate Slack summary

## Official MCP Server
[modelcontextprotocol/servers/linear](https://github.com/modelcontextprotocol/servers/tree/main/src/linear) — tools: `linear_create_issue`, `linear_search_issues`, `linear_update_issue`

## SDK / Client Libraries
- [@linear/sdk](https://github.com/linear/linear/tree/master/packages/sdk) — official TypeScript SDK (GraphQL-based)

## Official Docs
- [Linear API Docs](https://developers.linear.app/docs) — GraphQL API reference
- [Linear Webhooks](https://developers.linear.app/docs/graphql/webhooks) — event-driven integration

## Limitations
- GraphQL-only API (no REST) — requires understanding GraphQL queries
- Webhook payloads don't include full issue data (need a follow-up API call)
- Rate limit: 1,500 requests/hour
