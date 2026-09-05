# Decision log

Append-only record of decisions taken while implementing Improved-Engineering-OS.
Supersession is recorded as a new row; rows are never rewritten in place.

Authority: architecture constitution > frozen build guide > this log.
The research inventory is evidence, not authority.

| Field                    | Value                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| Opened                   | 2026-09-04                                                                                      |
| Stage                    | 0 (in progress; no gate passed)                                                                 |
| Verification environment | Linux x64, Node 24.20.0, pnpm 11.25.0. **No Windows or macOS verification has been performed.** |

---

## 1. Stage 0 architectural decisions (ADRs)

| ADR                                                                    | Subject                                                                                | Status   |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------- |
| [ADR-0001](../adr/ADR-0001-architecture-baseline.md)                   | Architecture baseline — accepts D1–D17 by reference                                    | Accepted |
| [ADR-0002](../adr/ADR-0002-stage-0-toolchain.md)                       | Stage 0 toolchain, runtime and dependency policy                                       | Accepted |
| [ADR-0003](../adr/ADR-0003-canonicalization-boundary.md)               | Canonicalization / normalization boundary (D35, finding B)                             | Accepted |
| [ADR-0004](../adr/ADR-0004-module-boundaries.md)                       | Module boundaries and fitness-rule enforcement (F1–F12)                                | Accepted |
| [ADR-0005](../adr/ADR-0005-evaluation-isolation.md)                    | Agent evaluation isolation — contract before mechanism (finding E)                     | Accepted |
| [ADR-0006](../adr/ADR-0006-knowledge-identity-and-lifecycle.md)        | Knowledge identity, lifecycle, storage and taxonomy (D19, D20, D28)                    | Accepted |
| [ADR-0007](../adr/ADR-0007-evidence-plane-trust-boundaries.md)         | Evidence Plane trust boundaries and telemetry integrity (D22, D23, D26, D30, D31, D36) | Accepted |
| [ADR-0008](../adr/ADR-0008-evidence-scoring-and-champions.md)          | Evidence derivation, scoring integrity and the Champion (D24, D27, D32, D33, D34)      | Accepted |
| [ADR-0009](../adr/ADR-0009-release-promotion-and-dependency-policy.md) | Release integrity, the promotion path, and dependency policy (D21, D25, D29, D35)      | Accepted |

D19–D36 are grouped into four architectural records rather than eighteen
separate ones. Several of these decisions answer one question together — D19,
D20 and D28 are all "what is a canonical knowledge object and who may add one" —
and splitting them would scatter a single architectural argument across three
files. `fitness/checks/decision-coverage.test.ts` asserts every decision from
D19 to D36 is covered by an ADR.

---

## 2. Disposition of guide decisions D18–D36

Guide §2.0 states each row is `PROPOSED` and that the coding agent proceeds with
the recommended default unless the owner changed the row. The owner has not
changed any row, so each default is **accepted as proposed**. This table records
that acceptance and any Stage 0 implementation consequence. Rows marked
`ADR pending` still owe an individual ADR file (plan §7, B3).

| Decision                           | Disposition                                   | Stage 0 consequence                                                                                                                                                                                                                                                      |
| ---------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D18 Stack & platforms              | Accepted, with two corrections to stale facts | ADR-0002. Node `24.20.0`, pnpm `11.25.0`. Corrections: (a) the MCP package coordinate in D18.5 is stale — see §3; (b) `pnpm ci` is _not_ used, see §5 C-2. Windows smoke unverified.                                                                                     |
| D19 Identity & canonical lifecycle | Accepted                                      | ULID + type prefix and `content_hash` implemented in `core/src/ids.ts`; canonical status enum `active \| restricted \| quarantined \| deprecated \| superseded` with staging states absent from the canonical contract by construction. ADR pending.                     |
| D20 Asset storage & retrieval      | Accepted                                      | Contract only (asset layout fields). No index, no FTS5, no retrieval at Stage 0. ADR pending.                                                                                                                                                                            |
| D21 Promotion is a pull request    | Accepted                                      | No mechanism at Stage 0. Fitness F3 forbids runtime writes to `knowledge/` and any push/branch call in `tools/` and `packages/` from day one. ADR pending.                                                                                                               |
| D22 Credential boundary            | Accepted                                      | `principals` contract with `principal_kind` and scopes exists so no migration is needed later. **No Supabase provisioning, no token, no key.** Fitness F9 scans for secret-shaped values. ADR pending.                                                                   |
| D23 Remote/ephemeral sessions      | Accepted                                      | `session_kind` and run-level `telemetry_state` / `qualification_eligible` are in the contracts. No runtime. ADR pending.                                                                                                                                                 |
| D24 Offline reads                  | Accepted                                      | `ScoreSnapshot` and `EffectiveScoreView` contracts, including the bootstrap `UNPROVEN` shape and its deterministic digest. Emission is Stage 1. ADR pending.                                                                                                             |
| D25 Agent Contract                 | Accepted                                      | `resolve`/`inspect`/`expand`/`observe` request and response contracts; `context_snapshot_id` derivation implemented and fixture-pinned. No transport. ADR pending.                                                                                                       |
| D26 Telemetry registry & envelope  | Accepted                                      | Envelope contract with `installation_id`, `emitter_id`, `session_kind`; `contracts/telemetry-attributes.yaml` initial allowlist. `origin_class` is **absent** from the envelope by construction (D36). ADR pending.                                                      |
| D27 Evidence staleness             | Accepted                                      | `scope: { paths, depends_on, max_age_days }` with typed selector prefixes in the Evidence contract. No staleness engine. ADR pending.                                                                                                                                    |
| D28 Taxonomy governance            | Accepted, seed deferred                       | `contracts/capabilities.yaml` is structurally valid and explicitly **unseeded**; the legacy registry is unreachable from this session (plan §3, O-5). No capability id invented. ADR pending.                                                                            |
| D29 EOS dependency policy          | Accepted                                      | Exact pins, committed lockfile, per-dependency record in §3 below. **Deviation:** `pnpm ci` replaced by `pnpm install --frozen-lockfile` — see §5 C-2. ADR-0002.                                                                                                         |
| D30 Evidence Plane hosting         | Accepted                                      | **Nothing provisioned.** Stage 0 requires no Supabase; the guide does not ask for it before Stage 2. ADR pending.                                                                                                                                                        |
| D31 Curator / Promoter split       | Accepted                                      | Contract-level only (`principal_kind: service`, proposal scopes). No functions, no workflows. ADR pending.                                                                                                                                                               |
| D32 Derivation reproducibility     | Accepted                                      | `evidence_id` derived per C-03 (JCS over `{run_id, deriver_id, deriver_version, input_snapshot_hash}`), fixture-pinned; `integrity.source_authority` / `integrity.verification` in the contract with the P-02 rule enforced as a contract-level refinement. ADR pending. |
| D33 Holdout policy                 | Accepted                                      | `evidence_policy.eligible_origins` rejects active holdout at the contract level. ADR pending.                                                                                                                                                                            |
| D34 Release-pinned Champion        | Accepted                                      | `SolutionSet` contract with nullable `champion_id`, `canonical_state`, and `challenge_state` **absent from the canonical contract** (C-01). Cross-field invariant tested from the rejecting side. ADR pending.                                                           |
| D35 Hashing Contract               | Accepted, with the boundary made explicit     | ADR-0003. Single implementation in `packages/core/src/hashing.ts`; the two named exceptions (launcher artifact integrity, credential hashing) do not exist yet and are pre-registered in `fitness/allowlist.yaml` as forbidden-until-their-stage.                        |
| D36 Run Classification Authority   | Accepted                                      | `runs` and `principals` contracts exist at Stage 0 so no migration is needed. `origin_class` cannot be expressed in the telemetry envelope contract. ADR pending.                                                                                                        |

---

## 3. External dependency and source records

Guide §6.1 rule 6 and D29 require each dependency to be verified against current
official documentation, pinned exactly, and recorded. The user's instruction adds:
the exact problem it solves, the exact version or commit, licence and attribution
obligations, why it fits, what was copied vs. adapted vs. only studied, and the
tests that prove the integration works.

### 3.1 Installed dependencies

| Dependency         | Version   | Licence    | Problem it solves                                                                         | Fit                                                                                                                                                                                                                                                                               | Copied / adapted / studied                        | Proving test                                                                                  |
| ------------------ | --------- | ---------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Node.js            | `24.20.0` | MIT        | Runtime. D18.1 requires Node 24 LTS.                                                      | LTS through April 2028; bundles SQLite 3.53.4 and native TypeScript type stripping, removing two would-be dependencies.                                                                                                                                                           | Studied (release index and SHASUMS verified).     | `pnpm ieos-doctor`; `tools/harness/test/doctor.test.ts`                                       |
| pnpm               | `11.25.0` | MIT        | Workspace + reproducible install. D18.6.                                                  | `packageManager`/`devEngines` pinning verified against pnpm docs.                                                                                                                                                                                                                 | Studied.                                          | `pnpm install --frozen-lockfile` in CI (B1, pending)                                          |
| typescript         | `6.0.3`   | Apache-2.0 | Strict static types across the boundary.                                                  | The newest stable major **dependency-cruiser 18.2.0 can parse**. See C-8: under TypeScript 7.0.2 the boundary checker silently analysed nothing. `strict` plus the extra strictness flags in `tsconfig.base.json`.                                                                | Studied.                                          | `pnpm typecheck`; `fitness/checks/dependency-graph.test.ts` asserts the analysis is non-empty |
| @types/node        | `24.13.3` | MIT        | Node API types matching the **runtime**, not `latest`.                                    | Deliberately not `26.x`: types ahead of the runtime would let `core` typecheck against APIs Node 24 lacks.                                                                                                                                                                        | Studied.                                          | `pnpm typecheck`                                                                              |
| vitest             | `5.0.0`   | MIT        | Test runner. D18.5.                                                                       | Native ESM + TS; deterministic run order configurable.                                                                                                                                                                                                                            | Studied.                                          | the suite itself                                                                              |
| fast-check         | `4.9.0`   | MIT        | Generated negative cases and shrinking for canonicalization invariants.                   | Property tests are the only practical way to assert JCS idempotence over arbitrary inputs.                                                                                                                                                                                        | Studied.                                          | `packages/core/test/hashing.property.test.ts`                                                 |
| zod                | `4.5.4`   | MIT        | Schema source of truth; `z.toJSONSchema` emission. D18.5.                                 | Guide-mandated. The only third-party package `core` may import (F1b allowlist).                                                                                                                                                                                                   | Studied.                                          | `packages/core/test/contracts/*.test.ts`, `pnpm contracts:check`                              |
| yaml               | `2.9.0`   | ISC        | Parsing `contracts/*.yaml` in tooling and fitness checks.                                 | Tooling only; **never imported by `core`** (F1b).                                                                                                                                                                                                                                 | Studied.                                          | `fitness/checks/contracts-files.test.ts`                                                      |
| dependency-cruiser | `18.2.0`  | MIT        | Static architecture-boundary enforcement (F1a, F2, F4, F5).                               | Guide-mandated. Two known limits, both handled: it cannot prove runtime behaviour (so F3/F11 also get behavioural checks), and it **degrades silently** on an unsupported TypeScript version (so the TypeScript pin is constrained by it and the non-empty analysis is asserted). | Studied; rule configuration written from scratch. | `fitness/checks/dependency-graph.test.ts`                                                     |
| prettier           | `3.9.6`   | MIT        | Byte-stable formatting, which matters because generated schemas are committed and diffed. | Small, no runtime footprint.                                                                                                                                                                                                                                                      | Studied.                                          | `pnpm format:check`                                                                           |

**Not installed, deliberately:** ESLint. D18.5 names it. `typescript-eslint`
compatibility with TypeScript 7.0.2 was not verified in this session, and no
Stage 0 acceptance criterion depends on lint. `tsc --strict` plus
dependency-cruiser plus the fitness checks cover every Stage 0 invariant. Recorded
as a deviation in §5 C-3 rather than adopted unverified.

### 3.2 Vendored data (not code)

| Source                                                                                    | Commit / retrieval                    | Licence                            | What was taken                                                                                                                                                    | Obligation met by                                                                                    |
| ----------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [`cyberphone/json-canonicalization`](https://github.com/cyberphone/json-canonicalization) | `master` branch, retrieved 2026-09-04 | Apache-2.0, © 2018 Anders Rundgren | The six `testdata/input` + `testdata/output` conformance vector pairs — **data only**. No implementation code was copied; `hashing.ts` was written from RFC 8785. | `packages/core/test/fixtures/jcs/NOTICE` retains copyright and licence; the fixtures are unmodified. |

### 3.3 Recorded but not adopted

| Candidate                                                          | Version checked | Licence (source)                    | Status and what must happen first                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------ | --------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@modelcontextprotocol/server`                                     | `2.0.0`         | MIT (npm registry field)            | **The correct v2 coordinate**, superseding D18.5's `@modelcontextprotocol/sdk`. Adopt at Stage 1, under `packages/adapters/mcp` only. Before adopting: read the `LICENSE` and any `NOTICE` of that exact version — upstream carries a transition notice (new code Apache-2.0, existing MIT), so the registry field is not sufficient. |
| `@modelcontextprotocol/client`                                     | `2.0.0`         | MIT (npm registry field)            | Same. Needed for the Stage 1 `2026-07-28` conformance smoke.                                                                                                                                                                                                                                                                          |
| `@modelcontextprotocol/sdk`                                        | `1.30.0`        | MIT                                 | The **legacy v1 name** cited by D18.5. Not adopted. Finding A confirmed.                                                                                                                                                                                                                                                              |
| `better-sqlite3`                                                   | `13.0.3`        | MIT                                 | Not adopted. Its **bundled SQLite version was not verified**; package version alone does not prove the WAL fix is present (finding C / R3). See §4.                                                                                                                                                                                   |
| `sigstore/sigstore-js`                                             | not checked     | Apache-2.0                          | Stage 4 only, and only if `gh` is unavailable. T-08 forbids a hand-written verifier.                                                                                                                                                                                                                                                  |
| `inspect_ai`, `mini-swe-agent`                                     | not checked     | MIT (per research inventory)        | **Studied only**, for harness and isolation design (ADR-0005). Python; no code taken.                                                                                                                                                                                                                                                 |
| `backstage`, `opentelemetry-collector`, `metaflow`, `openai/codex` | not checked     | Apache-2.0 (per research inventory) | **Studied only**; referenced in ADR-0005 and future stages. No code taken.                                                                                                                                                                                                                                                            |

---

## 4. Verified runtime facts (Stage 0 measurements)

Facts measured in this environment on 2026-09-04. They are evidence, and they
carry their own scope: **Linux x64 only.**

| #   | Fact                                             | Value                                                                   | Method                                                       | Consequence                                                                                                                                                                     |
| --- | ------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-1 | Node 24 LTS latest                               | `24.20.0` (Krypton)                                                     | `nodejs.org/dist/index.json`                                 | Pinned as the runtime.                                                                                                                                                          |
| V-2 | Node 24.20.0 tarball integrity                   | `2f2c0da1…7cbf2` matches the official `SHASUMS256.txt`                  | `sha256sum` vs. published sums                               | The runtime used to produce every Stage 0 result is identified, not assumed.                                                                                                    |
| V-3 | **SQLite engine bundled in Node 24.20.0**        | **3.53.4**                                                              | `node:sqlite` → `select sqlite_version()`                    | Above 3.51.3, so it **contains** the WAL concurrent-write/checkpoint corruption fix from research finding R3. Makes `node:sqlite` a serious candidate against `better-sqlite3`. |
| V-4 | FTS5 available in that engine                    | `sqlite_compileoption_used('ENABLE_FTS5') = 1`                          | same                                                         | D20.2's FTS5 index is reachable without a native addon.                                                                                                                         |
| V-5 | pnpm latest v11                                  | `11.25.0`                                                               | npm dist-tags                                                | Pinned.                                                                                                                                                                         |
| V-6 | MCP v2 package coordinates                       | `@modelcontextprotocol/{server,client}@2.0.0`                           | npm registry                                                 | Finding A confirmed; D18.5 coordinate is stale.                                                                                                                                 |
| V-7 | `better-sqlite3` bundled SQLite version          | **NOT MEASURED**                                                        | —                                                            | The binding cannot be selected until this is measured on Node 24 **and** Windows.                                                                                               |
| V-8 | dependency-cruiser 18.2.0 under TypeScript 7.0.2 | **degrades silently**: "1 modules, 0 dependencies cruised", exit code 0 | ran the cruiser against this repository under both compilers | TypeScript pinned to 6.0.3 (C-8). Under 6.0.3 the same command cruises 51 modules and 137 dependencies.                                                                         |

### SQLite qualification (finding C, open item O-4) — MEASURED, NOT SELECTED

The seven checks below are unchanged from when they were first recorded. They
were executed on 2026-09-04 by `tools/sqlite-qualification`
(`pnpm sqlite:qualify`), against both candidates on Linux, and re-executed for
`node:sqlite` on a GitHub Actions `windows-latest` runner on 2026-09-05
(commit `6d8c27b`). Evidence:
`qualification/evidence/sqlite-qualification.json`.

| #   | Check                                                                                 | `node:sqlite`                                                                        | `better-sqlite3`                                       |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| 1   | `sqlite_version()` measured at runtime, never inferred from a package version         | PASS — 3.53.4                                                                        | PASS — **3.53.4, measured through the binding itself** |
| 2   | engine `>= 3.51.3` (the R3 WAL corruption fix)                                        | PASS                                                                                 | PASS                                                   |
| 3   | `pragma journal_mode` returns `wal` on a real file database, **Linux and Windows**    | **PASS on linux and win32**                                                          | PASS on linux; **win32 UNEXECUTED**                    |
| 4   | busy handling: two writers, `timeout >= 5000 ms`, no `SQLITE_BUSY` reaches the caller | PASS — second writer waited 1238 ms, then committed                                  | PASS — waited 1236 ms, then committed                  |
| 5   | WAL truncation under a concurrent reader                                              | PASS — wal 2 080 632 → 0 bytes, reader saw 500 rows throughout                       | PASS — identical                                       |
| 6   | `UNIQUE(event_id)` collision absorbed as a no-op                                      | PASS — 1 row, first write preserved; control confirms a plain duplicate still raises | PASS — identical                                       |
| 7   | the same input builds a reproducible index (F8)                                       | PASS — logical digest stable, and the raw file was byte-identical too                | PASS — identical                                       |

**Measured candidate facts.**

|                    | `node:sqlite`                                          | `better-sqlite3`                                                                                                |
| ------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Binding version    | Node 24.20.0 (built in)                                | `13.0.3`                                                                                                        |
| Bundled engine     | 3.53.4                                                 | 3.53.4                                                                                                          |
| Engine `source_id` | `2026-07-24 19:02:57 bf7c7f30…59bcc`                   | `2026-07-24 19:02:57 bf7c7f30…59bcc` (identical build)                                                          |
| FTS5               | available                                              | available                                                                                                       |
| Native addon       | no                                                     | **yes** — install resolved a prebuild on linux-x64/Node 24; a Windows build or prebuild is **still** unverified |
| Experimental       | **yes** — Node 24 still emits an `ExperimentalWarning` | no                                                                                                              |
| Extra dependency   | none                                                   | one direct + `node-addon-api`                                                                                   |

**Outcome: no binding is selected.** Both pass all seven checks on Linux.
`node:sqlite` now also passes all seven on win32 (2026-09-05), so it has the
complete platform coverage check 3 names. `better-sqlite3` does not, and cannot
get it from this repository's CI: it is deliberately not a dependency here —
adding it would be adopting a candidate in order to qualify it — so the Windows
runner has nothing to load.

Nothing was weakened to reach a selection, and no selection was reached. The
`qualified` field stays `false` for both in the per-run evidence, because a
single run observes a single platform; cross-run platform coverage is asserted
here, in prose, against two named runs, rather than being silently synthesised
into a field that would then claim more than any one measurement supports.

**What the measurement already settles**, so the Windows run only has to confirm
the platform-sensitive half:

- Finding C is discharged for `better-sqlite3`: its bundled engine was measured
  _through the binding_, not substituted from Node's. Both bundle the same
  SQLite build.
- The R3 concern is empirically closed on Linux for both candidates.
- Check 7 produced a finding worth keeping: the database file happened to be
  byte-identical across two builds here, but that is not something to rely on.
  `index_digest` must be taken over canonical structure per D35, never over
  database pages.

### 4c. O-4 is now a decision, not a measurement — open question for the owner

The Windows run that O-4 was waiting on has happened. What it produced is not a
tie-break but an asymmetry, and resolving it is an owner call because either
answer costs something real:

| Option                                                                | What it buys                                                                                                               | What it costs                                                                                                                                                                                   |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Select `node:sqlite`**                                           | The only candidate with all seven checks observed on both required platforms. No dependency, no native build, no ABI risk. | Deviates from **D18.5**, which names `better-sqlite3`. Node 24 still emits an `ExperimentalWarning` for it, so a pinned runtime upgrade could change behaviour under us.                        |
| **B. Keep `better-sqlite3` (the guide's D18.5 choice)**               | No deviation from the frozen guide. A stable, non-experimental API.                                                        | Its win32 coverage is **unobserved and will stay unobserved** while it is not a dependency. Selecting it means selecting on Linux evidence plus the guide's authority, not on the seven checks. |
| **C. Add `better-sqlite3` as a real dependency so CI can qualify it** | Would produce the missing win32 evidence, making B a decision on measurement rather than authority.                        | Adopts a candidate in order to qualify it — the exact ordering this whole tool exists to avoid — and takes on a native addon plus a Windows/Node 24 prebuild requirement before it is chosen.   |

**Recommendation, for the owner to accept or reject: A**, recorded as a
documented deviation from D18.5 in the same way C-1 is recorded — the guide's
choice is not satisfied, and saying so is the point. The engine question is
already settled and does not distinguish them: both bundle the identical SQLite
build 3.53.4, `source_id 2026-07-24 19:02:57 bf7c7f30…`. What separates them is
observed platform coverage and dependency surface, and on both of those
`node:sqlite` is ahead.

**This is not decided here.** Until the owner answers, O-4 stays open and B7
stays PARTIAL. No code depends on either binding yet, so nothing is blocked by
the delay.

## 4b. Owner decisions

| Item                                   | Decision                                                                                                                                                                                                                                                            | Date       | Consequence                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **C-1** — F1 wording vs. Zod in `core` | **Approved.** The F1a/F1b split stands; `packages/core` may depend on the explicitly approved Zod dependency required by D18.5, and on nothing else.                                                                                                                | 2026-09-04 | The exception is kept as narrow as the mechanism can express: `fitness/allowlist.yaml` holds exactly one entry, and a negative control proves the rule still fires for an unauthorised dependency. **C-1 remains recorded as an approved deviation below, not as F1's original wording having been satisfied** — guide §6.1 rule 8 requires a relaxed fitness rule to stay visible as one. |
| **C-6** — normalization vs. RFC 8785   | **Approved.** Unicode NFC normalization and RFC 8785/JCS canonicalization are separate, ordered layers. JCS preserves JSON string contents and never normalizes. Where a domain contract needs NFC, it is applied explicitly _before_ canonicalization and hashing. | 2026-09-04 | Ordering is unambiguous in `ADR-0003` and enforced by tests: canonicalization of a decomposed string differs from the composed one, the UTF-16-vs-UTF-8 ordering fixture is retained, and no deterministic id can depend on an undocumented normalization boundary. **No longer awaiting confirmation.**                                                                                   |

## 5. Deviations from the frozen guide

Each deviation is stated, justified, and flagged. None is silent.

| #   | Guide text                                                                                                                    | Deviation                                                                                                                                 | Justification                                                                                                                                                                                                                                                                                                                                                                                  | Needs owner |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| C-1 | F1: `packages/core` "imports nothing outside itself"                                                                          | Split into F1a (no workspace package) + F1b (no vendor identifier; third-party imports restricted to an allowlist, currently `zod` alone) | D18.5 requires Zod _inside_ `core`'s contracts. The literal rule and D18.5 cannot both hold. The refinement keeps the architectural intent — agent-neutral, vendor-free, I/O-free — and adds a behavioural no-I/O test the original wording did not have. Guide §6.1 rule 8 requires reporting a relaxed fitness rule.                                                                         | **Yes**     |
| C-2 | D18.6 / D29: "CI installs with `pnpm ci`"                                                                                     | `pnpm install --frozen-lockfile`                                                                                                          | Recorded as unverified against pnpm 11.25.0's actual CLI in this session. `--frozen-lockfile` gives the frozen-lockfile guarantee the rule is after. Revisit when CI is written (B1).                                                                                                                                                                                                          | No          |
| C-3 | D18.5 names `eslint` + `prettier`                                                                                             | Prettier only; ESLint deferred                                                                                                            | `typescript-eslint` support for TypeScript 7.0.2 unverified; no Stage 0 criterion depends on lint; "avoid large dependencies without a written rationale".                                                                                                                                                                                                                                     | No          |
| C-4 | D18.5 names `@modelcontextprotocol/sdk`                                                                                       | `@modelcontextprotocol/{server,client}@2.0.0` recorded as the adoption target                                                             | Finding A, confirmed against the registry (V-6). Nothing installed at Stage 0.                                                                                                                                                                                                                                                                                                                 | No          |
| C-5 | Stage 0 deliverables list `drivers/claude-code.ts`, `drivers/codex.ts`, three graders, `collect.ts`, `report.ts`, `budget.ts` | Vendor-neutral `AgentDriver` port + deterministic fake driver + `budget` shape only                                                       | Real drivers need real agent CLIs and a spend decision; writing them untested would be the "code complete = done" failure D17 names. Ports mean no contract changes when they land. Tracked as B2.                                                                                                                                                                                             | No          |
| C-6 | D35 "Strings → UTF-8, NFC normalization" listed inside the hashing contract                                                   | Normalization is a **separate layer applied before** canonicalization, on declared fields only; JCS never normalizes                      | RFC 8785 §3.1 requires string preservation. Fusing them would silently change JSON semantics — explicitly forbidden by the user's instruction B. ADR-0003.                                                                                                                                                                                                                                     | **Yes**     |
| C-7 | Stage 0 exit gate: "identical digests on Linux and Windows CI"                                                                | Verified on Linux only                                                                                                                    | No CI exists yet (B1). The gate is **not** claimed.                                                                                                                                                                                                                                                                                                                                            | No          |
| C-8 | D18.5 implies the current TypeScript                                                                                          | TypeScript pinned to `6.0.3`, one major behind `latest`                                                                                   | Measured during Stage 0: dependency-cruiser 18.2.0 supports `typescript >=2.0.0 <7.0.0`. Under TypeScript 7.0.2 it reported _"1 modules, 0 dependencies cruised"_ and **exited zero** — a boundary check that inspects nothing and calls it success. F1a/F2/F4/F5 are load-bearing, the compiler version is not, so the compiler moved. Revisit when dependency-cruiser supports TypeScript 7. | No          |

---

## 6. Explicitly not done at Stage 0

Recorded so that absence is a decision rather than an oversight: no Supabase
project, key, migration or Edge Function; no MCP server or client; no launcher;
no resolver, telemetry runtime, evidence deriver, scorer or index; no knowledge
assets; no legacy import; no CI workflows; no dashboards, daemons, UI,
embeddings, marketplace or ecosystem discovery; no real agent trial; no
`qualification/reports/` entry.
