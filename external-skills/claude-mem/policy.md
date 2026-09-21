# claude-mem — Policy

## Classification

| Field | Value |
|---|---|
| Type tags | `memory`, `context-persistence` |
| Source license | Apache-2.0 |
| Source repo | https://github.com/thedotmack/claude-mem |
| Config/secrets required | `ANTHROPIC_API_KEY` (or `CLAUDE_MEM_ANTHROPIC_API_KEY`) for summarization; all others optional |
| Scope | User-global (`~/.claude-mem/` storage shared across all projects) |
| Runtime dependency | Background Bun worker on port 37777; SQLite at `~/.claude-mem/` |

## Execution Level

| Condition | Level |
|---|---|
| Multi-session project with claude-mem installed | **LEVEL 2 — must be installed and running** for cross-session continuity; passive once active |
| One-off or throwaway task | **LEVEL 0** — not applicable; install overhead is not justified |
| Environment cannot run background worker | **LEVEL 0** — do not install; prerequisite cannot be met |

**What "Level 2 passive" means here:**

claude-mem is not a step Claude "invokes" per task. It is infrastructure. "Mandatory for
multi-session projects" means:

1. Before starting a long-running project, confirm claude-mem is installed and the worker
   is running (see [activation.md](./activation.md) — Verify Presence).
2. Once confirmed running, no further action is needed per session or per task. The hooks
   fire automatically.
3. If the worker is down, cross-session context will be lost until it is restarted. Treat
   a stopped worker as a degraded-mode condition, not normal operation.

Claude does not invoke a `claude-mem` skill at the start of each task. It simply benefits
from the injected context that the SessionStart hook provides.

## Composition Rules

- **Operates continuously and at session boundaries.** Not scoped to a single task phase.
- **Does not override security skills.** If a security review or audit flags content,
  claude-mem's prior-context injection does not constitute approval of that content.
- **`<private>` exclusions are authoritative.** Any content wrapped in `<private>` tags
  in user prompts must not appear in captured observations or summaries. This is enforced
  by the plugin's observation-capture logic, but the user is responsible for applying
  the tags to sensitive content.
- **Storage is shared across projects.** `~/.claude-mem/` holds observations from all
  projects on the machine. Context injection is scoped by the worker's relevance ranking,
  but there is no hard project-level isolation of the store.
- **Summarization consumes API tokens.** The Stop hook calls the configured Anthropic
  model to generate a session summary. This is billed against the `ANTHROPIC_API_KEY`
  in use. On long sessions with many tool calls, summarization cost can be non-trivial.
- **Does not replace Engineering OS quality gates.** Memory-injected context is input to
  Claude's reasoning; it is not a verified ground truth. All claims from injected context
  must be validated the same way any other claim is validated — through tools, not
  assumption.

## Notes and Caveats

### Background worker and port

The worker service (`worker-service.cjs`) starts automatically when hooks fire. It binds
to **port 37777** on localhost. Environments with strict port restrictions or no persistent
process support (e.g., ephemeral CI containers, serverless sandboxes) cannot run
claude-mem correctly.

### Bun and uv auto-installation

On first run, claude-mem installs **Bun** and **uv** automatically if they are not
present. In environments where package auto-installation is prohibited by policy (e.g.,
hardened CI, corporate laptops with restricted package managers), verify these are
pre-installed or obtain approval before installing claude-mem.

### Disk persistence

All observations, summaries, and the SQLite database live at `~/.claude-mem/`. This
directory persists across reboots and is not automatically pruned. On machines with disk
quotas or shared home directories, monitor growth. A manual `claude-mem clear` or
deletion of `~/.claude-mem/` will wipe all stored memory.

### Privacy via `<private>` tags

The hook system captures observations broadly (every tool call via `PostToolUse(*)`).
Use `<private>` tags in prompts to exclude specific content. Do not use claude-mem in
sessions that handle credentials, PII, or proprietary data that must not be written to
local disk, unless you are confident that `<private>` coverage is complete.

### npm global install warning

`npm install -g claude-mem` installs the SDK/library ONLY. It does not install the
plugin, register hooks, configure the MCP server, or start the worker. Use
`npx claude-mem install` or the `/plugin` commands to get the full system.
