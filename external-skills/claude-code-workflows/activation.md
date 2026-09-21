# claude-code-workflows — Activation

## Prerequisites

| Requirement | Details |
|---|---|
| Claude Code CLI | Must be installed and authenticated |
| GitHub repo (for Actions) | Required only for the outer-loop GitHub Actions workflows |
| `CLAUDE_CODE_OAUTH_TOKEN` or `CLAUDE_API_KEY` | Must be set as a GitHub repository secret for Actions to authenticate |
| Playwright MCP | Required only for the `design-review` subagent and `/design-review` slash command |
| Live preview environment | Required only for `design-review` — a reachable URL where the app is deployed for review |

---

## Install

There is no installer. You clone the source repo locally, identify the artifacts you want, and copy them into your project manually.

### Step 1 — Clone the template repo

```bash
git clone https://github.com/OneRedOak/claude-code-workflows.git /tmp/claude-code-workflows
```

### Step 2 — Create the target directories in your project

```bash
mkdir -p .claude/agents
mkdir -p .claude/commands
mkdir -p .github/workflows
```

### Step 3 — Copy subagents

```bash
# Pragmatic code review subagent (model: claude-opus-4-1-20250805)
cp /tmp/claude-code-workflows/code-review/pragmatic-code-review-subagent.md .claude/agents/pragmatic-code-review.md

# Design review subagent (model: claude-sonnet-*; requires Playwright MCP + preview URL)
cp /tmp/claude-code-workflows/design-review/design-review-agent.md .claude/agents/design-review.md
```

### Step 4 — Copy slash commands

```bash
# Design review slash command
cp /tmp/claude-code-workflows/design-review/<slash-command-file>.md .claude/commands/design-review.md

# Pragmatic code review slash command (check code-review/ dir for the command file)
cp /tmp/claude-code-workflows/code-review/<slash-command-file>.md .claude/commands/pragmatic-code-review.md

# Security review slash command
cp /tmp/claude-code-workflows/security-review/<slash-command-file>.md .claude/commands/security-review.md
```

> Note: Inspect `code-review/`, `design-review/`, and `security-review/` directories in the cloned repo to identify which `.md` files are subagent definitions vs. slash command definitions. Subagent files go into `.claude/agents/`; command files go into `.claude/commands/`. The distinction is usually indicated by filename or a frontmatter `type:` field in the file.

### Step 5 — Copy GitHub Actions workflows

```bash
cp /tmp/claude-code-workflows/.github/workflows/claude-code-review.yml .github/workflows/
cp /tmp/claude-code-workflows/.github/workflows/claude-code-review-custom.yml .github/workflows/
cp /tmp/claude-code-workflows/.github/workflows/security.yml .github/workflows/
```

The standard workflow uses `anthropics/claude-code-action@v1`. The relevant section looks like this:

```yaml
- name: Claude Code Review
  uses: anthropics/claude-code-action@v1
  with:
    claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
```

Review each `.yml` file and adapt triggers, branches, and any project-specific inputs before committing.

### Step 6 — Adapt the copied files to your project

Read each copied file. The prompts are starting points — update them to reflect your project's conventions, stack, and review priorities. This is expected; the source repo is a template, not a drop-in plugin.

---

## Config / Secrets

### GitHub Actions secret

Set one of the following as a repository secret in **GitHub → Settings → Secrets and variables → Actions**:

| Secret name | When to use |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | Recommended default for `anthropics/claude-code-action@v1` |
| `CLAUDE_API_KEY` | Alternative if OAuth token is not available |

To set via GitHub CLI:
```bash
gh secret set CLAUDE_CODE_OAUTH_TOKEN --body "<your-token>"
```

### Playwright MCP (for design-review only)

If using the `design-review` subagent, Playwright MCP must be configured in your Claude Code MCP settings. Add it to your project's `.mcp.json` or user MCP config:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

You must also have a live preview URL available when invoking `/design-review`. The subagent navigates a real browser — it cannot work without a reachable URL.

---

## Verify Presence

After copying, confirm the artifacts are in place:

```bash
# Subagents
ls .claude/agents/pragmatic-code-review.md
ls .claude/agents/design-review.md

# Slash commands
ls .claude/commands/

# GitHub Actions
ls .github/workflows/claude-code-review.yml
ls .github/workflows/claude-code-review-custom.yml
ls .github/workflows/security.yml
```

In Claude Code, run `/help` and confirm that `/design-review`, `/security-review`, and the pragmatic code-review command appear in the command list. If they do not appear, check that the files are in `.claude/commands/` (not `.claude/agents/`) and that they have valid frontmatter.

---

## Disable / Uninstall

To disable a specific artifact, remove or rename its file:

```bash
# Remove a subagent
rm .claude/agents/pragmatic-code-review.md

# Remove a slash command
rm .claude/commands/design-review.md

# Remove GitHub Actions (stops outer-loop review on PRs)
rm .github/workflows/claude-code-review.yml
rm .github/workflows/claude-code-review-custom.yml
rm .github/workflows/security.yml
```

Commit the deletions. The GitHub Actions will stop triggering on new PRs once the workflow files are removed from the default branch.

To disable the secret without deleting it:
```bash
# Overwrite with an invalid placeholder to disable without losing the original
gh secret set CLAUDE_CODE_OAUTH_TOKEN --body "disabled"
```

---

## Reference

See `scripts/skill-bootstrap.sh` in the Engineering OS repo for a bootstrap helper that automates directory creation and common copy steps across skill integrations.
