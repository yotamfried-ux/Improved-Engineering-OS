# GitHub Connector

**Purpose:** Connect to GitHub repositories, issues, PRs, and code. Powers code review automation, issue management, and CI/CD triggers.

## Capabilities
- Read/write files in repositories
- List, create, update, and comment on issues and pull requests
- Search code, issues, repositories, and users
- Trigger GitHub Actions workflows
- Manage branches, commits, and releases
- Access repository metadata and collaborators

## Authentication
| Method | Use Case |
|---|---|
| Personal Access Token (PAT) | Developer scripts, local tools, single-user |
| GitHub App + Installation Token | Multi-repo bots, Actions, production integrations |
| OAuth 2.0 | User-facing apps that act on behalf of the user |

Fine-grained PATs (recommended): scope to specific repos and permissions.

## Common Workflows
1. **PR Review Bot**: On PR open → read diff → call LLM → post review comment
2. **Issue Triage**: On issue create → classify by label → assign to team
3. **Release Notes**: On tag push → read commits since last tag → generate changelog
4. **Code Search**: Find all usages of a deprecated function across repos

## Official MCP Server
[modelcontextprotocol/servers/github](https://github.com/modelcontextprotocol/servers/tree/main/src/github) — tools: `search_repositories`, `get_file_contents`, `create_issue`, `create_pull_request`, `push_files`

## SDK / Client Libraries
- [octokit/octokit.js](https://github.com/octokit/octokit.js) — official GitHub REST + GraphQL client (TypeScript)
- [PyGithub/PyGithub](https://github.com/PyGithub/PyGithub) — Python GitHub client

## Official Docs
- [GitHub REST API](https://docs.github.com/en/rest) — complete REST reference
- [GitHub Apps Docs](https://docs.github.com/en/apps) — building GitHub Apps
- [Octokit Docs](https://octokit.github.io/octokit.js/) — SDK reference

## Limitations
- API rate limits: 5,000 req/hour (PAT), 15,000 req/hour (GitHub App)
- Large file reads require Git LFS or chunked API calls
- Webhooks don't support guaranteed delivery — use GitHub Apps for reliability
