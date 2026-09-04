# Stage 0 status record — NOT a qualification report

| Field              | Value                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artifact kind      | **Status record.** Per guide §4 a stage is closed only by a harness-generated report in this directory; this is not one, and it does not close Stage 0. |
| Stage 0 gate       | **NOT PASSED**                                                                                                                                          |
| Date               | 2026-09-04                                                                                                                                              |
| Environment        | Linux x64, Node 24.20.0, pnpm 11.25.0                                                                                                                   |
| Platforms observed | **linux only.** No Windows or macOS execution has occurred at any point.                                                                                |
| Remote CI          | **Never run.** This branch has not been pushed; no GitHub Actions workflow has ever executed.                                                           |

## Status vocabulary

| Status    | Means                                                                        |
| --------- | ---------------------------------------------------------------------------- |
| `PASS`    | implementation exists **and** the required evidence was actually observed    |
| `PARTIAL` | implementation exists, but some required verification has not been performed |
| `BLOCKED` | an external dependency prevents completion                                   |
| `FAIL`    | verification ran and exposed an unresolved defect                            |

`PASS` is never used for "code exists but CI has never run", nor for a mocked
integration where the criterion requires a live observation.

## A. Criteria met by implementation and local verification

| #    | Criterion                                                                                                                              | Status | Evidence                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| A1   | `pnpm install --frozen-lockfile` from a clean checkout; lockfile committed                                                             | PASS   | executed; succeeds                                                                                             |
| A2   | `ieos-doctor` fails actionably on a missing or mismatched runtime                                                                      | PASS   | `pnpm ieos-doctor`; `tools/harness/test/doctor.test.ts` (14 cases incl. absent Node, wrong major, absent pnpm) |
| A2b  | The declared toolchain matches `engines.node`, `packageManager`, `devEngines`                                                          | PASS   | asserted in `doctor.test.ts`, so the pin has one source of truth                                               |
| A3   | Strict TypeScript, no `any` escape hatches in `core`                                                                                   | PASS   | `pnpm typecheck` clean                                                                                         |
| A4   | JCS matches all official RFC 8785 conformance vectors                                                                                  | PASS   | 6/6 vendored `cyberphone` vectors                                                                              |
| A5   | The six finding-B canonicalization cases, incl. UTF-16-vs-UTF-8 ordering                                                               | PASS   | `normalize.test.ts`, `hashing.test.ts`                                                                         |
| A6   | Normalization never alters JSON semantics                                                                                              | PASS   | `hashing.test.ts` "layer separation"                                                                           |
| A7   | Every contract: valid case, rejected-with-reason case, cross-field invariants                                                          | PASS   | `contracts.test.ts`                                                                                            |
| A8   | `champion_id: null` is unrepresentable as `pinned`, and vice versa                                                                     | PASS   | `solution-set` invariant tests                                                                                 |
| A9   | `contracts/schemas/` regenerates with zero diff                                                                                        | PASS   | `pnpm contracts:check`                                                                                         |
| A10  | Deterministic ids and digests match pinned literals                                                                                    | PASS   | each independently reproduced in Python before pinning                                                         |
| A11  | `core` performs no I/O under a poisoned module environment                                                                             | PASS   | `no-io.test.ts`, incl. a control proving the traps fire                                                        |
| A12  | F1–F12 statuses declared, and the declaration matches disk                                                                             | PASS   | 6 enforced, 4 partial, 3 not yet enforceable                                                                   |
| A12b | Every fitness scan carries a control proving it can fire                                                                               | PASS   | `boundaries.test.ts`, `dependency-graph.test.ts`                                                               |
| A12c | The dependency-graph analysis is non-empty                                                                                             | PASS   | 73 modules, 203 dependencies                                                                                   |
| A12d | An unresolvable import is an error                                                                                                     | PASS   | `no-unresolvable` rule + its control                                                                           |
| A13  | Sandbox: no inherited env, no cross-trial visibility, evaluator unreachable, unregistered run rejected, unproven boundary ⇒ ineligible | PASS   | `isolation.test.ts`                                                                                            |
| A14  | Every dependency recorded with version, licence, problem, copied-vs-studied; exact pins; lockfile                                      | PASS   | `dependencies.test.ts`                                                                                         |
| A15  | Vendored material carries a NOTICE naming copyright, licence, provenance                                                               | PASS   | `dependencies.test.ts`                                                                                         |
| A16  | `contracts/capabilities.yaml` traceable to an exact revision                                                                           | PASS   | seeded, digest recorded                                                                                        |
| A17  | Telemetry allowlist bounds every attribute; forbidden ones named                                                                       | PASS   | `dependencies.test.ts`                                                                                         |

## B. The previously open criteria

| #   | Criterion                                                | Status      | Evidence and what is missing                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Linux CI + Windows smoke; D35 cross-platform digest gate | **PARTIAL** | Workflows written and structurally tested; YAML parses; every referenced script executed locally; the vacuity guards were negative-controlled (exit 1 on an unreachable floor). **No Actions run has ever happened.** The Windows half of the D35 gate is **UNPROVEN**.                                                                                                                                                       |
| B2  | Agent-driver and grader surface                          | **PARTIAL** | Graders (deterministic, trace, model port), the grading hierarchy, grader-validity controls, budgets, collection and trial reports: implemented, 65 harness tests. `AgentDriver` port + deterministic fake. **No live agent trial has run** — `codex` is not installed, and a real trial is Stage 3 work by the guide's own sequencing (T-07/Q-09 put the second agent at Stage 8). Live external qualification **UNPROVEN**. |
| B3  | ADR coverage for D19–D36                                 | **PASS**    | `ADR-0006`–`ADR-0009` group all eighteen; `decision-coverage.test.ts` asserts coverage and cross-document consistency.                                                                                                                                                                                                                                                                                                        |
| B4  | Capability seed (D28)                                    | **PASS**    | Previously BLOCKED; **that was stale**. Seeded from `yotamfried-ux/Engineering-OS@4d51784`, 28 ids verbatim, 7 kinds, enforcement dropped and named, source digest recorded; regeneration byte-identical against the real checkout.                                                                                                                                                                                           |
| B5  | D32 replay test                                          | **PASS**    | Replay invariant (identical `evidence_id` **and** identical payload after stripping `derived_at`) over a synthetic derivation, with four negative controls and supersession validation.                                                                                                                                                                                                                                       |
| B6  | Deterministic `UNPROVEN` snapshot emission               | **PASS**    | `tools/snapshot-emit`; digest pinned as the cross-platform fixture; claim-status model makes "proven on fewer platforms than required" unrepresentable.                                                                                                                                                                                                                                                                       |
| B7  | SQLite binding qualification                             | **PARTIAL** | All seven recorded checks executed against **both** candidates on Linux; all seven pass for each. `better-sqlite3@13.0.3` engine measured **through the binding** (3.53.4), never substituted from Node's. **No binding selected** — check 3 names Linux _and_ Windows; win32 unobserved.                                                                                                                                     |
| B8  | Owner confirmation of C-1 and C-6                        | **PASS**    | Both approved 2026-09-04. C-1 stays recorded as an _approved deviation_, not as F1's original wording being met.                                                                                                                                                                                                                                                                                                              |

## C. Why the gate has not passed

The documented Stage 0 exit gate requires, among other things, _"F1–F12 green on
Linux + Windows smoke"_ and _"the D35 cross-platform hashing fixture yields
identical digests on both"_. Neither can be claimed:

1. **No Windows execution has ever occurred.** Not in CI, not locally, not
   anywhere. The comparison the gate names has not been performed.
2. **No GitHub Actions run has occurred at all**, because the branch has not
   been pushed — which this task was explicitly instructed not to do.
3. Four of F1–F12 are `partial` and three are `not-yet-enforceable`, because
   their subjects (`packages/launcher`, `packages/releases`, `packages/resolver`,
   `simulations/`) do not exist at Stage 0. That is expected and honest, but it
   is not "F1–F12 green".

## D. Minimum remaining actions to pass the gate

Exactly one external observation is missing, and it closes two criteria at once:

1. **Push the branch and let `.github/workflows/ci.yml` run.**
   - the `linux` job must go green;
   - the `windows-smoke` job must go green, which requires its digest comparison
     against the Linux artifact to match — that _is_ the D35 cross-platform gate
     (closes B1);
   - its `sqlite-qualification` step supplies check 3 on win32 for both
     candidates (closes the platform half of B7).
2. **Record the Windows result**: re-run `pnpm sqlite:qualify` on the Windows
   runner and commit the evidence, then select a binding — or record why neither
   qualifies. Only then does O-4 close.
3. **B2's remainder is not a Stage 0 action.** A real agent trial is Stage 3.

Nothing else is outstanding. B3–B6 and B8 are closed on observed evidence.

## E. Measured counts (guarding against vacuous success)

| Measure                        | Value                                              |
| ------------------------------ | -------------------------------------------------- |
| Test files / tests             | 19 / 463, all passing                              |
| Repeat run                     | identical results across two consecutive full runs |
| Modules / dependencies cruised | 73 / 203, 0 violations                             |
| RFC 8785 conformance vectors   | 6/6                                                |
| Capabilities seeded            | 28 ids, 7 kinds                                    |
| SQLite checks executed         | 7 per candidate × 2 candidates, on linux           |
| Fitness rules                  | 6 enforced, 4 partial, 3 not yet enforceable       |
| Windows observations           | **0**                                              |
| GitHub Actions runs            | **0**                                              |

## F. Defects found and fixed during this work

Recorded because each was a check that would otherwise have reported success
over nothing:

1. **`better-sqlite3` check 4 reported `unexecuted`** — the child writer could
   not resolve a bare specifier from a scratch directory. A harness limitation
   that would have been read as a fact about the binding. Fixed by carrying the
   resolved specifier into the subprocess; the check now genuinely contends.
2. **The qualification tool's own `createHash` tripped F12.** Routed through
   `packages/core` rather than granted an exception, keeping F12 literal.
3. **A stale fitness assertion** still required `contracts/capabilities.yaml` to
   be empty and `pending`. Replaced with the rule that actually matters: every id
   present must be traceable to an exact revision of a named source.
