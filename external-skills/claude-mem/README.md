# claude-mem

Cross-session memory for Claude Code: automatically captures tool-use observations,
generates semantic summaries, and injects prior context into future sessions.

## Source

- **Repo:** https://github.com/thedotmack/claude-mem
- **License:** Apache-2.0
- **Version verified against:** v13.6.1

## What it ships

claude-mem is a **combination system**, not a single component:

| Component | Description |
|---|---|
| Claude Code plugin | Registered via `/plugin marketplace add` or `npx claude-mem install` |
| MCP server (`mcp-search`) | stdio server (`scripts/mcp-server.cjs`) exposing `search`, `timeline`, `get_observations` |
| Lifecycle hooks | `plugin/hooks/hooks.json` — Setup, SessionStart, UserPromptSubmit, PostToolUse(*), PreToolUse(Read), Stop |
| Background worker | HTTP service (`worker-service.cjs`) on **port 37777**, started by hooks automatically |
| npm SDK/library | Published to npm (`claude-mem` package) — the SDK only; does not install hooks or plugin |
| Storage | SQLite with FTS5 at `~/.claude-mem/`; optional Chroma vector DB |
| Skills (16) | `mem-search`, `how-it-works`, `make-plan`, `learn-codebase`, `smart-explore`, `timeline-report`, `standup`, `version-bump`, `babysit`, `pathfinder`, and 6 more |

### How it works in brief

```
PostToolUse hook   → captures observations about every tool call
Stop hook          → generates a semantic summary of the session
SessionStart hook  → injects prior context into the new session
UserPromptSubmit   → enriches prompt with relevant memories
```

Storage is **local disk only** (`~/.claude-mem/`). Nothing is sent to a remote service
unless Chroma is explicitly configured.

## Status

| Field | Value |
|---|---|
| Wrapper status | Active |
| Classification | `memory`, `context-persistence` |
| Execution Level | **LEVEL 2 — system dependency** for multi-session projects (passive once installed; hooks operate automatically) |

## Install summary

**Recommended (plugin marketplace):**

```
# Inside Claude Code:
/plugin marketplace add thedotmack/claude-mem
/plugin install claude-mem
# Then restart Claude Code
```

**Alternative (npx):**

```bash
npx claude-mem install
# Optional: npx claude-mem install --ide gemini-cli
```

> **WARNING:** `npm install -g claude-mem` installs the SDK/library ONLY.
> It does NOT register plugin hooks, set up the worker, or configure the MCP server.
> Use the plugin install path above for the full system.

Full prerequisites, verification, and config: [activation.md](./activation.md).

## Privacy

All observations and summaries are persisted to **`~/.claude-mem/`** on local disk.
The background worker exposes a web viewer at `http://localhost:37777`.

To exclude sensitive content from capture, wrap it in `<private>` tags in your prompts.
Sensitive file paths, credentials, or personal data should never appear outside `<private>`
blocks if you do not want them recorded.

---

See also:
- [integration.md](./integration.md) — functional role, when to use, composition model
- [policy.md](./policy.md) — classification, execution level, composition rules
- [activation.md](./activation.md) — prerequisites, install steps, config, disable/uninstall
