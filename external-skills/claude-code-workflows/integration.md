# claude-code-workflows — Integration

## Functional Role

`claude-code-workflows` acts as an **automated reviewer** across three domains:

1. **Code review** — pragmatic, opinionated review of diffs and PRs via a subagent running on `claude-opus-4-1-20250805`
2. **Design review** — visual and UX review against a live preview environment, via a subagent that drives a browser through Playwright MCP
3. **Security PR validation** — automated scanning and structured security feedback on PRs via a dedicated GitHub Actions workflow

These are integrated through a **Dual-Loop Architecture**:

- **Inner loop (iterative dev):** slash commands and subagents invoked directly inside a Claude Code session during development
- **Outer loop (PR gate):** GitHub Actions workflows that run on every pull request, posting review comments automatically without manual invocation

---

## When to Use

- After finishing a feature branch, before opening a PR: run `/pragmatic-code-review` or invoke the `pragmatic-code-review` subagent to catch issues early
- When a PR has significant UI changes: use `/design-review` to validate against a deployed preview (requires a live preview URL and Playwright MCP configured)
- On every PR automatically: once the GitHub Actions workflows are installed, the outer loop runs without any developer action required
- Before merging a large refactor or significant PR (Level 2 trigger): invoke code review at higher scrutiny; the Actions workflow provides a consistent outer gate

---

## When NOT to Use

- **Do not expect a drop-in plugin.** There is no installer. Every artifact must be manually copied. Budget time to read the source files and adapt them to your project's conventions before use.
- **Do not use `design-review` without Playwright MCP and a live preview environment.** The subagent navigates a real browser; it cannot review screenshots or static HTML. If you lack a preview deploy URL, skip this artifact.
- **Do not use this as a security depth tool for compliance or audit work.** The `/security-review` slash command and `security.yml` Action provide surface-level automated security feedback. For deeper security review, use the dedicated `security-review` skill which runs specialized security subagents.
- Do not use the GitHub Actions outer loop on private repos without first confirming your `CLAUDE_CODE_OAUTH_TOKEN` or `CLAUDE_API_KEY` secret is correctly scoped.

---

## How It Affects Claude's Workflow

Once installed:

- Slash commands appear in Claude Code and can be invoked during any session — no explicit skill activation needed
- Subagents (`pragmatic-code-review`, `design-review`) appear in `.claude/agents/` and are available for Claude to delegate to when their capabilities match the task
- GitHub Actions run on the outer loop independently of Claude Code sessions; review comments appear directly on PRs in GitHub

Claude should invoke code review slash commands or subagents at the **end of a coding task**, not mid-implementation. The outer-loop Actions do not require Claude involvement once installed.

---

## Concrete Artifacts

| Artifact | Type | Invocation | Notes |
|---|---|---|---|
| `pragmatic-code-review` | Subagent | Claude delegates, or user runs the slash command | Model: `claude-opus-4-1-20250805`; source: `code-review/pragmatic-code-review-subagent.md` |
| `design-review` | Subagent | `/design-review` slash command | Model: `claude-sonnet-*`; requires Playwright MCP + live preview URL; source: `design-review/design-review-agent.md` |
| `/design-review` | Slash command | Typed in Claude Code | Delegates to `design-review` subagent |
| `/security-review` | Slash command | Typed in Claude Code | Source: `security-review/` dir in repo |
| `claude-code-review.yml` | GitHub Action | Triggers on PR events | Uses `anthropics/claude-code-action@v1`; needs `CLAUDE_CODE_OAUTH_TOKEN` secret |
| `claude-code-review-custom.yml` | GitHub Action | Triggers on PR events | Customizable variant of the above |
| `security.yml` | GitHub Action | Triggers on PR events | Automated security review |

---

## Composition

- **Review phase, last.** These skills run after coding is complete and after any security gating. Do not invoke review subagents mid-feature or before the implementation is stable.
- **Outer loop on PRs.** The GitHub Actions provide a consistent review gate that runs regardless of what happened in the inner loop. This is complementary, not redundant: the inner loop gives fast feedback during dev; the outer loop enforces a baseline on every merge candidate.
- **Security depth:** for compliance, audit, or threat-model-level security review, prefer the dedicated `security-review` skill. The `/security-review` command and `security.yml` Action here provide lighter automated scanning — they do not replace a full security review skill pass.
