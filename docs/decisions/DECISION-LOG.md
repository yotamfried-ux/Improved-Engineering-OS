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

| Decision                           | Disposition                                   | Stage 0 consequence                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D18 Stack & platforms              | Accepted, with two corrections to stale facts | ADR-0002. Node `24.20.0`, pnpm `11.25.0`. Corrections: (a) the MCP package coordinate in D18.5 is stale — see §3; (b) `pnpm ci` is _not_ used, see §5 C-2. Windows smoke unverified.                                                                                                                                                                        |
| D19 Identity & canonical lifecycle | Accepted                                      | ULID + type prefix and `content_hash` implemented in `core/src/ids.ts`; canonical status enum `active \| restricted \| quarantined \| deprecated \| superseded` with staging states absent from the canonical contract by construction. ADR pending.                                                                                                        |
| D20 Asset storage & retrieval      | Accepted                                      | Contract only (asset layout fields). No index, no FTS5, no retrieval at Stage 0. ADR pending.                                                                                                                                                                                                                                                               |
| D21 Promotion is a pull request    | Accepted                                      | No mechanism at Stage 0. Fitness F3 forbids runtime writes to `knowledge/` and any push/branch call in `tools/` and `packages/` from day one. ADR pending.                                                                                                                                                                                                  |
| D22 Credential boundary            | Accepted                                      | `principals` contract with `principal_kind` and scopes exists so no migration is needed later. **No Supabase provisioning, no token, no key.** Fitness F9 scans for secret-shaped values. ADR pending.                                                                                                                                                      |
| D23 Remote/ephemeral sessions      | Accepted                                      | `session_kind` and run-level `telemetry_state` / `qualification_eligible` are in the contracts. No runtime. ADR pending.                                                                                                                                                                                                                                    |
| D24 Offline reads                  | Accepted                                      | `ScoreSnapshot` and `EffectiveScoreView` contracts, including the bootstrap `UNPROVEN` shape and its deterministic digest. Emission is Stage 1. ADR pending.                                                                                                                                                                                                |
| D25 Agent Contract                 | Accepted                                      | `resolve`/`inspect`/`expand`/`observe` request and response contracts; `context_snapshot_id` derivation implemented and fixture-pinned. No transport. ADR pending.                                                                                                                                                                                          |
| D26 Telemetry registry & envelope  | Accepted                                      | Envelope contract with `installation_id`, `emitter_id`, `session_kind`; `contracts/telemetry-attributes.yaml` initial allowlist. `origin_class` is **absent** from the envelope by construction (D36). ADR pending.                                                                                                                                         |
| D27 Evidence staleness             | Accepted                                      | `scope: { paths, depends_on, max_age_days }` with typed selector prefixes in the Evidence contract. No staleness engine. ADR pending.                                                                                                                                                                                                                       |
| D28 Taxonomy governance            | Accepted, **seeded**                          | `contracts/capabilities.yaml` carries 28 ids seeded verbatim from `yotamfried-ux/Engineering-OS@4d517840f18d` (`core/capability-registry.yaml`, source digest `sha256:a6936597…`), with the six enforcement fields dropped and named. O-5 closed at Stage 0 by B4; this row previously described the pre-B4 state and was stale. No capability id invented. |
| D29 EOS dependency policy          | Accepted                                      | Exact pins, committed lockfile, per-dependency record in §3 below. **Deviation:** `pnpm ci` replaced by `pnpm install --frozen-lockfile` — see §5 C-2. ADR-0002.                                                                                                                                                                                            |
| D30 Evidence Plane hosting         | Accepted                                      | **Nothing provisioned.** Stage 0 requires no Supabase; the guide does not ask for it before Stage 2. ADR pending.                                                                                                                                                                                                                                           |
| D31 Curator / Promoter split       | Accepted                                      | Contract-level only (`principal_kind: service`, proposal scopes). No functions, no workflows. ADR pending.                                                                                                                                                                                                                                                  |
| D32 Derivation reproducibility     | Accepted                                      | `evidence_id` derived per C-03 (JCS over `{run_id, deriver_id, deriver_version, input_snapshot_hash}`), fixture-pinned; `integrity.source_authority` / `integrity.verification` in the contract with the P-02 rule enforced as a contract-level refinement. ADR pending.                                                                                    |
| D33 Holdout policy                 | Accepted                                      | `evidence_policy.eligible_origins` rejects active holdout at the contract level. ADR pending.                                                                                                                                                                                                                                                               |
| D34 Release-pinned Champion        | Accepted                                      | `SolutionSet` contract with nullable `champion_id`, `canonical_state`, and `challenge_state` **absent from the canonical contract** (C-01). Cross-field invariant tested from the rejecting side. ADR pending.                                                                                                                                              |
| D35 Hashing Contract               | Accepted, with the boundary made explicit     | ADR-0003. Single implementation in `packages/core/src/hashing.ts`; the two named exceptions (launcher artifact integrity, credential hashing) do not exist yet and are pre-registered in `fitness/allowlist.yaml` as forbidden-until-their-stage.                                                                                                           |
| D36 Run Classification Authority   | Accepted                                      | `runs` and `principals` contracts exist at Stage 0 so no migration is needed. `origin_class` cannot be expressed in the telemetry envelope contract. ADR pending.                                                                                                                                                                                           |

---

## 3. External dependency and source records

Guide §6.1 rule 6 and D29 require each dependency to be verified against current
official documentation, pinned exactly, and recorded. The user's instruction adds:
the exact problem it solves, the exact version or commit, licence and attribution
obligations, why it fits, what was copied vs. adapted vs. only studied, and the
tests that prove the integration works.

### 3.1 Installed dependencies

| Dependency                   | Version   | Licence                  | Problem it solves                                                                                                              | Fit                                                                                                                                                                                                                                                                               | Copied / adapted / studied                                                                                   | Proving test                                                                                  |
| ---------------------------- | --------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Node.js                      | `24.20.0` | MIT                      | Runtime. D18.1 requires Node 24 LTS.                                                                                           | LTS through April 2028; bundles SQLite 3.53.4 and native TypeScript type stripping, removing two would-be dependencies.                                                                                                                                                           | Studied (release index and SHASUMS verified).                                                                | `pnpm ieos-doctor`; `tools/harness/test/doctor.test.ts`                                       |
| pnpm                         | `11.25.0` | MIT                      | Workspace + reproducible install. D18.6.                                                                                       | `packageManager`/`devEngines` pinning verified against pnpm docs.                                                                                                                                                                                                                 | Studied.                                                                                                     | `pnpm install --frozen-lockfile` in CI (B1, pending)                                          |
| typescript                   | `6.0.3`   | Apache-2.0               | Strict static types across the boundary.                                                                                       | The newest stable major **dependency-cruiser 18.2.0 can parse**. See C-8: under TypeScript 7.0.2 the boundary checker silently analysed nothing. `strict` plus the extra strictness flags in `tsconfig.base.json`.                                                                | Studied.                                                                                                     | `pnpm typecheck`; `fitness/checks/dependency-graph.test.ts` asserts the analysis is non-empty |
| @types/node                  | `24.13.3` | MIT                      | Node API types matching the **runtime**, not `latest`.                                                                         | Deliberately not `26.x`: types ahead of the runtime would let `core` typecheck against APIs Node 24 lacks.                                                                                                                                                                        | Studied.                                                                                                     | `pnpm typecheck`                                                                              |
| vitest                       | `5.0.0`   | MIT                      | Test runner. D18.5.                                                                                                            | Native ESM + TS; deterministic run order configurable.                                                                                                                                                                                                                            | Studied.                                                                                                     | the suite itself                                                                              |
| fast-check                   | `4.9.0`   | MIT                      | Generated negative cases and shrinking for canonicalization invariants.                                                        | Property tests are the only practical way to assert JCS idempotence over arbitrary inputs.                                                                                                                                                                                        | Studied.                                                                                                     | `packages/core/test/hashing.property.test.ts`                                                 |
| zod                          | `4.5.4`   | MIT                      | Schema source of truth; `z.toJSONSchema` emission. D18.5.                                                                      | Guide-mandated. The only third-party package `core` may import (F1b allowlist).                                                                                                                                                                                                   | Studied.                                                                                                     | `packages/core/test/contracts/*.test.ts`, `pnpm contracts:check`                              |
| yaml                         | `2.9.0`   | ISC                      | Parsing `contracts/*.yaml` in tooling and fitness checks.                                                                      | Tooling only; **never imported by `core`** (F1b).                                                                                                                                                                                                                                 | Studied.                                                                                                     | `fitness/checks/contracts-files.test.ts`                                                      |
| dependency-cruiser           | `18.2.0`  | MIT                      | Static architecture-boundary enforcement (F1a, F2, F4, F5).                                                                    | Guide-mandated. Two known limits, both handled: it cannot prove runtime behaviour (so F3/F11 also get behavioural checks), and it **degrades silently** on an unsupported TypeScript version (so the TypeScript pin is constrained by it and the non-empty analysis is asserted). | Studied; rule configuration written from scratch.                                                            | `fitness/checks/dependency-graph.test.ts`                                                     |
| @modelcontextprotocol/server | `2.0.0`   | Apache-2.0 + MIT (mixed) | MCP `2026-07-28` server: `server/discover`, the `_meta` envelope, protocol-era classification and the cacheable-result fields. | The v2 coordinate that actually speaks `2026-07-28`; D18.5's `@modelcontextprotocol/sdk` is the v1 monolith (C-4). Imported **only** by `packages/adapters/mcp`, never by `core`. Licence read from the shipped `LICENSE`, not the registry field — see 3.3.                      | Studied. No code copied; the wiring was written against the shipped type declarations and the specification. | `packages/adapters/mcp/test/conformance.test.ts`                                              |
| prettier                     | `3.9.6`   | MIT                      | Byte-stable formatting, which matters because generated schemas are committed and diffed.                                      | Small, no runtime footprint.                                                                                                                                                                                                                                                      | Studied.                                                                                                     | `pnpm format:check`                                                                           |

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

| Candidate                                                          | Version checked | Licence (source)                                                                 | Status and what must happen first                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | --------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@modelcontextprotocol/server`                                     | `2.0.0`         | **Apache-2.0 + MIT (mixed)** — read from the shipped `LICENSE`, not the registry | **The correct v2 coordinate**, superseding D18.5's `@modelcontextprotocol/sdk`. Adopted at Stage 1, under `packages/adapters/mcp` only. **The check was performed and the registry field was indeed insufficient:** `package.json` says `"license": "MIT"`, while the shipped `LICENSE` states the project is mid-transition — new code and specification contributions are **Apache-2.0**, documentation is CC-BY-4.0, and contributions whose authors have not consented to relicensing **remain MIT**. Both licences are permissive and compatible with this repository's use; the record now says so accurately rather than repeating the registry's single word. Verified version `2.0.0`, tarball `sha256:b4f0dfda3b73b322f1091b86fabe568994eb2fedef873b12db2c54adc3cfe198`; it pulls in `@modelcontextprotocol/core@2.0.0` and requires `zod ^4.2.0` (this repository pins `4.5.4`, which satisfies it). |
| `@modelcontextprotocol/client`                                     | `2.0.0`         | **Apache-2.0 + MIT (mixed)**, same transition notice                             | **Installed, then removed.** It was added for the Stage 1 conformance smoke and turned out to be the wrong tool for it: the smoke has to send a missing envelope, a malformed one and an unsupported version, and a conforming client cannot produce any of those. The smoke drives the wire directly instead, so both ends are not the same library agreeing with itself. Not a dependency of this repository.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `@modelcontextprotocol/sdk`                                        | `1.30.0`        | MIT                                                                              | The **legacy v1 name** cited by D18.5. Not adopted. Finding A confirmed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `better-sqlite3`                                                   | `13.0.3`        | MIT                                                                              | Not adopted. Its **bundled SQLite version was not verified**; package version alone does not prove the WAL fix is present (finding C / R3). See §4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `sigstore/sigstore-js`                                             | not checked     | Apache-2.0                                                                       | Stage 4 only, and only if `gh` is unavailable. T-08 forbids a hand-written verifier.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `inspect_ai`, `mini-swe-agent`                                     | not checked     | MIT (per research inventory)                                                     | **Studied only**, for harness and isolation design (ADR-0005). Python; no code taken.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `backstage`, `opentelemetry-collector`, `metaflow`, `openai/codex` | not checked     | Apache-2.0 (per research inventory)                                              | **Studied only**; referenced in ADR-0005 and future stages. No code taken.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

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

**Outcome: `node:sqlite` adopted** (owner decision, 2026-09-05; approved
deviation C-9). Both candidates pass all seven checks on Linux. `node:sqlite`
also passes all seven on win32, so it has the complete platform coverage check 3
names. `better-sqlite3` does not, and cannot get it from this repository's CI: it
is deliberately not a dependency here — adding it would be adopting a candidate
in order to qualify it — so the Windows runner has nothing to load.

Nothing was weakened to reach the selection. No check was relaxed, excluded or
re-run until it passed, and `better-sqlite3` failed nothing: it is unselected for
want of an observation, which is recorded as such rather than dressed up as a
defect.

The `qualified` field stays `false` for both in the per-run evidence, because a
single run observes a single platform. Cross-run platform coverage is asserted
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

**Decided 2026-09-05: option A.** The owner adopted `node:sqlite`, recorded as
documented deviation **C-9** in the same way C-1 is recorded — the guide's choice
is not satisfied, and saying so is the point.

The framing matters and is preserved deliberately. **D18.5 is not being called
wrong.** It preferred `better-sqlite3` on the information available when the
guide was frozen, and that was a reasonable choice on that information. Stage 0
then executed the seven recorded acceptance checks and produced evidence that did
not exist at the time the guide was written; the owner approved the deviation
**on that evidence**. This is precisely the kind of decision an evidence-based
system is built to make possible: the specification is not overridden by opinion,
it is updated by measurement, in the open, with the deviation left visible.

The engine question does not distinguish the candidates — both bundle the
identical SQLite build 3.53.4, `source_id 2026-07-24 19:02:57 bf7c7f30…`. What
separates them is observed platform coverage and dependency surface, and on both
`node:sqlite` is ahead.

**Accepted cost, recorded so it is not forgotten.** Node 24 still emits an
`ExperimentalWarning` for `node:sqlite`. **Re-examination trigger:** if a pinned
Node upgrade changes its behaviour or its stability marker, or if `better-sqlite3`
ever acquires observed win32 coverage in this repository, O-4 is reopened and
C-9 re-evaluated. O-4 is closed; B7 closes with it.

## 4d. Verified MCP facts (Stage 1 measurements)

Measured on 2026-09-05 against `@modelcontextprotocol/server@2.0.0`, by driving
raw JSON-RPC through the SDK rather than by reading its documentation.

### The protocol era is owned by the serving entry, not by `McpServer`

The first wiring — construct an `McpServer`, register tools, `server.connect(transport)` —
produced a server that **is not on the `2026-07-28` era at all**:

- `server/discover` answered `{"code": -32601, "message": "Method not found"}`;
- `tools/list` answered, but with no `ttlMs` and no `cacheScope`.

That looked like the SDK not implementing the revision. It does implement it.
`LATEST_PROTOCOL_VERSION` is `"2025-11-25"` and `SUPPORTED_PROTOCOL_VERSIONS`
lists only 2024–2025 revisions, but those constants are the **legacy `initialize`
list**; the bundle carries a separate `FIRST_MODERN_PROTOCOL_VERSION = "2026-07-28"`
and, in its own words, keeps the modern list _"deliberately separate from
`SUPPORTED_PROTOCOL_VERSIONS` (the legacy `initialize` list)"_.

What activates it is the **serving entry**: `serveStdio` (from
`@modelcontextprotocol/server/stdio`) or `createMcpHandler` for HTTP. The entry
classifies the inbound `_meta` envelope, decides the era, and calls a _factory_
for an instance. `connect()` bypasses that classification and therefore serves 2025. So `packages/adapters/mcp` hands a factory to `serveStdio` and never
connects a server itself.

Re-measured through `serveStdio(factory, { legacy: 'reject' })`, all of it holds:
`server/discover` returns `supportedVersions: ["2026-07-28"]`, `tools/list`
carries `ttlMs`/`cacheScope` from the server's `cacheHints` option, an
unsupported version yields `-32022` with `data.supported`/`data.requested`, a
claim-less request yields `-32022`, and a present-but-malformed envelope yields
`-32602`.

### The stdio entry pins the era per connection, not per request

Measured: after a connection has opened with a valid `2026-07-28` envelope, a
**later** request on that same connection naming an unsupported version is
served normally rather than rejected. That is the documented design of the stdio
binding — _"the opening exchange selects the era, ONE instance from the factory
is pinned for the connection lifetime"_ — and not a defect, but it means a
connection-oriented transport cannot demonstrate "self-describing on **every**
request".

Consequence for the Stage 1 gate, recorded rather than glossed: the conformance
smoke also runs the same server through `createMcpHandler`, where each request is
its own serving unit, and asserts that a good request, a bad-version request and
another good request on one endpoint are each judged on their own envelope. That
HTTP leg is **a test, not a shipped transport** — no listener is opened, and
`ieos-mcp` serves stdio only. `2026-07-28` streamable HTTP also requires the
`Mcp-Method` and `MCP-Protocol-Version` headers to agree with the body; the entry
answers `-32020` when they disagree, which the smoke satisfies by sending both.

## 4e. Pre-Stage-2 hardening (owner audit, 2026-09-05)

Stage 0 and Stage 1 both passed their gates, and post-merge CI on `main` at
`9592650` was green. An owner code review then found five defects that a green
CI could not have caught, because in each case the check that would have caught
them did not exist. None reopens a passed gate; all seven items below were fixed
before Stage 2 began.

The pattern across all five is worth naming: **a test that asserts a shape
rather than a claim**. Each of these had a test beside it that passed.

### H-1 `index_digest` did not cover what the index contains (blocker)

`knowledgeTreeDigest` hashed `{id, content_hash, body_hash}` per asset. D19
defines `content_hash` over `body.md` and `files/`, so `title`, `summary`,
`status`, `problem_id` and `problem.capabilities` — all written to SQLite, and
all of them what the Stage 2 resolver ranks on — could change while the digest
stood still. `index_digest` is an input to every `context_snapshot_id` (T-05),
so a recorded decision could cite an index state it had not seen.

The existing test named `changes the digest when an asset record changes`
mutated `content_hash` directly, which is the one field that did move the
digest. Six new tests mutate title, summary, status, problem id, a capability
and solution-set metadata; all six failed before the fix. The rule is now: if it
reaches the index, it reaches the digest.

### H-2 `content_hash` was never verified against the files (blocker)

It is an addressing key (D19): equal hashes mean "the same content" to the
importer and the resolver. Nothing recomputed it, so it was whatever the author
typed. `readKnowledgeTree` now hashes `body.md` plus everything under `files/`
and rejects a record whose declared hash disagrees.

### H-3 Isolation was proven before the agent ran, not after (blocker)

`runTrial` probed once, before `driver.run`, and returned that report as the
trial's isolation. A driver handed a clean workspace could symlink its way out
of it and the outcome still read `filesystem: proven`. The probe was answering a
question about a moment that had passed.

There were two halves. `runTrial` now probes again on the workspace the driver
leaves behind and takes the stricter verdict per boundary (`strictestOf`). And
`writeIntoTrial` checked containment with `resolve()`, which is lexical: given
`link -> /outside`, the path `link/notes.md` never leaves the workspace by
spelling and leaves it in every other sense. Containment is now physical
(`physicalPathOf`), and it is checked before anything is created, because
`mkdirSync -p` through a symlink escapes just as effectively as the write.

Both have negative controls: a driver that creates an escaping symlink mid-trial
(the outcome must be `violated` and ineligible), and a write through a
pre-existing symlink (must throw, and must not appear outside). Both failed
before the fix; the two matching positive controls passed throughout.

### H-4 Stage 0 row G3 could have become a false PASS

The generator ran the whole `core` project and, if it was green, asserted
`championProperty: { passed: true, cases: 2000 }`. The Champion property test
itself is good — real `fast-check`, a vacuity control, a positive control — and
it genuinely ran, so the recorded Stage 0 PASS is sound. But nothing checked
that the _specific_ test still existed. Renaming or deleting
`champion.property.test.ts` would have left `core` green and G3 still reporting
a property that held over 2000 cases nobody generated.

G3 now names its six tests and reads their outcomes from the run. Verified by
removing the file: `core` stays green at 238 tests, and G3 turns `unproven`,
naming what it did not observe. The invented case count is gone; the evidence
says which tests passed.

### H-5 Two platform records were not required to describe one commit

`usablePlatforms` and `digestRow` never read `commit`. Two green records from
different trees would have produced a PASS, and "identical on 2 platforms" would
have been comparing two different pieces of software. Records must now match the
commit the report is about, and a record that does not is unusable with that
reason stated — "no usable record for win32" sends someone looking for a missing
artifact when the artifact arrived and described something else.

### H-6 `ieos init` wrote a false claim into other people's repositories

The bootstrap paragraph said the four Agent Contract tools were "available over
MCP and over the `ieos` CLI". Every CLI verb exits 3. The test beside it,
`names the four tools and both transports`, asserted that the strings `MCP` and
`ieos` appear in the text — and `ieos` appears in the `Installation:` line
regardless. A substring is not a claim.

The sentence is now derived from `IMPLEMENTED_COMMANDS`, which the dispatcher
also reads, so it corrects itself when the verbs land. Seven end-to-end tests
spawn the CLI and check the declaration against what actually happens.

### Not a defect: the absent agent drivers

Stage 0 has no `drivers/claude-code.ts` or `drivers/codex.ts` although the
frozen guide lists them. That is deviation C-5, recorded at the time: writing
real drivers without running real agents would have produced false confidence,
so the port plus `FakeAgentDriver` stand in, and `TrialOutcome.driverKind`
records which produced any result. Not a Stage 2 blocker; a precondition for the
Stage 3 real-agent slice.

### One digest that did not move

The `index_digest` algorithm changed, but the empty-tree digest
(`sha256:1d46d3b6…`, recorded in the Stage 1 report's G7 row) is unchanged: the
outer shape is the same and there was no content for the change to affect. That
is the correct behaviour, and it means the Stage 1 report's recorded value is
still the value this code produces.

### H-7 A platform record named a failing test but not why it failed

On the Stage 2 branch a win32 record read `428 | 427 | 0 | 1` with one name:
`determinism (fitness F8) changes the digest when only a CAPABILITY changes`.
Three things about that observation matter.

The Windows job itself passed, including step 11, which runs that same test in
its own vitest invocation. It failed only in the evidence collector, which runs
eight projects in one invocation — among them `sqlite-qualification`, which
deliberately spawns writer processes and holds a real SQLite lock for over a
second. The same commit passed in the sibling CI run. Re-running the eight
projects on Linux, including pinned to a single core, did not reproduce it.

Those facts are consistent with the test losing on wall clock rather than on its
assertion: `packages/releases` carried no `testTimeout`, so its filesystem and
SQLite tests inherited vitest's 5s default, sized for an idle Linux machine and
not for a contended two-core Windows runner where the same suite already costs
30s. That is a hypothesis, not a measurement, and it is stated as one.

The reason it can only be a hypothesis is the actual defect. `--reporter=json`
replaces the reporter that would have printed the failure, and the collector read
only test names out of the JSON, so the runner's own explanation reached neither
the log nor the record and then expired with the log. A record that says a
determinism test failed, without saying whether the digest moved or the runner
stopped waiting, cannot be acted on — the same argument that already required
carrying the names rather than a count, one level down.

Both are fixed. `SuiteResult.failures` carries the reason next to the name, the
collector prints it, and the report renders it; the field is optional so records
collected earlier still parse. The projects that drive the real filesystem, real
SQLite files or real subprocesses now declare explicit 30s test and hook
timeouts. A timeout is a liveness backstop, not an assertion: raising it weakens
no claim these suites make, and leaving it where scheduling pressure decides the
verdict was reporting a schedule as a determinism defect.

## 4f. Stage 2 findings

### S-1 Prettier invalidated every seeded `content_hash`

`knowledge/` was not in `.prettierignore`, so `pnpm format` rewrote quote style
and blank lines in the thirteen imported asset bodies _after_ `tools/seed-import`
had computed each `content_hash` over the bytes it wrote. `pnpm build:index`
exited 1 on both platforms and the Stage 1 gate's G1 row failed.

The failing check was the smaller half. `content_hash` is what ties a body to
the section it was imported from at a pinned revision, and a formatter had
quietly made that claim false for every seeded asset. The H-2 build-time
verification caught it, doing exactly the job it was added for.

Fixed by regenerating from the pinned revision, adding `knowledge/` to
`.prettierignore` for the same reason `contracts/capabilities.yaml` and
`qualification/evidence/` are already there, and closing the gap that let it
reach CI: `pnpm test` read only fixture trees, never the committed one, so
`packages/releases/test/committed-tree.test.ts` now holds the real corpus to the
rule the build applies. Verified as a control by editing a body.

### S-2 The ingest function relayed upstream error text into its response

`detail` was the database's own error message, so whatever the plane put in an
error — a parameter value, a row, in principle a token — came back to the
caller. Found by a test written to assert the opposite.

The rule that replaced it is narrow enough to hold: nothing arriving from
outside the function is written into a response body. Refusals carry a fixed
sentence chosen locally; the raw message goes to the function's own log, where
an operator can read it and a client cannot.

### S-3 F12 knew one spelling of "hash"

The rule says canonical and identity hashing lives in one place, and its scan
looked for `createHash(`. A Deno Edge Function has no `node:crypto` and hashes
with `crypto.subtle.digest` — so the day `supabase/functions/ingest` appeared,
F12 would have been blind to every hash it computed while continuing to report
green.

The scan now knows both spellings, with a control for each. The C-02 credential
exception moved from `not-yet-created` to `active` in `fitness/allowlist.yaml`
because its stage arrived, and a second test asserts that site hashes a token
and reaches for no canonical serialization — an allowance granted for opaque
bytes must not become a licence to mint identities.

### S-4 A file mode is not a guarantee on every platform

D22.1 names the OS keychain first and a `~/.ieos/credentials.json` at mode
`0600` as the fallback. On Windows that fallback does not exist: `fs.chmod`
there toggles the read-only attribute and nothing else, so a file written
`0600` reports `0666` and the mode carries no access control at all.

Found by the Windows smoke job failing on `expected 438 to be 384` — that is,
`0o666` where `0o600` was asserted. The useful direction to find it in: the
assertion was written on Linux, where it holds, and the platform that cannot
honour it said so rather than the code quietly shipping a protection nobody had.

Three consequences, none of them a skip:

`ieos auth` now CHECKS the resulting mode instead of assuming chmod worked, and
prints `permissions NOT enforced` with a reason when it did not. Accepting
`0666` because chmod returned without error would leave an owner believing in a
guarantee they do not have, which is worse than the missing guarantee.

The test is platform-aware rather than skipped. Each platform is held to what it
can actually do, and the one that cannot has to say so in its output. A skip
would have dropped the guarantee silently on exactly the platform where it is
absent.

The reason names the remedy — prefer an environment secret on Windows — because
"not enforced" without one leaves the owner unable to tell a misconfiguration
from a platform limit, and only one of those has an action attached.

**Technical debt:** D22.1's primary path, the OS keychain, is not implemented on
any platform; every installation currently uses the file fallback. On Linux and
macOS that fallback is `0600`. On Windows it is the directory's ACLs and nothing
more. This is recorded rather than fixed at Stage 2, and it is the reason the
warning names an environment secret as the better option there.

### Explicitly not done at Stage 2

`candidates`, `promotion_proposals`, and the `read_proposals` / `ack_proposal`
RPCs that guide §5.9's table lists for `proposal.*` principals. They belong to
Stage 10's promotion policy. An empty table with a stub RPC would answer "no
proposals" to a caller who could not tell that from "proposals are not
implemented here". The `proposal.read` and `proposal.ack` scopes are already in
the `principals` constraint, so adding them later needs no migration of that
table.

The Evidence Plane is also **not deployed**. The migration and the function are
executed against a real PostgreSQL in CI, which proves their behaviour; it does
not prove they work on Supabase, whose platform supplies `auth.uid()`, the
`service_role` identity and the Edge Function runtime. That remains UNPROVEN
until the owner's Pro project exists (D30) and the deploy runs.

## 4b. Owner decisions

| Item                                   | Decision                                                                                                                                                                                                                                                            | Date       | Consequence                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **C-1** — F1 wording vs. Zod in `core` | **Approved.** The F1a/F1b split stands; `packages/core` may depend on the explicitly approved Zod dependency required by D18.5, and on nothing else.                                                                                                                | 2026-09-04 | The exception is kept as narrow as the mechanism can express: `fitness/allowlist.yaml` holds exactly one entry, and a negative control proves the rule still fires for an unauthorised dependency. **C-1 remains recorded as an approved deviation below, not as F1's original wording having been satisfied** — guide §6.1 rule 8 requires a relaxed fitness rule to stay visible as one. |
| **C-6** — normalization vs. RFC 8785   | **Approved.** Unicode NFC normalization and RFC 8785/JCS canonicalization are separate, ordered layers. JCS preserves JSON string contents and never normalizes. Where a domain contract needs NFC, it is applied explicitly _before_ canonicalization and hashing. | 2026-09-04 | Ordering is unambiguous in `ADR-0003` and enforced by tests: canonicalization of a decomposed string differs from the composed one, the UTF-16-vs-UTF-8 ordering fixture is retained, and no deterministic id can depend on an undocumented normalization boundary. **No longer awaiting confirmation.**                                                                                   |

## 5. Deviations from the frozen guide

Each deviation is stated, justified, and flagged. None is silent.

| #    | Guide text                                                                                                                                                                | Deviation                                                                                                                                                                                                                                   | Justification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Needs owner     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| C-1  | F1: `packages/core` "imports nothing outside itself"                                                                                                                      | Split into F1a (no workspace package) + F1b (no vendor identifier; third-party imports restricted to an allowlist, currently `zod` alone)                                                                                                   | D18.5 requires Zod _inside_ `core`'s contracts. The literal rule and D18.5 cannot both hold. The refinement keeps the architectural intent — agent-neutral, vendor-free, I/O-free — and adds a behavioural no-I/O test the original wording did not have. Guide §6.1 rule 8 requires reporting a relaxed fitness rule.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | **Yes**         |
| C-2  | D18.6 / D29: "CI installs with `pnpm ci`"                                                                                                                                 | `pnpm install --frozen-lockfile`                                                                                                                                                                                                            | Recorded as unverified against pnpm 11.25.0's actual CLI in this session. `--frozen-lockfile` gives the frozen-lockfile guarantee the rule is after. Revisit when CI is written (B1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | No              |
| C-3  | D18.5 names `eslint` + `prettier`                                                                                                                                         | Prettier only; ESLint deferred                                                                                                                                                                                                              | `typescript-eslint` support for TypeScript 7.0.2 unverified; no Stage 0 criterion depends on lint; "avoid large dependencies without a written rationale".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | No              |
| C-4  | D18.5 names `@modelcontextprotocol/sdk`                                                                                                                                   | `@modelcontextprotocol/{server,client}@2.0.0` recorded as the adoption target                                                                                                                                                               | Finding A, confirmed against the registry (V-6). Nothing installed at Stage 0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | No              |
| C-5  | Stage 0 deliverables list `drivers/claude-code.ts`, `drivers/codex.ts`, three graders, `collect.ts`, `report.ts`, `budget.ts`                                             | Vendor-neutral `AgentDriver` port + deterministic fake driver + `budget` shape only                                                                                                                                                         | Real drivers need real agent CLIs and a spend decision; writing them untested would be the "code complete = done" failure D17 names. Ports mean no contract changes when they land. Tracked as B2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | No              |
| C-6  | D35 "Strings → UTF-8, NFC normalization" listed inside the hashing contract                                                                                               | Normalization is a **separate layer applied before** canonicalization, on declared fields only; JCS never normalizes                                                                                                                        | RFC 8785 §3.1 requires string preservation. Fusing them would silently change JSON semantics — explicitly forbidden by the user's instruction B. ADR-0003.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | **Yes**         |
| C-7  | Stage 0 exit gate: "identical digests on Linux and Windows CI"                                                                                                            | **No longer a deviation — met.** Kept for the record.                                                                                                                                                                                       | Was "verified on Linux only" while no CI existed. Verified on both platforms on 2026-09-05 (run 33953023783): `sha256:e8c450ac…ee6febbe` on each. This clause of the gate is satisfied.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | No              |
| C-8  | D18.5 implies the current TypeScript                                                                                                                                      | TypeScript pinned to `6.0.3`, one major behind `latest`                                                                                                                                                                                     | Measured during Stage 0: dependency-cruiser 18.2.0 supports `typescript >=2.0.0 <7.0.0`. Under TypeScript 7.0.2 it reported _"1 modules, 0 dependencies cruised"_ and **exited zero** — a boundary check that inspects nothing and calls it success. F1a/F2/F4/F5 are load-bearing, the compiler version is not, so the compiler moved. Revisit when dependency-cruiser supports TypeScript 7.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | No              |
| C-9  | D18.5 names `better-sqlite3` as the SQLite binding                                                                                                                        | `node:sqlite` adopted instead                                                                                                                                                                                                               | **Owner-approved 2026-09-05, on evidence the guide did not have.** D18.5 chose `better-sqlite3` on the information available when the guide was frozen; it is not being called wrong. Stage 0 then executed the seven recorded acceptance checks and produced new evidence: `node:sqlite` is the only candidate with complete observed qualification on **both** required Stage 0 platforms (linux + win32); it introduces no external or native dependency; and both candidates expose the **same measured** engine — SQLite 3.53.4, `source_id 2026-07-24 19:02:57 bf7c7f30…59bcc` — so the engine question does not distinguish them. Accepted cost: Node 24 still flags `node:sqlite` experimental, recorded as a re-examination trigger in §4c. Evidence: `qualification/evidence/sqlite-qualification.json` (linux), `sqlite-qualification-win32.md` (win32). | **Yes** — given |
| C-10 | Stage 0 exit gate: "F1–F12 green"                                                                                                                                         | Read as: every rule enforceable at Stage 0 is green; every rule whose subject belongs to a later stage is explicitly `partial`/`not-yet-enforceable` **and carries a dormancy guard** that fails the moment its subject appears un-enforced | **Owner-approved 2026-09-05.** The literal reading is unsatisfiable at Stage 0: seven of the thirteen rules name components (`packages/launcher`, `packages/releases`, `packages/resolver`, `simulations/`) that Stage 0 deliberately does not create, so "green" could only be reached by deleting the rules or by letting them pass over nothing — the vacuous success this repository already hit once. The approved reading keeps every rule visible and makes dormancy **conditional on absence**: `fitness/checks/dormancy.test.ts` asserts, per rule, that its subject does not exist yet; the day someone adds one, that test fails and the rule must be armed. Dormancy therefore cannot outlive its reason.                                                                                                                                               | **Yes** — given |
| C-11 | §3 composition set: `adapters/* -> core, resolver, telemetry, assurance, store-sqlite, store-supabase`, with `evidence-derivation` listed only for `supabase/functions/*` | `packages/adapters/cli` may import `packages/evidence-derivation`; every other adapter still may not                                                                                                                                        | The guide contradicts itself here, and both halves are load-bearing. §3 puts derivation on the server side; Stage 2's own deliverables require `ieos investigate <run_id>` v0 to produce "D32 deterministic ids **locally from the outbox**", which no package in the adapter composition set can do. The narrowest resolution wins: F2 is split into two dependency-cruiser rules so the exception is one directory wide and mechanically enforced, with a control proving the rule still fires for `adapters/mcp`. The alternative -- widening the composition set for all adapters -- would have relaxed the boundary everywhere to serve one command. Guide §6.1 rule 8 requires a relaxed fitness rule to stay visible as one, so this row exists rather than a quiet regex edit.                                                                              | **Yes**         |

---

## 6. Explicitly not done at Stage 0

Recorded so that absence is a decision rather than an oversight: no Supabase
project, key, migration or Edge Function; no MCP server or client; no launcher;
no resolver, telemetry runtime, evidence deriver, scorer or index; no knowledge
assets; no legacy import; no CI workflows; no dashboards, daemons, UI,
embeddings, marketplace or ecosystem discovery; no real agent trial; no
`qualification/reports/` entry.
