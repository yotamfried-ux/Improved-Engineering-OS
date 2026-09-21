# claude-code-workflows

**One-line summary:** A template repository you copy from manually to add automated code, design, and security review to your Claude Code workflow — via subagents, slash commands, and GitHub Actions.

---

## Source

- **Repository:** https://github.com/OneRedOak/claude-code-workflows
- **License:** MIT (Patrick Ellis)

---

## What it ships

This is a **template/example repository**, not a packaged plugin. There is no installer and no manifest. You browse the repo and manually copy the artifacts you want into your own project.

**Subagents** (copy into `.claude/agents/`):
- `pragmatic-code-review` — model: `claude-opus-4-1-20250805`. Source: `code-review/pragmatic-code-review-subagent.md`
- `design-review` — model: `claude-sonnet-*`. Requires Playwright MCP and a live preview environment. Source: `design-review/design-review-agent.md`

**Slash commands** (copy into `.claude/commands/`):
- `/design-review` — trigger design review against a live preview URL
- Pragmatic code-review slash command (from `code-review/`)
- `/security-review` — trigger security review

**GitHub Actions** (copy into `.github/workflows/`):
- `claude-code-review.yml` — standard Claude Code Review PR workflow using `anthropics/claude-code-action@v1`
- `claude-code-review-custom.yml` — customized variant of the above
- `security.yml` — automated security review on PRs

**Dual-Loop Architecture:**
- Inner loop: slash commands and subagents for iterative development within a Claude Code session
- Outer loop: GitHub Actions that trigger automated review on every PR

---

## Reality check

A widely-circulated description claims this repo ships "5 parallel review agents by angle." **This is not accurate for this repository.** There are no five specialized angle-agents and no parallel fan-out orchestration. The repo provides three review domains (code, design, security) as separate, independent artifacts. Do not install this expecting a multi-agent parallel-review harness.

---

## Status

| Field | Value |
|---|---|
| Wrapper status | Active |
| Type tags | `review`, `orchestration` |
| Execution Level | **Level 1** (default) for code review; **Level 2** for large refactors and before merging significant PRs |
| Trigger | Manual (slash commands); automatic on PR (GitHub Actions) |

---

## Install (quick summary)

Manual file copy from the source repo into your project. No installer exists. See [`activation.md`](./activation.md) for exact steps.

---

## See also

| File | Purpose |
|---|---|
| [`integration.md`](./integration.md) | Functional role, when to use, workflow impact, composition |
| [`policy.md`](./policy.md) | Classification, execution level, trigger rules, constraints |
| [`activation.md`](./activation.md) | Prerequisites, install steps, verification, secrets, disable/uninstall |
