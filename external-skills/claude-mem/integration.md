# claude-mem — Behavioral Contract

## Functional Role

claude-mem is the **cross-session memory layer** for Claude Code. It solves the problem
that each Claude Code session starts with a blank context: without it, observations,
decisions, and codebase understanding from prior sessions are lost.

The capture-summarize-inject cycle:

```
During session:
  PostToolUse(*) hook  → records an observation for every tool call (file reads,
                         searches, edits, test runs, API calls, etc.)
  PreToolUse(Read)     → may enrich the Read context with related prior observations

At session end:
  Stop hook            → generates a semantic summary of the session's work,
                         decisions, and findings; writes it to SQLite

At next session start:
  SessionStart hook    → queries SQLite for context relevant to the current project
                         and injects it into the system prompt
  UserPromptSubmit     → enriches each user prompt with memories matching the request
```

The worker service (`worker-service.cjs`, port 37777) handles all storage operations.
The MCP server (`mcp-search`) makes the stored context queryable during a session.

## When to use

claude-mem is valuable when:

- Working on a **long-running project** that spans multiple Claude Code sessions
- Needing to **resume work** after `/clear`, `/compact`, or a session restart without
  re-explaining what was done previously
- Wanting Claude to remember **codebase-specific decisions** (why a certain approach was
  chosen, which files are relevant to a feature, known pitfalls)
- Running background workers or pipelines where **continuity of state** matters between
  invocations (the `babysit` skill leverages this)
- Using the `learn-codebase` skill to build persistent understanding of a new repository

Once installed, claude-mem operates passively. No explicit invocation is needed per task.

## When NOT to use

Do not rely on claude-mem when:

- The task is **one-off or throwaway** — no benefit from persisting context that will
  never be referenced again
- The environment **cannot run a background Bun process** or expose port 37777 (e.g.,
  locked-down CI runners, sandboxed containers, environments that block outbound IPC)
- The code or prompts contain **sensitive data** (secrets, PII, proprietary IP) that
  must not persist to disk — even with `<private>` tags, the hook infrastructure is
  broad; prefer not installing claude-mem in these environments
- The machine cannot satisfy the runtime requirements (Node >= 20, Bun, uv, SQLite3)
  without administrative action that is not permitted
- Auto-installation of Bun and uv (which claude-mem performs on first run) is prohibited
  by policy

## How it affects Claude's workflow

claude-mem is **passive infrastructure** — it does not change which skills Claude invokes
or how Claude reasons through a task. Its effects are:

1. **At session start:** Claude receives injected context (prior observations, summaries)
   as part of the system prompt. Claude appears to "remember" past sessions without any
   explicit tool call by the user.
2. **During a session:** Every tool call is silently observed and recorded. The
   `PreToolUse(Read)` hook may prepend related prior context before file reads.
3. **At session end:** The Stop hook triggers a summarization pass (using the configured
   Anthropic model). This consumes API tokens and takes a few seconds.
4. **Between sessions:** No effect — the worker runs in the background, holding the
   SQLite store open.

Claude does not need to "invoke" claude-mem as a step. The hooks are deterministic and
fire automatically.

## Concrete artifacts you invoke

### MCP tools (via `mcp-search` server)

These are available inside a session and can be called explicitly when you need to
query memory directly:

| Tool | Purpose |
|---|---|
| `search` | Semantic / FTS search over captured observations and summaries |
| `timeline` | Retrieves a chronological timeline of session activity |
| `get_observations` | Fetches raw observations for a given time range or filter |

### Notable skills

Invoked through the Claude Code `Skill` tool when available:

| Skill | Purpose |
|---|---|
| `mem-search` | Explicit memory search — find what Claude has seen before in this project |
| `learn-codebase` | Systematically explore and index a new repo into memory |
| `make-plan` | Create a persistent plan stored in memory, resumable across sessions |
| `standup` | Generate a standup update from recent session activity |
| `timeline-report` | Produce a human-readable timeline of work done |
| `smart-explore` | Context-aware file exploration using prior memory as a guide |
| `babysit` | Monitor a long-running background task, persisting status across sessions |
| `pathfinder` | Navigate to relevant files using memory-guided search |
| `how-it-works` | Explain claude-mem's own operation (useful for onboarding) |
| `version-bump` | Versioning helper with memory-aware changelog generation |

## Composition

- **Role in the pipeline:** claude-mem is the **memory layer**, operating underneath the
  entire workflow pipeline. It runs at session boundaries (start and stop) and
  continuously during a session (per tool call). It is not a step in the task pipeline;
  it is the substrate on which the pipeline runs.
- **Relationship to superpowers:** superpowers provides planning discipline for individual
  tasks; claude-mem provides continuity across tasks and sessions. They are complementary
  and non-conflicting.
- **Relationship to security skills:** claude-mem does not override security-review or
  any security gate. `<private>` exclusions in prompts are the mechanism to keep
  security-sensitive content out of the memory store.
- **Relationship to quality gates:** claude-mem does not replace any Engineering OS
  quality gate in [`core/quality-gates.md`](../../core/quality-gates.md). It informs
  Claude's context; it does not certify correctness.
- **Storage ownership:** all data is owned by the local user at `~/.claude-mem/`. The
  system does not phone home. Chroma integration is opt-in.
