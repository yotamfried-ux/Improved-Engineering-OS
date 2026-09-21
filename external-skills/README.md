# External Skills — Skill Orchestration Layer

> The integration layer for capabilities that change **Claude's workflow behavior**.
> Engines/backends and third-party app services live under [`external-systems/`](../external-systems/), not here.
>
> This README is **index-only**. It lists skill wrappers and status. The source of truth for orchestration rules is [`core/skill-orchestration-policy.md`](../core/skill-orchestration-policy.md), and bootstrap / verification mechanics live in [`scripts/skill-bootstrap.sh`](../scripts/skill-bootstrap.sh).

Canonical owners:

| Question | Source of truth |
|---|---|
| Which skill wrappers exist? | This README |
| Skill Integration Protocol | `../core/skill-orchestration-policy.md` |
| Task routing to skills | `../core/task-router.md` |
| Capability vocabulary | `../core/capability-registry.yaml` |
| Install / verification mechanics | `../scripts/skill-bootstrap.sh` plus each skill's `activation.md` |
| One skill's behavior contract | `external-skills/<name>/integration.md` and `policy.md` |

---

## What this layer is

A skill is not "code to integrate into the app you are building" (that is [`external-systems/`](../external-systems/) and [`patterns/`](../patterns/)). A **skill** is an external capability that changes **how Claude itself works** — how it plans, codes, reviews, remembers, secures, or optimizes context. This directory holds the *integration contracts* for those capabilities, not the capabilities' source code.

```
Skill = External Capability + Integration Contract + Execution Rules
```

| Layer | What it governs |
|---|---|
| `external-skills/*` | Capabilities that change **Claude's own workflow** (this directory) |
| `external-systems/*` | Third-party **services the target app integrates with** and engines/backends such as Nemotron |
| `patterns/*` | Reusable **code patterns** for the target app |
| `core/*` | The OS's own **policies** |

---

## The standard 4-file contract

Every skill lives in `external-skills/<skill-name>/` with exactly four files:

| File | Answers |
|---|---|
| `README.md` | *What is it?* — identity, real structure, install summary, license |
| `integration.md` | *How & when do I use it?* — behavioral contract + the real tools/commands you invoke |
| `policy.md` | *How does it fit the orchestration?* — classification, level, composition, override |
| `activation.md` | *How do I install & verify it?* — exact commands, presence check, secrets, removal |

Each wrapper is written from a **verified scan of the real repository** — not a marketing description. Where a popular claim was inaccurate, the wrapper says so (see the "Reality check" in `claude-code-workflows`).

---

## Skill registry

| Skill | Classification (`type`) | Level | Install mechanism | What you actually invoke |
|---|---|---|---|---|
| **[superpowers](./superpowers/)** | planning, review, orchestration, self-correction | **L2** · default-on every project | Claude Code plugin (`/plugin install`) | 14 skills via the Skill tool (`brainstorming`, `writing-plans`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`…) |
| **[frontend-design](./frontend-design/)** ⚠️ **DEPRECATED → use [ui-ux-pro-max](./ui-ux-pro-max/)** | ui-ux, coding | — (superseded) | do not install in new projects | superseded by `ui-ux-pro-max`; kept for reference only |
| **[claude-code-workflows](./claude-code-workflows/)** | review, orchestration | L1 / **L2** for large refactors | manual file copy (templates) | `pragmatic-code-review` & `design-review` subagents, `/design-review`, GitHub Action |
| **[security-review](./security-review/)** | security, review | **L2** · default-on · pre-commit + pre-merge gate | GitHub Action + slash command | `/security-review`, `anthropics/claude-code-security-review@main` Action |
| **[claude-mem](./claude-mem/)** | memory, context-persistence | **L2** (passive system dependency) | plugin + MCP + hooks + worker | MCP tools `search`, `timeline`, `get_observations` (+ passive lifecycle hooks) |
| **[gstack](./gstack/)** | orchestration, role-simulation | L1 (complex projects) | `git clone` + `./setup` (needs Bun) | role commands `/autoplan`, `/review`, `/qa`, `/cso`, `/ship` (23 specialists + 8 power tools) |
| **[graphify](./graphify/)** | context-optimization, code-intelligence | **L2** (mandatory default-on every project) | `uv tool install graphifyy` + MCP | `/graphify .`, MCP tools `query_graph`, `get_node`, `get_pr_impact`… |
| **[rtk](./rtk/)** | context-optimization | **L2** · default-on every project | `cargo install --git https://github.com/rtk-ai/rtk` | PreToolUse hook — auto-compresses all Bash output 60–90% |
| **[ui-ux-pro-max](./ui-ux-pro-max/)** | ui-ux, coding | **L2** for UI projects / L1 otherwise | Claude Code plugin (marketplace) | UI/UX design workflow, component specs, accessibility review |

> **Note — Nemotron is an engine, not a skill.** Nvidia Nemotron is an LLM
> backend that *runs* capabilities (generation, first-pass review); it is not a
> process skill and is not listed here. See
> [`../external-systems/nvidia-nemotron/`](../external-systems/nvidia-nemotron/)
> for the engine reference, and `.claude/agents/nemotron-*` for the runtime
> adapters that invoke it. The `security-review` skill *may* use Nemotron as its
> primary engine, but Nemotron itself is never the security gate.

---

## Default activation profile

Two separate axes: **execution level** (when a skill runs on a task) vs **default install** (whether the bootstrap installs it in every project). Which skills are default-on, and why:

| Skill | Default per project | Why |
|---|---|---|
| superpowers | ✅ **every project** | Prevents the #1 failure mode (jumping to code without a spec). Always loaded via its SessionStart hook; only the *depth* of process scales with task size. |
| security-review | ✅ **every production-bound project** | Security is a baseline, not an add-on. Diff-aware, so cheap to run before each commit; mandatory gate before merge to main. |
| graphify | ✅ **every project** | Saves context cost every session. Always build the graph at session start, no exceptions. If the repo is tiny, Graphify itself warns — that is the tool's feedback, not a skip condition. The graph is in place when the repo grows. |
| rtk | ✅ **every project** | Saves 60–90% of Bash output tokens via a PreToolUse hook. Zero-config once installed; negligible overhead on every command. |
| claude-mem | ✅ **where the environment allows** | Cross-session memory helps almost any multi-session project. Opt-out only in locked-down/ephemeral environments or where data must not persist to disk. |
| ui-ux-pro-max | ⚠️ **conditional — UI projects** | Full UI/UX design workflow. Replaces the deprecated `frontend-design`. Installed when there is a UI surface. |
| frontend-design | ⚠️ **DEPRECATED — use ui-ux-pro-max** | Superseded by ui-ux-pro-max. Do not install in new projects. |
| claude-code-workflows | ⚠️ **recommended with PR review** | Provides PR-review subagents + Actions; full value only in a PR-based flow. |
| gstack | ➖ **opt-in (not default)** | Heavy (Bun + 59 SKILL.md) and overlaps superpowers/security/review. Chosen deliberately for complex multi-role projects, not installed by default. |

**Default profile** that `skill-bootstrap.sh` expects in a standard project: superpowers · security-review · graphify · rtk · claude-mem.

---

## Execution levels (summary)

- **LEVEL 0 — optional**: Claude decides.
- **LEVEL 1 — recommended**: default-on unless there's an explicit reason to skip.
- **LEVEL 2 — mandatory**: runs whenever its trigger conditions are met **and** it is installed. A missing L2 skill is a reported gap, not a silent skip — see the bootstrap protocol.

Full definitions, the selection pipeline, the composition order, and the security-override rule are in [`core/skill-orchestration-policy.md`](../core/skill-orchestration-policy.md).

---

## Composition order (when several apply)

```
context-optimization (graphify)   → build/refresh code graph first, cross-cutting
memory (claude-mem)               → restore at session start, summarize at stop (passive)
1. planning   (superpowers, gstack /autoplan)   → before any code
2. coding     (frontend-design, superpowers TDD)
3. SECURITY GATE (security-review, gstack /cso)  → blocks before production; cannot be overridden
4. review     (claude-code-workflows, gstack /review, superpowers receiving-code-review) → last
```

**Three rules:** planning first · security always overrides · review runs last.

---

## Adding a new skill

1. **Scan the real repo first** (structure, manifests, real commands/tools) — never wrap from a description.
2. Create `external-skills/<skill-name>/` with the four contract files.
3. Assign `type` tags and an execution level in `policy.md`.
4. Add a row to the registry table above.
5. Add a detection entry to [`scripts/skill-bootstrap.sh`](../scripts/skill-bootstrap.sh).
6. If it is an MCP server, also register it in [`core/mcp-servers.md`](../core/mcp-servers.md).
7. If it is a significant capability, add it to [`CLAUDE.md`](../CLAUDE.md) navigation.

---

## Security note

Skill wrappers reference repositories by their **bare URL only**. Share links may carry per-user tokens (e.g. a `mcp_token` query parameter) — these are personal secrets and are **never** committed to any file here. Secrets required by a skill are documented by their env-var **name and purpose**, never their value, in that skill's `activation.md`.
