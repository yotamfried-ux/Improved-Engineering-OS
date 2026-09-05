# Stage 0 status record — NOT a qualification report

> **Superseded as the answer to "did Stage 0 pass?".** That question is now
> answered by `stage-00-2026-09-05.md`, the harness-generated report, whose
> verdict is PASS. This record remains as the working history of how the stage
> was reached — including the defects found along the way — and it still does
> not close anything.

| Field              | Value                                                                                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artifact kind      | **Status record.** Per guide §4 a stage is closed only by a harness-generated report in this directory; this is not one, and it does not close Stage 0.                                                     |
| Stage 0 gate       | **PASSED** — closed by `stage-00-2026-09-05.md`, not by this record                                                                                                                                         |
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
| B7  | SQLite binding qualification                             | **PASS**    | All seven checks pass for both candidates on Linux; `node:sqlite` also passes all seven on **win32** (run 33953023783, per-check transcript in `qualification/evidence/sqlite-qualification-win32.md`). **`node:sqlite` selected** by owner decision 2026-09-05, recorded as approved deviation **C-9** from D18.5 — adopted on Stage 0 evidence the guide did not have, not because D18.5 was wrong.                         |
| B8  | Owner confirmation of C-1 and C-6                        | **PASS**    | Both approved 2026-09-04. C-1 stays recorded as an _approved deviation_, not as F1's original wording being met.                                                                                                                                                                                                                                                                                                              |

## C. Why the gate has not passed

The documented Stage 0 exit gate requires, among other things, _"F1–F12 green on
Linux + Windows smoke"_ and _"the D35 cross-platform hashing fixture yields
identical digests on both"_. Neither can be claimed:

Every criterion B1–B8 except B2 is now closed on observed evidence, and B2's
remainder is Stage 3 work by the guide's own sequencing. Two owner decisions on
2026-09-05 resolved what was outstanding:

1. **O-4 closed** — `node:sqlite` adopted, deviation C-9. B7 closes with it.
2. **The F1–F12 gate reading approved** — deviation C-10. Rules enforceable now
   must be green; rules whose subject belongs to a later stage must be
   explicitly dormant **and** guarded by `fitness/checks/dormancy.test.ts`, so
   dormancy cannot outlive its reason or become a silent vacuous pass.

**What still stands between this document and a closed Stage 0:** this document
is not a qualification report. Per guide §4 a stage is closed only by a
harness-generated report, which is now produced by `tools/qualification-report`
(`pnpm report:stage0`) and written to `qualification/reports/stage-00-report.md`
by the `stage-0-report` CI job, after both platforms have reported. **Stage 0 is
closed if and only if that report says PASS.** This record does not decide it,
and deliberately cannot.

## D. Minimum remaining actions to pass the gate

1. **Run `.github/workflows/ci.yml` on the current head** so both platforms
   produce a qualification record at the same commit, and let the
   `stage-0-report` job generate the report from them. That job fails the build
   when the verdict is not PASS, so "CI green" and "the stage closed" cannot
   drift apart.
2. **Read the verdict.** If it is PASS, Stage 0 is closed by that report and
   this record becomes history. If it is NOT PASSED, the report names which rows
   are `fail` and which are `unproven`, and those are the remaining work.
3. **B2's remainder is not a Stage 0 action.** A real agent trial is Stage 3.

B1 and B3–B8 are closed on observed evidence.

## E. Measured counts (guarding against vacuous success)

| Measure                        | Value                                                   |
| ------------------------------ | ------------------------------------------------------- |
| Test files / tests             | 21 / 536, all passing                                   |
| Repeat run                     | identical results across two consecutive full runs      |
| Modules / dependencies cruised | 75 / 210, 0 violations                                  |
| RFC 8785 conformance vectors   | 6/6                                                     |
| Capabilities seeded            | 28 ids, 7 kinds                                         |
| SQLite checks executed         | 7 × 2 candidates on linux; 7 for `node:sqlite` on win32 |
| SQLite binding selected        | `node:sqlite` (owner, deviation C-9)                    |
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
