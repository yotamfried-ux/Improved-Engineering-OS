# ADR-0004 — Module boundaries and fitness-rule enforcement

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-04 |
| Stage | 0 |
| Implements | Guide §3 dependency direction, fitness rules F1–F12 |
| Needs owner confirmation | **Yes** — deviation C-1 (F1 wording) |

## Context

The guide fixes the package dependency direction (§3) and twelve fitness rules
(Stage 0 table). Two problems have to be solved before they can be enforced.

**First, F1 as written is unsatisfiable.** F1 says `packages/core` "imports
nothing outside itself", while D18.5 requires Zod 4 as the schema source of truth
*inside* `packages/core/src/contracts/`. The research inventory flags this and
declines to relax the rule.

**Second, a dependency graph cannot prove behaviour.** The research inventory is
explicit: dependency-cruiser cannot establish "runtime never writes knowledge"
(F3) or "Champion selection never reads the overlay" (F11). Rules about what code
*does* need checks that run code.

## Decision

### F1 is split into two enforceable clauses (deviation C-1)

- **F1a** — `packages/core` imports **no other workspace package**. Enforced by
  dependency-cruiser.
- **F1b** — `packages/core` contains no vendor, agent or backend identifier
  (`claude`, `codex`, `anthropic`, `openai`, `supabase`, `mcp`, `gemini`,
  `openrouter`), and may import third-party packages only from an explicit
  allowlist in `fitness/allowlist.yaml`. The allowlist today contains exactly one
  entry: `zod`. Enforced by a scoped source scan plus dependency-cruiser.

This preserves the architectural intent stated in the constitution — "Core must
not import Claude-specific or Codex-specific semantics" — while being
implementable. It also *adds* a guarantee F1's original wording never had: a
behavioural no-I/O test (below). It is nonetheless a relaxation of frozen text,
so guide §6.1 rule 8 applies and it is reported for owner confirmation.

### Three enforcement mechanisms, chosen per rule

1. **Static import graph** (dependency-cruiser) — F1a, F2, F4, F5.
2. **Scoped source-text scan** — F1b, F6, F9, F12. Scans are scoped to the path
   sets the rule names, with `fitness/exclusions.yaml` (docs, root Markdown,
   `qualification/`) and `fitness/allowlist.yaml` for legitimate occurrences.
3. **Behavioural test** — the mechanism that will carry F3 and F11, and that
   carries the no-I/O guarantee today. `packages/core` is imported into a
   context where `node:fs`, `node:fs/promises`, `node:child_process`, `node:net`,
   `node:http`, `node:https` and `node:dns` throw on any use, and the full public
   surface is exercised. `core` performing I/O then fails loudly, rather than
   being assumed absent because no import matched a known name.

### Rule status is declared, and the declaration is itself tested

Each of F1–F12 has a status in `fitness/rules.ts`:

- `enforced` — implemented and running against a real subject.
- `partial` — implemented, but the subject is incomplete at this stage.
- `not-yet-enforceable` — the subject does not exist yet.

A test asserts the declared status matches reality: an `enforced` rule must have
a check that actually runs, and a `not-yet-enforceable` rule must not be counted
as passing. **Reporting twelve green rules when four have no subject would be
false completeness**, which the constitution forbids and D17 names as a failure
mode. Stage 0 status:

| Rule | Status | Note |
|---|---|---|
| F1a / F1b | `enforced` | with the C-1 refinement |
| F2 | `partial` | no `adapters/` exists yet; the rule is armed for when one does |
| F3 | `enforced` | no `knowledge/` write path and no push/branch call may exist in `packages/` or `tools/`; armed before `knowledge/` exists, which is the point |
| F4 | `partial` | no `store-*` package exists yet; rule armed |
| F5 | `not-yet-enforceable` | `packages/launcher` is Stage 4 |
| F6 | `enforced` | scoped scan for real project names and absolute paths |
| F7 | `not-yet-enforceable` | release resolution is Stage 4 |
| F8 | `partial` | determinism is proven for hashing and schema emission; the knowledge index is Stage 1 |
| F9 | `enforced` | secret-shaped value scan |
| F10 | `not-yet-enforceable` | no simulation manifests exist yet |
| F11 | `not-yet-enforceable` | no resolver exists; the *contract-level* half is enforced — `challenge_state` is unrepresentable in a canonical Solution Set |
| F12 | `enforced` | single canonical hashing site; the two permitted exceptions are pre-registered as forbidden-until-their-stage |

## Consequences

- Boundary rules exist **before** the packages they constrain. F3 and F4 are
  armed while `knowledge/` and `store-*` do not exist, so the first commit that
  creates them meets an existing rule instead of negotiating with one.
- The honest-status table means "fitness green" at Stage 0 means "eight rules
  enforced or partial, four not yet enforceable", not "twelve green".
- Adding a third-party import to `core` requires editing `fitness/allowlist.yaml`,
  which makes it a reviewable decision rather than an incidental one.
