# claude-mem — Activation

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js >= 20** | Required by the npm CLI and worker |
| **Bun** | Runtime for the worker service; auto-installed by claude-mem on first run if absent |
| **uv** | Python package manager used internally; auto-installed by claude-mem on first run if absent |
| **SQLite3** | Storage backend; typically pre-installed on macOS and most Linux distros |
| **Claude Code CLI** | Authenticated and working |
| **ANTHROPIC_API_KEY** | Required for the Stop-hook summarization step; can be overridden with `CLAUDE_MEM_ANTHROPIC_API_KEY` |
| **Port 37777 available** | The background worker binds to this port on localhost |

> If Bun or uv auto-installation is restricted in your environment, install them manually
> before running `npx claude-mem install`:
> - Bun: https://bun.sh/docs/installation
> - uv: https://docs.astral.sh/uv/getting-started/installation/

---

## Install

### Option A — Plugin marketplace (recommended)

Run both commands **inside Claude Code** (the chat interface):

```
/plugin marketplace add thedotmack/claude-mem
/plugin install claude-mem
```

Then **restart Claude Code**. On next start, the plugin registers:
- All lifecycle hooks (`plugin/hooks/hooks.json`)
- The `mcp-search` MCP server (`plugin/.mcp.json`)
- All 16 skills under `plugin/skills/`
- The background worker (auto-started by the Setup/SessionStart hooks)

No manual edits to `settings.json` or `.mcp.json` are required.

### Option B — npx (outside Claude Code, e.g., from a terminal)

```bash
npx claude-mem install
```

Optional flags:

```bash
npx claude-mem install --ide gemini-cli    # for Gemini CLI instead of Claude Code
npx claude-mem install --ide opencode      # for OpenCode
```

This performs the same registration as Option A but from a shell prompt.

### What NOT to do

```bash
# DO NOT use this — installs the SDK library only, NOT the plugin or hooks:
npm install -g claude-mem
```

---

## Verify Presence

After install and restart, confirm all components are active:

### 1. Plugin and hooks registered

In a Claude Code session, run:

```
/plugin list
```

`claude-mem` should appear in the installed plugins list.

### 2. Worker reachable

From a terminal:

```bash
curl -s http://localhost:37777/health
```

Expected response: a JSON object with `{ "status": "ok" }` or similar. If the port is
not responding, the worker may not have started. Trigger it by opening a Claude Code
session (the SessionStart hook starts the worker) or run:

```bash
npx claude-mem start
```

### 3. MCP server available

Inside a Claude Code session, the `mcp-search` server should be listed when you check
available MCP tools. Confirm by asking Claude:

> "What MCP tools are available?" — `search`, `timeline`, and `get_observations` from
> `mcp-search` should appear.

### 4. Memory web viewer (optional)

Open `http://localhost:37777` in a browser. The worker serves a web UI for browsing
captured observations and summaries.

---

## Config / Secrets

### Core environment variables

| Variable | Purpose | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Used for session summarization (Stop hook) | Must be set |
| `CLAUDE_MEM_ANTHROPIC_API_KEY` | Override for a separate key dedicated to claude-mem | Falls back to `ANTHROPIC_API_KEY` |
| `CLAUDE_MEM_AUTH_MODE` | Authentication mode for the worker HTTP API | `none` (localhost only) |
| `CLAUDE_MEM_MODE` | Storage mode: `sqlite` (default) or `chroma` | `sqlite` |

### Context injection tuning

| Variable | Purpose |
|---|---|
| `CLAUDE_MEM_CONTEXT_MAX_TOKENS` | Maximum tokens injected at SessionStart |
| `CLAUDE_MEM_CONTEXT_MAX_OBSERVATIONS` | Maximum number of observations to inject |
| `CLAUDE_MEM_CONTEXT_RECENCY_WEIGHT` | Weight given to recency vs. relevance in ranking |

### Chroma vector DB (optional)

| Variable | Purpose |
|---|---|
| `CLAUDE_MEM_CHROMA_HOST` | Chroma server host |
| `CLAUDE_MEM_CHROMA_PORT` | Chroma server port |
| `CLAUDE_MEM_CHROMA_COLLECTION` | Collection name to use |
| `CLAUDE_MEM_CHROMA_AUTH_TOKEN` | Auth token if Chroma requires authentication |

### Settings file

Auto-created at first run:

```
~/.claude-mem/settings.json
```

Manual edits to this file are supported. The file controls the same options as the
environment variables above and takes lower precedence than env vars.

---

## Disable / Uninstall

### Stop the worker (without uninstalling)

```bash
npx claude-mem stop
```

The worker will not restart until a new Claude Code session is opened (SessionStart hook).

### Uninstall via plugin command

Inside Claude Code:

```
/plugin uninstall claude-mem
```

Then restart Claude Code. This removes the plugin registration, hooks, MCP server config,
and skills. It does NOT delete `~/.claude-mem/` or its stored data.

### Uninstall via npx

```bash
npx claude-mem uninstall
```

### Delete stored memory

To wipe all captured observations, summaries, and the SQLite database:

```bash
rm -rf ~/.claude-mem/
```

This is irreversible. There is no export-before-delete step built in; if you want to
preserve data, copy the directory first.

---

## Reference

For a scripted install workflow, see `scripts/skill-bootstrap.sh` in the Engineering OS
repository root. That script covers prerequisite checks and can be adapted to include
claude-mem installation as part of a new project setup.
