# Stage 0 status record — NOT a qualification report

| Field              | Value                                                                                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artifact kind      | **Status record.** Per guide §4 a stage is closed only by a harness-generated report in this directory; this is not one, and it does not close Stage 0.                                                     |
| Stage 0 gate       | **NOT PASSED**                                                                                                                                                                                              |
| Date               | 2026-09-05                                                                                                                                                                                                  |
| Environment        | Linux x64, Node 24.20.0, pnpm 11.25.0                                                                                                                                                                       |
| Platforms observed | **linux + win32.** Windows observed on GitHub Actions 2026-09-05 (`6d8c27b`). No macOS execution at any point.                                                                                              |
| Remote CI          | **Green on `6d8c27b` (PR #1):** `linux (primary)`, `fitness`, `windows smoke (D35 cross-platform digest)` all pass. The first attempt (`368467b`) failed on Windows at the toolchain doctor; see section F. |

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
| A12c | The dependency-graph analysis is non-empty                                                                                             | PASS   | 75 modules, 210 dependencies                                                                                   |
| A12d | An unresolvable import is an error                                                                                                     | PASS   | `no-unresolvable` rule + its control                                                                           |
| A13  | Sandbox: no inherited env, no cross-trial visibility, evaluator unreachable, unregistered run rejected, unproven boundary ⇒ ineligible | PASS   | `isolation.test.ts`                                                                                            |
| A14  | Every dependency recorded with version, licence, problem, copied-vs-studied; exact pins; lockfile                                      | PASS   | `dependencies.test.ts`                                                                                         |
| A15  | Vendored material carries a NOTICE naming copyright, licence, provenance                                                               | PASS   | `dependencies.test.ts`                                                                                         |
| A16  | `contracts/capabilities.yaml` traceable to an exact revision                                                                           | PASS   | seeded, digest recorded                                                                                        |
| A17  | Telemetry allowlist bounds every attribute; forbidden ones named                                                                       | PASS   | `dependencies.test.ts`                                                                                         |

## B. The previously open criteria

| #   | Criterion                                                | Status      | Evidence and what is missing                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Linux CI + Windows smoke; D35 cross-platform digest gate | **PASS**    | Observed on GitHub Actions 2026-09-05 (`6d8c27b`). The digest comparison — the gate itself, not the green tick — printed `linux: sha256:e8c450ac…ee6febbe`, `windows: sha256:e8c450ac…ee6febbe`, identical, matching the pinned fixture. The Windows corpus guard ran too (10 files, 283 tests), so the comparison was not made over an empty suite.                                                                          |
| B2  | Agent-driver and grader surface                          | **PARTIAL** | Graders (deterministic, trace, model port), the grading hierarchy, grader-validity controls, budgets, collection and trial reports: implemented, 65 harness tests. `AgentDriver` port + deterministic fake. **No live agent trial has run** — `codex` is not installed, and a real trial is Stage 3 work by the guide's own sequencing (T-07/Q-09 put the second agent at Stage 8). Live external qualification **UNPROVEN**. |
| B3  | ADR coverage for D19–D36                                 | **PASS**    | `ADR-0006`–`ADR-0009` group all eighteen; `decision-coverage.test.ts` asserts coverage and cross-document consistency.                                                                                                                                                                                                                                                                                                        |
| B4  | Capability seed (D28)                                    | **PASS**    | Previously BLOCKED; **that was stale**. Seeded from `yotamfried-ux/Engineering-OS@4d51784`, 28 ids verbatim, 7 kinds, enforcement dropped and named, source digest recorded; regeneration byte-identical against the real checkout.                                                                                                                                                                                           |
| B5  | D32 replay test                                          | **PASS**    | Replay invariant (identical `evidence_id` **and** identical payload after stripping `derived_at`) over a synthetic derivation, with four negative controls and supersession validation.                                                                                                                                                                                                                                       |
| B6  | Deterministic `UNPROVEN` snapshot emission               | **PASS**    | `tools/snapshot-emit`; digest pinned as the cross-platform fixture; claim-status model makes "proven on fewer platforms than required" unrepresentable.                                                                                                                                                                                                                                                                       |
| B7  | SQLite binding qualification                             | **PARTIAL** | All seven checks pass for both candidates on Linux; `node:sqlite` now also passes all seven on **win32** (2026-09-05). `better-sqlite3`'s win32 coverage stays unobserved — it is deliberately not a dependency, so CI cannot load it. **No binding selected**, and that is now an owner decision rather than a missing measurement (decision log §4c).                                                                       |
| B8  | Owner confirmation of C-1 and C-6                        | **PASS**    | Both approved 2026-09-04. C-1 stays recorded as an _approved deviation_, not as F1's original wording being met.                                                                                                                                                                                                                                                                                                              |

## C. Why the gate has not passed

The documented Stage 0 exit gate requires, among other things, _"F1–F12 green on
Linux + Windows smoke"_ and _"the D35 cross-platform hashing fixture yields
identical digests on both"_. Neither can be claimed:

The D35 half of the gate **is** now met: the cross-platform digest comparison
executed on 2026-09-05 and the two digests are identical. What remains:

1. **F1–F12 are not green, and cannot be at Stage 0.** Four are `partial` and
   three are `not-yet-enforceable`, because their subjects
   (`packages/launcher`, `packages/releases`, `packages/resolver`,
   `simulations/`) do not exist yet. That is expected and honest, but the gate
   says "F1–F12 green on Linux + Windows smoke", and 6 of 13 enforced is not
   that.
2. **O-4 is open.** No SQLite binding is selected. `node:sqlite` has complete
   observed coverage, `better-sqlite3` does not and cannot get it while it is
   not a dependency; choosing between them deviates from D18.5 either in fact
   or in evidence, so it is put to the owner (decision log §4c) rather than
   settled here. B7 stays PARTIAL until then.
3. **No harness-generated qualification report exists.** Per guide §4 that is
   what closes a stage, and this document is not one.

## D. Minimum remaining actions to pass the gate

The external observation that blocked B1 and B7 has been made. What is left is
one owner decision and one thing that Stage 0 cannot produce:

1. **Answer O-4** (decision log §4c): select `node:sqlite`, keep
   `better-sqlite3`, or add `better-sqlite3` as a dependency so CI can qualify
   it. Only then does B7 close. Nothing is blocked while it is open — no code
   depends on either binding yet.
2. **F1–F12 cannot go green at Stage 0**, because seven of the thirteen have no
   subject to inspect until later stages create it. Closing the gate as written
   requires either those stages or an owner-approved restatement of the gate.
3. **B2's remainder is not a Stage 0 action.** A real agent trial is Stage 3.

B1 and B3–B6 and B8 are closed on observed evidence.

## E. Measured counts (guarding against vacuous success)

| Measure                        | Value                                                   |
| ------------------------------ | ------------------------------------------------------- |
| Test files / tests             | 21 / 536, all passing                                   |
| Repeat run                     | identical results across two consecutive full runs      |
| Modules / dependencies cruised | 75 / 210, 0 violations                                  |
| RFC 8785 conformance vectors   | 6/6                                                     |
| Capabilities seeded            | 28 ids, 7 kinds                                         |
| SQLite checks executed         | 7 × 2 candidates on linux; 7 for `node:sqlite` on win32 |
| Fitness rules                  | 6 enforced, 4 partial, 3 not yet enforceable            |
| D35 cross-platform digest      | **identical** on linux and win32                        |
| Windows observations           | 283 tests on windows-latest, all passing                |
| GitHub Actions runs            | linux **pass**, fitness **pass**, windows **pass**      |

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
4. **The toolchain doctor could not find pnpm on Windows.** `execFile` applies
   no PATHEXT resolution and Node refuses to spawn `.cmd`/`.bat` without a
   shell, so the probe reported a broken toolchain on a machine whose toolchain
   was fine. Found by the first Windows CI run — the first defect in this
   repository that only an external observation could have surfaced.
5. **A test asserted that it was not running on Windows.**
   `qualify.test.ts` checked `platformsObserved` did **not** contain `win32`,
   which is true only until the cross-platform gate does its job. Replaced with
   the invariant actually intended: a single run always leaves at least one
   required platform unobserved.
