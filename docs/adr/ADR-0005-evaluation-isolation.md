# ADR-0005 — Agent evaluation isolation: contract before mechanism

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-04 |
| Stage | 0 |
| Implements | D14, TD-16, Stage 0 harness deliverables |
| Addresses | Research finding R5 |

## Context

TD-16 records that evaluator workspace isolation is "a principle without a
mechanism", and proposes closing it with "Stage 0 layout + harness
`setting_sources=[]`".

Research finding R5 and the user's instruction E both reject that as sufficient.
Inspect's own sandboxing documentation distinguishes container network
restrictions from host-side tools, model calls and graders. A fresh temporary
directory constrains nothing about network egress, spawned processes, or
inherited environment variables — and an SDK setting that ignores user config
files says nothing about what the agent process can reach on the filesystem.

The report's Stage 8 (now Stage 3) hidden condition depends entirely on this:
if the agent can read `evaluator/`, the slice result is worthless. Studied for
design: Inspect AI's sandbox model and mini-swe-agent's compact
agent/environment/model boundaries — patterns only, no code taken.

## Decision

Stage 0 builds the **contract** for isolation and proves the subset it can
actually prove. It does not claim isolation.

### `IsolationPolicy` — what a trial requires, declared up front

Four boundaries, each stated explicitly:

- **filesystem** — allowed roots and denied roots (`evaluator/` is always denied).
- **environment** — an explicit allowlist. **Deny by default**: the sandbox
  starts from an empty environment and adds only granted names. Inheritance is
  never the default, because a default of inheritance fails open.
- **process** — which executables a trial may spawn.
- **network** — `deny`, an allowlist, or `unrestricted`.

### `IsolationReport` — what was actually observed, per boundary

Every boundary carries `proven | violated | unproven` plus the evidence behind
that verdict. There is deliberately **no boolean `isolated: true`**: the type
makes "we did not check" unrepresentable as "we checked and it passed". This is
the single most important design choice here, because the failure mode being
guarded against is a harness that reports success for a check it never ran.

`qualificationEligible` is false whenever any **required** boundary is `unproven`
or `violated`. An unproven boundary is therefore louder than a violated one is
quiet.

### `AgentDriver` — a vendor-neutral port

No Claude- or Codex-specific code exists at Stage 0. A deterministic
`FakeAgentDriver` exercises the harness so the harness itself is testable without
spending money or depending on a vendor CLI. Which agent is primary for the
Stage 3 slice is an open question (plan §3, O-3) with no contract consequence.

### What Stage 0 proves, with tests

- The sandbox environment contains **no** variable not explicitly granted.
- Two trials cannot see each other's state, in either direction.
- The `evaluator/` path is not reachable from a trial root, including via `..`
  traversal and via symlink.
- A trial referencing an unregistered run is rejected (D36: unregistered runs can
  never be `qualification`).
- A policy requiring network or process containment reports those boundaries
  `unproven` and yields `qualificationEligible: false`.

### What Stage 0 explicitly does not prove

Network egress containment and process containment. A fresh directory cannot
enforce either. The enforcing mechanism — container, namespace, or equivalent —
is a **Stage 3 precondition**, not a Stage 0 deliverable. Until it exists, no run
this harness produces is qualification-eligible under a policy that requires
those boundaries, and the harness says so in the report rather than in a comment.

## Consequences

- Stage 3 cannot accidentally be declared passing on unisolated trials: the
  eligibility flag is computed from probe results, so the harness must be taught
  to *prove* a boundary before a trial that requires it can count.
- Adding a real driver later changes no contract; it implements `AgentDriver`.
- Graders (`deterministic`, `trace`, `model`) with positive, negative and mutation
  controls remain outstanding Stage 0 work (plan §7, B2). The grader hierarchy
  from the report — deterministic outcome > static checks > trace rules > LLM
  grader > human — is the shape they must take: an LLM grader may never outrank a
  test that shows the code failed.
