# Graphify — Policy

## Classification

| Field | Value |
|---|---|
| **Type tags** | `context-optimization`, `code-intelligence` |
| **Execution Level** | **Level 2 — Mandatory default-on** |
| **Composition role** | Context-optimization layer; runs first / cross-cutting |

---

## Execution Level Detail

**Level 2: Mandatory — runs at session start on every project, no exceptions.**

Graphify is default-on and mandatory for every project. At the start of every session, build or verify the graph before doing anything else — no project is too small, too new, or too simple to skip this step.

"Mandatory" means: if Graphify is installed and the trigger fires (session start), it runs. Period. A missing Graphify installation is a reported gap (same as any missing L2 skill), not a silent skip.

**Always build the graph.** Run `graphify extract .` (or `/graphify .`) at session start. If the repo is currently tiny, Graphify itself will warn that the node count is below its useful threshold — that is the tool's feedback, not a reason to skip. Build it anyway. The overhead is negligible and the graph is ready the moment the repo grows.

**Never defer, never skip.** There is no "too small" exception, no "re-evaluate later" gate. The decision is always: build the graph now.

---

## Composition Rules

### 1. Run first — build or refresh before querying

Before using any MCP tool (`query_graph`, `get_pr_impact`, etc.) or relying on graph output in planning or coding, confirm the graph exists and is reasonably fresh. If `graphify-out/graph.json` is absent or the repo has had commits since the last extract, run `graphify extract .` (or `/graphify .`) before proceeding.

### 2. Cross-cutting — active throughout the session, not just at start

Graphify is not a one-time setup step. Query the graph at each decision point: before locating code to edit, before assessing PR impact, before choosing which files to read. The graph is the exploration layer; file reads are the confirmation layer.

### 3. Never overrides security skills

Graphify is a context-optimization tool. It has no authority over security policy. If a security review skill (or a security-scoped rule in a `core/` file) requires reading specific files or running specific checks, those requirements take precedence over graph-based shortcuts. Use the graph to find where to look; do not use it to skip required verification steps.

### 4. Keep the graph fresh via the post-commit hook

The post-commit hook (`graphify hook install`) should be installed on any repo where Graphify is in use. This ensures the graph is updated incrementally after each commit, so `get_pr_impact` and related impact queries remain trustworthy.

If the hook is not installed and the graph is stale, annotate any graph-derived claim with "graph may be stale — verify against current file contents."

---

## Notes

### Graph staleness

The graph reflects the state of the code at the time of the last `graphify extract` run. Changes committed after that point (without the post-commit hook running) are invisible to the graph. This is the primary limitation to be aware of when using graph output to reason about current code state.

Mitigation: install the post-commit hook on day one (`graphify hook install`), and re-run `graphify extract .` at the start of any session where the hook may have missed commits.

### Tiny-repo threshold

Graphify enforces a minimum node count before treating the graph as useful. On very small projects the graph will be built and Graphify itself may warn that the threshold has not been reached. This warning is informational — it does not change the policy. Build the graph, note the warning, and continue. The graph will become increasingly useful as the repo grows, and it is already in place when that happens.

There is no "too small" flag. No project is deferred, excluded, or re-evaluated later. Build always.
