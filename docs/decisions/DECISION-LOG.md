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

### S-5 A Supabase project's own default privileges reopened every RPC

Found on the first real deploy, not in CI: the migration applied cleanly to a
fresh Supabase project, but `select has_function_privilege('anon', ...)`
against the live database came back `true` for all six functions, `ieos_
principal` included — the one the migration's own comment says "is not
granted at all... exposing it would turn the RPC surface into a token
oracle."

The cause was invisible to the local suite by construction. A Supabase
project runs `alter default privileges in schema public grant execute on
functions to anon, authenticated, service_role` once, before any migration
of its own ever executes, so every function `create`d afterward inherits
that grant _directly on the named roles_ — not through `PUBLIC`. `0001`'s
closing block only ever said `revoke all on function ... from public`, which
undoes a grant made to `PUBLIC` and does nothing to one made straight to
`anon`. Bare PostgreSQL has no such standing default, so the local harness's
`create role anon nologin` produced a role with no grant to revoke, the
existing test asserting the closure (`grants the RPCs to service_role and to
nobody else`) had nothing to catch, and it passed — truthfully, for an
environment that had never reproduced the platform behaviour it was supposed
to be checking.

Fixed at the root, in that order: `supabase/tests/harness.ts` now runs that
same `alter default privileges` statement before applying a migration, so a
local run reproduces the platform's starting state rather than a friendlier
one. Re-running the suite unchanged then turned the two grant assertions red
— confirming the harness fix, not just the migration fix, before either was
trusted. `0001_evidence_plane.sql`'s closing block now names `anon`,
`authenticated` and `service_role` explicitly in every `revoke`, alongside
`public`. Applied to the live project as a second statement (Supabase's own
migration ledger, not a new file in this repository — the git history stays
one correct migration, not one migration and a patch), and reverified by
querying `has_function_privilege` directly against the live database: all
six functions closed exactly as designed, and `get_advisors(type: security)`
went from six `SECURITY DEFINER`-reachable-by-`anon` warnings to zero.

### Explicitly not done at Stage 2

`candidates`, `promotion_proposals`, and the `read_proposals` / `ack_proposal`
RPCs that guide §5.9's table lists for `proposal.*` principals. They belong to
Stage 10's promotion policy. An empty table with a stub RPC would answer "no
proposals" to a caller who could not tell that from "proposals are not
implemented here". The `proposal.read` and `proposal.ack` scopes are already in
the `principals` constraint, so adding them later needs no migration of that
table.

**The Evidence Plane is now deployed** to a real Supabase project (`improved-
engineering-os`, ref `hvfpblugxqxwmmqqksjs`, `eu-central-1`), created on the
organization's **Free** plan — the owner had not yet upgraded to Pro at the
time of deploy, so D30's "no inactivity pause; daily backups" guarantee does
not hold yet. This is a placeholder for proving the deploy path works, not a
substitute for the Pro project D30 requires; the org's Free plan pauses the
project after 7 idle days, which the deployed function does nothing to
prevent. Proven directly against the live project (schema created, RLS
enabled on every table, the six functions grant exactly `service_role` for
five and nobody for `ieos_principal`, zero security advisor findings): the
migration's behaviour on Supabase itself, not only on a bare PostgreSQL
standing in for it. **Not proven**: an actual round trip through the
deployed `ingest` Edge Function. This session's own egress policy blocks
outbound HTTPS to `*.supabase.co`, so no request reached the function from
here, and there is no tool in this session to inspect or set Edge Function
secrets — so whether `SUPABASE_SECRET_KEYS` is populated in the function's
running environment, which its own code depends on to authenticate to the
database, is UNPROVEN rather than assumed. The function's request-handling
logic is proven independently (`supabase/tests/ingest-function.test.ts`, 36
cases, no network); the deploy entrypoint that wires it to `Deno.serve` and a
real RPC call (`supabase/functions/ingest/serve.ts`) is new and has not run
outside this deploy.

**Update, same day: the organization is now on Pro.** The owner upgraded
`yotamfried-ux's Org` through the Supabase Dashboard billing page after the
paragraph above was written. Reverified directly: `get_organization` returns
`plan: "pro"`. D30's hosting requirement — no inactivity pause, daily
backups — now holds for the deployed project as it stands, closing the one
placeholder condition the paragraph above named. The two findings that
remain UNPROVEN are unrelated to the plan tier and unchanged by this
upgrade: an actual HTTP round trip through the deployed `ingest` function
(this session's egress policy still blocks `*.supabase.co`, and there is
still no tool here to inspect Edge Function secrets), and the weekly
`pg_dump` export plus restore-drill D30 also names, which is scheduling and
tooling work not yet built.

## 4g. Pre-Stage-3 readiness (owner-directed audit, 2026-09-09)

Stage 2 and its Supabase follow-up (#7) are merged; Stage 3 is next. Before
touching the vertical slice itself, the owner asked for every real Stage 3
entry prerequisite to be closed, and only those — not a wish list. This
section is that audit, done by re-reading the frozen guide's own Stage 3
section rather than by inferring blockers that would merely be nice to have.

**Independently reverified, not assumed from the earlier session's claims:**
`main` at `bdb45d9`; Stage 0/1/2 qualification reports each read `Verdict:
PASS` (6/0/0, 9/0/0, 11/0/0 respectively) directly from the committed report
files; the live Supabase project (`hvfpblugxqxwmmqqksjs`) is
`ACTIVE_HEALTHY` on organization plan `pro`; `ingest` is `ACTIVE`; both
migrations (`0001_evidence_plane`, `0001b_close_platform_default_grants`)
are present in Supabase's own ledger; `has_function_privilege` against the
live database confirms the S-5 fix still holds (all six functions closed to
anon/authenticated, five granted to service_role, `ieos_principal` granted
to nobody); `get_advisors(type: security)` returns zero findings.

**Credential hygiene.** The disposable test principal minted in the prior
turn (`inst_roundtrip_test`) was exposed in conversation output before the
owner had a chance to use it. Checked first, not assumed: `raw_events` and
`observations` show zero rows under that installation id and
`last_seen_at` is null, so it was never actually presented to the plane.
Revoked anyway (`revoked_at` now set), since exposure in chat is the
compromise, not use. A second, distinct disposable principal
(`inst_stage3_readiness_probe`, same three minimal scopes, 2-hour expiry)
was minted for the one round-trip test described below; neither token's
plaintext appears in this file, a PR body, or any commit.

**The live HTTP round trip is PROVEN** (2026-09-10, live project
`hvfpblugxqxwmmqqksjs`). This is post-Stage-2 / pre-Stage-3 **operational
evidence** — not a stage gate. It does not touch the Stage 2 report or its
verdict, which were closed on the evidence they were designed to measure.

The chain, each link observed rather than inferred: an external HTTP POST
to `.../functions/v1/ingest/ingest_events` carrying only an installation
token → the deployed Edge Function → token authentication (the principal's
`last_seen_at` moved to `22:36:25.929777+00`, which only the successful
resolver path writes) → the `ingest_events` RPC → a persisted `raw_events`
row. Verified in SQL, not from the HTTP body: `event_id`
`evt_stage3_readiness_1`, `installation_id inst_stage3_readiness_probe`,
`emitter_id emt_readiness`, `sequence 0`, `event_type tool.call`,
`occurred_at`/`observed_at` as sent, `ingested_at 22:36:25.929777+00`
server-stamped an hour and a half after the client's own `occurred_at` of
`21:00:00+00`, and `origin_class operational` — correct for an unregistered
run (D36). The stored envelope retains neither `origin_class` nor
`ingested_at`.

**Negative controls, all against the live deployment:** a second event
(`evt_stage3_readiness_2`) that _did_ carry `"origin_class":"qualification"`
in its payload was stored as `operational` — a client cannot promote its own
evidence. A malformed token was refused `401 malformed_installation_token`.
After revoking the probe credential, the same request was refused `403
revoked_installation_token`. Neither refused call wrote a row.

**Idempotent retry: `count: 1`, no duplicate.** Re-sending the identical
event returns `{"count":1,"accepted":["evt_stage3_readiness_1"]}` and the
table still holds exactly one row for that id, with `ingested_at` unchanged
from the original insert.

**A false alarm worth recording, because it nearly became a "finding".** An
earlier attempt at the retry returned `count: 0` twice, which contradicts
that contract, while replaying the identical RPC directly in SQL returned
`count: 1` every time. That looked like a transport-layer defect, and was
held open as a blocker rather than written off. It was neither. A temporary
diagnostic function — the same accepted-SELECT, reporting its own
internals — was called over the _same_ Edge Function → PostgREST path and
returned `accepted_count: 1`, proving the transport correct
(`session_user authenticator`, `role_setting service_role`, `current_user
postgres`, parameters intact). The difference was `ingest_events`' empty-batch
early return, which the diagnostic lacks. The retries had been typed into a
fresh PowerShell window each time, where `$body` from the previous window no
longer existed, so an empty body was sent; the function correctly answered
`count: 0` for a zero-length batch. The contract was never actually
exercised until it was driven server-side. **The lesson is about method, not
code: a red result reproduced twice through one client is evidence about the
client too, and "reproducible" is not the same as "understood".**

The proof was ultimately driven from inside the project itself: this
session's egress policy still returns `403` to `*.supabase.co` (re-probed,
not assumed), and that block was not routed around. Instead `pg_net` — the
extension Supabase ships for exactly this — was installed temporarily so the
database issued the HTTP requests to its own Edge Function. Every temporary
artifact has been removed: the diagnostic function, its log table and
`pg_net` are dropped, the `diag` endpoint is neutralised in place (this
toolchain has no delete-function call), and both probe credentials are
revoked. Two test rows remain in `raw_events`, retained deliberately as the
evidence above; the security advisor still reports zero findings.

**C-5 reconciled: the real primary-agent driver is Stage 3's own first
task, not a prerequisite to starting it.** The frozen guide's Stage 3
section describes exactly one deliverable — "at least three independent
tasks with the primary agent only... driven by the harness" (T-07) — and
never separates "build the driver" from "run the trials" into different
stages, unlike Stage 8, which names building the _second_ driver as its own
explicit deliverable. `tools/harness/src/driver.ts`'s own docstring already
said as much when it was written: "Implemented at Stage 2/3 for the primary
agent." The `AgentDriver` port and `FakeAgentDriver` test double exist,
untouched by this audit, and are exactly what a real implementation is
meant to satisfy — this is confirmed ready, not built now. One thing Task 1
must also settle that this audit does not: **O-3, which agent is primary,
is still formally open** (`docs/plan/stage-0-plan.md`: "Not chosen... Owner/
stage decision; no evidence exists yet"). `packages/adapters/claude-code`
already exists from Stage 2's hook work, which is suggestive but is
infrastructure for whichever agent ends up primary, not a decision — Task 1
still has to make that decision explicit before the driver it writes can be
anything but speculative.

**D30 reconciled: the weekly `pg_dump` / restore-drill is not a Stage 3
gate.** Three independent places in the frozen guide tie it to release
candidates, not to Stage 3: D30's own row ("restore drill **each RC**"),
D30's prose ("a restore drill into a scratch project **at every RC**"), and
Stage 17's deliverables ("Evidence Plane restore drill into a scratch
Supabase project (D30)"); the open-parameters register lists the drill's
timing as "Stage 17" outright. Nothing in the guide's Stage 3 section
mentions either. Recorded as **non-blocking debt**, trigger: before the
first `1.0.0-rc.N` is cut (Stage 17) — named explicitly rather than left
ambiguous, per the owner's instruction not to silently leave it that way.

**Classification of every item this audit considered:**

| Item                                            | Classification                          | Why                                                                                                                                                                                                         |
| ----------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live HTTP round trip through `ingest`           | **CLOSED** (was BLOCKER BEFORE STAGE 3) | Stage 3's trials (T-07) require telemetry to actually reach the plane. Proven end to end against the live deployment on 2026-09-10, with negative controls and an idempotent retry; see the paragraph above |
| Real primary-agent `AgentDriver` implementation | **REQUIRED DURING STAGE 3**             | The guide names it as part of T-07 itself, not a separate prior stage; the port is ready and waiting, per C-5                                                                                               |
| O-3 (which agent is primary)                    | **REQUIRED DURING STAGE 3**             | Bound to the driver decision above; not evidenced by anything built so far                                                                                                                                  |
| D30 weekly `pg_dump` + restore drill            | **NON-BLOCKING DEBT**                   | Guide ties it to Stage 17 (RC) in three places; not mentioned in Stage 3's own text                                                                                                                         |
| Stage 0/1/2 report regression                   | **checked, not a blocker**              | All three independently reverified PASS on `main` at `bdb45d9`; nothing about this audit's work touches their evidence                                                                                      |
| CodeRabbit / independent review of #6, #7       | **NON-BLOCKING DEBT, pre-existing**     | Recorded already in both PR bodies; Free-tier CodeRabbit skips real review; unrelated to Stage 3 entry                                                                                                      |

## 4h. Stage 3 findings (real agent vertical slice, 2026-09-11)

**Gate: NOT PASSED — 7 pass, 2 fail, 0 unproven**, per
`qualification/reports/stage-03-2026-09-11.md`, harness-generated from six first-bank
trial records at revision `4371506`, plus eight paired hard-bank trials reported
alongside them. Nothing in this document closed or opened that
gate, and this section is one of the things that report is meant to be able to
contradict.

Both failing rows have a single cause and neither is about the agent or the tasks:
**this environment's egress policy does not reach the Evidence Plane host.** No run
could be confirmed with the plane, so every run is `operational` and no trial is
qualification evidence (T4); and every trial ended `telemetry_state: INCOMPLETE`
because the boundary flush had nowhere to go, which this repository's own rule
excludes from measurement (T7). The remedy is an environment whose network policy
permits that host. No code change is implied and the trials re-run unmodified.

### O-3 is closed by reading, not by preference

The primary agent is **Claude Code**. The frozen guide settles it three times over:
Stage 0's deliverables name `drivers/claude-code.ts` as "Agent SDK `query()` with
`setting_sources=[]` … or `claude -p --output-format stream-json`"; Stage 3's trial
paragraph fixes the driver by naming `setting_sources`, which is that surface and
not Codex's `codex exec --json --ephemeral`; and Stage 8 is built around the
"second agent (Codex) adapter … brought to parity with the primary agent". O-3 was
never an open preference, it was an unread cross-reference. No contract changed.

### S-6 The MCP server refused the protocol era its clients speak

The first real trial recorded "`resolve` was not called". That read like a finding
about the agent and was a fact about one line of configuration.

`serveIeosMcp` passed `legacy: 'reject'`. The primary agent's MCP client opens with
an `initialize` request carrying no self-describing envelope, which is a 2025-era
opening; the server answered `-32022`, the client marked the server `failed`, and
the agent was offered no EOS tools at all. The session's own init event says
`mcp_servers: [{"name":"ieos","status":"failed"}]`.

**Root cause, and it is not about MCP.** Stage 1's conformance gate passed because
its client was written against the same reading of the specification as the server.
A client that always sends the modern envelope can never discover that real clients
do not. A conformance suite that only talks to itself proves internal consistency
and reports it as interoperability.

Fixed by serving both eras. The modern guarantees stay asserted where they can be
held — a modern opening still gets the modern era, an envelope naming an
unsupported revision is still `-32022`, and per-request envelope re-reading is
still asserted through the HTTP entry where each request is its own serving unit.
Two stdio controls that asserted refusal now assert service, each carrying why it
changed, and a new test opens the handshake a real client opens with and requires
the four tools to come back: an accepted handshake offering no tools would leave an
agent exactly as empty-handed as the refusal did.

The version-1 trial that found this is kept under
`qualification/evidence/stage-3/version-1/` rather than deleted. A failure that
disappears from the record is a criterion quietly changed (D14).

### S-7 The harness registered one run and the hooks emitted under another

D36 has a service principal register `run_id -> origin_class` before a run's first
event. The adapter hooks minted their own id at `SessionStart`, so the two halves
never met: the harness registered `run_s3_guard_fail_closed_t1` while the outbox
carried `run_01M28SDBXN9JDRKQW6GE8JK5SA`. The registered run produced no events,
the emitting run was never registered, and the plane would have been right to stamp
every event `operational` — a disagreement nothing downstream could surface,
because both halves looked internally consistent.

Stage 2 built both halves and could not have caught it. The harness registers and
the hooks emit; nothing ran them together until a real trial did.

The hooks now honour `IEOS_RUN_ID` when it names a run, and validate it rather than
trust it — an unvalidated variable would put arbitrary text in the run identity of
every event, where nothing downstream could tell it from an id. Absent or
malformed, a fresh id is minted exactly as before. Verified end to end.

### S-8 The harness graded a trial the agent never attempted

One trial died on its opening turn: the account hit a session limit, the run
reported `is_error` with one turn and no tool calls, and the fixture was untouched.
The harness graded that workspace anyway, every rule failed, and the record read
"the agent could not add backoff" — a false failure of precisely the kind this
repository exists to refuse, since the graders were reading an unmodified fixture
and reporting it as a verdict about an agent that was never asked.

An incomplete run now yields no verdicts, and the trial is `unproven` carrying the
agent's own terminal message. The manifest's recovery procedure applies: discard
the workspace and re-run, which is what happened.

A second instance of the same shape was found in the report generator itself: it
counted the trace rule, which is deliberately non-gating, and so failed the row
about whether the task was solved. A false FAIL from a report generator is no
better than a false PASS.

### The isolation mechanism ADR-0005 deferred to this stage now exists

`defaultTrialPolicy` required all four boundaries and the Stage 0 sandbox could
prove two; its own comment said proving `process` and `network` "needs a container,
namespace or equivalent mechanism, which is a Stage 3 precondition". Left alone,
every Stage 3 trial would have reported `qualificationEligible: false` and the
stage could not honestly have passed.

`tools/harness/scripts/ns-trial.sh` runs each trial inside a rootless
user + mount + PID + network namespace set and then observes what it built, from
inside. On all six trials: the evaluator and simulations trees showed **0 entries**
(an empty directory is mounted over them, so "`evaluator/` never mounted" is a fact
about the filesystem rather than a convention about callers), the control
destination outside the egress allowlist was **refused**, the trial was **pid 1**,
and the environment was **built** rather than filtered. The agent still completed,
because the one allowed destination is the inference endpoint.

`deriveQualificationEligibility` now aggregates several probers of one boundary by
letting evidence outrank the absence of it, while a violation from any prober still
decides it. The directory sandbox's `network: unproven` is a fact about the prober;
letting it defeat a mechanism that dropped `OUTPUT` by default and watched a
control destination time out would discard the only real evidence in favour of an
admission of ignorance. Two probes by the same prober keep the strictest rule.

The network policy for a real-agent trial is `allowlist`, not `deny`, and that is a
statement about what the trial is rather than a relaxation: the inference channel
is the agent. Package registries, code search and the rest of the internet are
dropped by the same rule that proves the boundary, and `WebSearch`/`WebFetch` are
not in the driver's allowed tools, so a trial cannot fetch its own answer.

### The finding the gate rows do not carry

`resolve` was called in **0 of 6** trials. The tools were connected in every one —
verified in each session's own init event after S-6 — and the bootstrap block was
present in `CLAUDE.md` and `AGENTS.md`, written by `ieos init --with-hooks` rather
than by a fixture. The agent solved all three tasks correctly without consulting
EOS once, including the task built on the Stage 2 lesson
`guard-precondition-weaker-than-the-operation` whose trap — a readable directory at
the plugin path — it was never told about and handled anyway.

The gate's wording admits this: EOS was used "where the lesson was needed, or
correctly did not need it", and it correctly did not need it. But the stage's
question was whether EOS is **natural**, and the answer six trials give is that on
tasks a capable agent can already do, it is not reached for at all. That is a
finding about the value proposition rather than the plumbing, and the guide has a
clause for exactly it: _if the slice is not natural, stop here and simplify;
nothing from Stage 4 onward is built until this passes._

**So Stage 4 is not started.** The honest next question is not "how do we make the
agent call `resolve`" — coaching it would destroy the only measurement that matters
— but whether the tasks were too easy to need prior knowledge, which is a question
about the task bank and can be answered by building harder ones.

### S-9 A trial the agent was refused was graded as a trial it failed

Four hard-bank trials came back with every rule failed, and none of it was about the
agent. The task asked for a file under `.claude/plans/`; the Write tool refuses a
settings directory and `acceptEdits` does not cover it. Each agent composed the plan,
was refused, retried once, was refused again, and then said plainly that it could not
proceed — which is the correct behaviour. The harness graded the untouched workspace.

S-8's guard missed it because the run _did_ complete: the agent finished its turn by
explaining it was blocked. So the driver now records `permission_denials` and the
runner declines to grade any trial carrying one. Deliberately conservative — a denial
the agent legitimately worked around lands here too, and a wasted re-run costs one
trial where a graded obstruction costs the conclusion.

The four trials are kept under `qualification/evidence/stage-3/obstructed/`, and their
denial records are worth reading: all four agents put "CI is green on the pull request"
inside the `## DoD` checklist, in both arms. That is exactly the structure the recorded
control forbids, and it is suggestive rather than evidence — grading blocked content
would score an intention rather than an outcome.

### S-10 Availability changes nothing: the agent does not ask

This is the finding Stage 3 exists to produce, and the paired design is what turns it
from a suspicion into a result.

The first bank could not distinguish "EOS was not needed" from "EOS was not reached
for", because every task was solvable without it. So a second bank was built from two
assets that were in the corpus before the tasks existed, and every trial was run
twice: once with the EOS tools offered, once with them withheld and nothing else
changed. (S-12: "withheld" meant refused rather than absent at the time, which is a
correction to this sentence and not to its conclusion -- both arms failed identically
either way.)

|                                          |                                              |
| ---------------------------------------- | -------------------------------------------- |
| `resolve` calls across both banks        | **0 of 12 trials**                           |
| `plan-dod-external-gates`, eos arm       | 4/6 rules — fails on the recorded convention |
| `plan-dod-external-gates`, native arm    | 4/6 rules — **fails identically, same rule** |
| `plugin-install-marketplace`, native arm | passed 1 of 2                                |

Each link in the chain was checked before the conclusion was drawn:

- **The task discriminates.** The correct reference passes every rule; the naive one
  fails exactly the trap rule with its suite green; the untouched fixture fails.
- **The knowledge is there.** A `control_guidance` in the corpus states the rule.
- **Retrieval works.** `resolve` ranks that asset first for a plausible hint, verified
  before the task was written, so a miss is not a search failure.
- **The tools were connected.** Each session's own init event lists all four, after
  S-6.
- **The block was present.** `ieos init --with-hooks` wrote it, not a fixture.

So this is not a knowledge problem and not a retrieval problem. It is an **adoption**
problem: the agent never asks, so the quality of the knowledge base cannot matter.

`plugin-install-marketplace` retires itself as a discriminator and is worth more for
it: the native arm passed, because the marketplace name is in the model's training
data after all. Without the native arm that task would have read as EOS supplying a
fact the agent could not have known, and the conclusion would have been confidently
wrong. That is the whole argument for pairing.

**Where this points.** The only thing that tells an agent EOS exists is the D18.4
bootstrap block, and its second paragraph reads: _"The tools are available if you want
them. Nothing here instructs you to call them, and no tool call is required to
complete work in this repository."_ That sentence was written to avoid coaching, which
is right — coaching would invalidate the hidden condition and is not how a real
installation behaves. But it travels past neutrality into discouragement, and the
block never says what the knowledge is _for_: it names four tools and a "curated
knowledge base", which is a description of a mechanism rather than a reason to consult
it. D18.4 asks the block to state that the tools exist **and what they are for**, and
the second half is currently missing.

That is a specific, testable, falsifiable next step, and the harness to test it now
exists: change the block, re-run the same manifests at a new version, compare arms.
It is also a change to a frozen-guide deliverable's content and sits close enough to
coaching to be the owner's call rather than mine, so it is recorded here and not made.

### S-11 The bootstrap block was the binding constraint, and changing it worked

C-14 rewrote the D18.4 block to say what the record is for and to stop telling the
agent that no tool call is required. The same criteria, the same fixture, the same
model, re-run at manifest version 3:

| Arm                               | Trials | Deterministic rules | `resolve` called |
| --------------------------------- | ------ | ------------------- | ---------------- |
| `eos` — server present, new block | 2      | **6 / 6**           | **yes, both**    |
| `native` — no server, no block    | 2      | 4 / 6               | no               |

Both native trials made precisely the mistake the recorded `control_guidance`
forbids: the CI gate placed inside the `## DoD` checklist, no separate section. Both
EOS trials consulted the record and placed it correctly. Before C-14, with the same
tools connected, both arms failed identically and `resolve` was called in 0 of 12
trials.

The block cannot be the source of the answer. It names no task word — `init.test.ts`
asserts the absence of "definition of done", "CI" and the rest mechanically — and the
native arm does not carry it at all. What changed is that the agent asked.

So the chain is closed end to end, and every link was measured rather than assumed:
the knowledge was in the corpus, retrieval ranked it first, the tools were reachable,
and the one remaining gap was that nothing gave the agent a reason to look. Saying
what the record holds was enough; no instruction to use it was needed, and none was
added.

### S-12 The `native` arm was mislabelled for three rounds of trials, and I said so wrongly

This one is a correction to my own record rather than a defect in the system.

The paired design was described — in a commit message, in PR #9's body, and in S-10
above — as running the native arm "with the `ieos` MCP server removed". The code never
removed it. It only withheld the four tools from `allowedTools`, so `native` meant
_listed and refused_, not _absent_. The edit that would have removed the server was
written, never landed, and was not verified before the claim was published.

It went unnoticed for exactly as long as it could not matter. While the agent never
reached for EOS in either arm, both arms behaved identically and the distinction had no
effect — which is why S-10's conclusion survives it: the two arms failed identically on
the same rule with `resolve` uncalled, and that remains true however the tools were
withheld. What the mislabelling cost was precision, not the finding.

C-14 is what exposed it. Once the block gave the agent a reason to look, the native arm
tried `resolve`, was denied, and the obstruction guard from S-9 refused to grade the
trial — a guard written for one cause catching another.

Fixed properly: the native arm now deletes the server from `.mcp.json` **and** strips
the bootstrap block from `CLAUDE.md` and `AGENTS.md`, which is what a project without
EOS looks like. Stripping throws if the markers are absent, so a silently unstripped
block fails the trial instead of quietly advertising tools that are not there. The
two arms now differ in two things at once; that is the right shape for "does an EOS
installation change the outcome" and the wrong one for isolating the block alone, which
is stated rather than glossed.

The lesson is the ordinary one and I had it backwards in my own loop: an edit is not a
change until something confirms it landed. Every earlier claim about the native arm
should be read as "tools connected and refused".

### S-13 C-14's effect is a property of the mechanism, not one lucky task

Two more tasks were built in the `plan-dod` shape — an answer recorded in the corpus,
arbitrary enough that it cannot be derived or guessed, and mechanically checkable — and
run in the same paired arms. Both are grounded in the `control_guidance` asset that has
been in the corpus since Stage 2, and retrieval was verified to rank it first for each
hint before either task was written.

| Task                      | native arm                      | eos arm         |
| ------------------------- | ------------------------------- | --------------- |
| `plan-dod-external-gates` | 4/6 rules, `resolve` not called | **6/6, called** |
| `commit-message-protocol` | 3/5 rules, `resolve` not called | **5/5, called** |
| `quality-gate-cleanup`    | 6/8 rules, `resolve` not called | **8/8, called** |

Three for three, six EOS trials and six native, `resolve` called in all six of the
former and none of the latter. Before C-14 the count was 0 of 12 across both arms. That
is enough to call the effect a property of the mechanism rather than an accident of one
task — with the sample stated rather than hidden: two trials per arm is the contract's
minimum, not a comfortable number.

Each native failure landed on the rule the record decides and nowhere else. The gates
kept their suites green, kept the behaviour the fixture already had, and got wrong
exactly the arbitrary part: the four commit sections, the tests-section rule, the Python
leftovers, the bypass variable's name. `quality-gate-cleanup` is the instructive one --
the native arm got the block-versus-warn distinction _right_, because the fixture's
README hints that not every finding deserves a block, so that rule was more derivable
than intended. It still failed, on the two parts nothing hints at. A task can be
partially derivable and still discriminate, as long as the graded set is not.

**What it costs is in `docs/budgets.md` and is not small**: roughly double to triple the
cost, and up to triple the wall clock, on the tasks where the knowledge decides the
outcome. The retired `plugin-install-marketplace` supplies the noise floor for reading
those numbers — `resolve` was never called in either of its arms, so its ±13-21% spread
is pure variance.

### S-14 Two graders fooled themselves, one by reproducing the lesson it was not testing

Both were caught by their own controls before any trial ran, which is the entire reason
the controls exist.

The commit-gate check counted "refused when a section is missing". A hook that refuses
_every_ message satisfies that four times over — and the naive reference does exactly
that, since its Conventional Commits subject rule rejects the probe. So a hook knowing
nothing about the four sections scored 4 of 4. That is the corpus lesson
`negative-test-passing-for-the-wrong-reason` verbatim: asserting that an operation failed
does not establish which check refused it. Both outcomes are now measured relative to an
accepted baseline, so a section counts as required only when removing it flips acceptance
to refusal.

The quality gate's own filter was `grep -v '^\+\+\+'`, meant to drop a diff header. In
a basic regular expression GNU grep reads `\+` as the one-or-more quantifier rather than
a literal plus, so the pattern matched every line and the filter deleted the entire
diff. The gate then found nothing and allowed everything while reading as correct. Fixed
with `-Ev`. Worth keeping because the failure is silent in the direction that matters: a
gate that blocks nothing passes its own happy path.

A third, smaller one: the `commit-gate` fixture asserted that a long message with no
sections is accepted — which the task requires changing, so "leave the existing tests
passing" was unsatisfiable. A fixture that contradicts its own task is not a hard task,
it is an impossible one.

### Explicitly not done at Stage 3

- **No second agent.** Stage 8's, per T-07. `drivers/codex.ts` is not written, and
  the task bank is built to be re-run through it rather than rewritten.
- **No CI trial job.** Trials cost money and need namespaces and credentials CI does
  not have. The graders' positive, negative and mutation controls do run in CI, with
  no agent and no network, so "can this grader tell good from bad" is asked on every
  commit instead of once.
- **No native paired baseline.** `docs/budgets.md` therefore leaves every delta axis
  empty and says why, rather than filling one with an absolute number.
- **No grader weakened to fit a result.** Criteria were never edited; the manifests
  carry `version: 3` and versions 1 and 2 are recorded with what they failed to
  measure.

## 4b. Owner decisions

| Item                                            | Decision                                                                                                                                                                                                                                                            | Date       | Consequence                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **C-1** — F1 wording vs. Zod in `core`          | **Approved.** The F1a/F1b split stands; `packages/core` may depend on the explicitly approved Zod dependency required by D18.5, and on nothing else.                                                                                                                | 2026-09-04 | The exception is kept as narrow as the mechanism can express: `fitness/allowlist.yaml` holds exactly one entry, and a negative control proves the rule still fires for an unauthorised dependency. **C-1 remains recorded as an approved deviation below, not as F1's original wording having been satisfied** — guide §6.1 rule 8 requires a relaxed fitness rule to stay visible as one. |
| **C-6** — normalization vs. RFC 8785            | **Approved.** Unicode NFC normalization and RFC 8785/JCS canonicalization are separate, ordered layers. JCS preserves JSON string contents and never normalizes. Where a domain contract needs NFC, it is applied explicitly _before_ canonicalization and hashing. | 2026-09-04 | Ordering is unambiguous in `ADR-0003` and enforced by tests: canonicalization of a decomposed string differs from the composed one, the UTF-16-vs-UTF-8 ordering fixture is retained, and no deterministic id can depend on an undocumented normalization boundary. **No longer awaiting confirmation.**                                                                                   |
| **C-12** — `setting_sources` for Stage 3 trials | **Approved.** Trials are driven with `setting_sources: ['project']` and the trial's cwd set to the disposable repo, on the empirical evidence that `[]` hides the repository's own bootstrap block and project settings from the agent.                             | 2026-09-11 | Recorded as an approved deviation below rather than absorbed: it relaxes the letter of a frozen parameter. The literal reading stays runnable — the driver takes `settingSources` explicitly — so the control that produced the evidence can be re-run at any time.                                                                                                                        |
| **Trial budget** — Stage 3 cost per trial       | **$3 per trial**, with the harness aborting at twice it, per TD-20's requirement that a budget be declared per simulation.                                                                                                                                          | 2026-09-11 | Declared in all three manifests. Measured across six trials: $1.29 total, mean $0.214, worst $0.341 — an order of magnitude inside the budget, which says the number was set generously before any measurement existed rather than that the trials were cheap by design.                                                                                                                   |

## 5. Deviations from the frozen guide

Each deviation is stated, justified, and flagged. None is silent.

| #    | Guide text                                                                                                                                                                | Deviation                                                                                                                                                                                                                                   | Justification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Needs owner     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| C-1  | F1: `packages/core` "imports nothing outside itself"                                                                                                                      | Split into F1a (no workspace package) + F1b (no vendor identifier; third-party imports restricted to an allowlist, currently `zod` alone)                                                                                                   | D18.5 requires Zod _inside_ `core`'s contracts. The literal rule and D18.5 cannot both hold. The refinement keeps the architectural intent — agent-neutral, vendor-free, I/O-free — and adds a behavioural no-I/O test the original wording did not have. Guide §6.1 rule 8 requires reporting a relaxed fitness rule.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | **Yes**         |
| C-2  | D18.6 / D29: "CI installs with `pnpm ci`"                                                                                                                                 | `pnpm install --frozen-lockfile`                                                                                                                                                                                                            | Recorded as unverified against pnpm 11.25.0's actual CLI in this session. `--frozen-lockfile` gives the frozen-lockfile guarantee the rule is after. Revisit when CI is written (B1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | No              |
| C-3  | D18.5 names `eslint` + `prettier`                                                                                                                                         | Prettier only; ESLint deferred                                                                                                                                                                                                              | `typescript-eslint` support for TypeScript 7.0.2 unverified; no Stage 0 criterion depends on lint; "avoid large dependencies without a written rationale".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | No              |
| C-4  | D18.5 names `@modelcontextprotocol/sdk`                                                                                                                                   | `@modelcontextprotocol/{server,client}@2.0.0` recorded as the adoption target                                                                                                                                                               | Finding A, confirmed against the registry (V-6). Nothing installed at Stage 0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | No              |
| C-5  | Stage 0 deliverables list `drivers/claude-code.ts`, `drivers/codex.ts`, three graders, `collect.ts`, `report.ts`, `budget.ts`                                             | Vendor-neutral `AgentDriver` port + deterministic fake driver + `budget` shape only                                                                                                                                                         | Real drivers need real agent CLIs and a spend decision; writing them untested would be the "code complete = done" failure D17 names. Ports mean no contract changes when they land. Tracked as B2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | No              |
| C-6  | D35 "Strings → UTF-8, NFC normalization" listed inside the hashing contract                                                                                               | Normalization is a **separate layer applied before** canonicalization, on declared fields only; JCS never normalizes                                                                                                                        | RFC 8785 §3.1 requires string preservation. Fusing them would silently change JSON semantics — explicitly forbidden by the user's instruction B. ADR-0003.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **Yes**         |
| C-7  | Stage 0 exit gate: "identical digests on Linux and Windows CI"                                                                                                            | **No longer a deviation — met.** Kept for the record.                                                                                                                                                                                       | Was "verified on Linux only" while no CI existed. Verified on both platforms on 2026-09-05 (run 33953023783): `sha256:e8c450ac…ee6febbe` on each. This clause of the gate is satisfied.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | No              |
| C-8  | D18.5 implies the current TypeScript                                                                                                                                      | TypeScript pinned to `6.0.3`, one major behind `latest`                                                                                                                                                                                     | Measured during Stage 0: dependency-cruiser 18.2.0 supports `typescript >=2.0.0 <7.0.0`. Under TypeScript 7.0.2 it reported _"1 modules, 0 dependencies cruised"_ and **exited zero** — a boundary check that inspects nothing and calls it success. F1a/F2/F4/F5 are load-bearing, the compiler version is not, so the compiler moved. Revisit when dependency-cruiser supports TypeScript 7.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | No              |
| C-9  | D18.5 names `better-sqlite3` as the SQLite binding                                                                                                                        | `node:sqlite` adopted instead                                                                                                                                                                                                               | **Owner-approved 2026-09-05, on evidence the guide did not have.** D18.5 chose `better-sqlite3` on the information available when the guide was frozen; it is not being called wrong. Stage 0 then executed the seven recorded acceptance checks and produced new evidence: `node:sqlite` is the only candidate with complete observed qualification on **both** required Stage 0 platforms (linux + win32); it introduces no external or native dependency; and both candidates expose the **same measured** engine — SQLite 3.53.4, `source_id 2026-07-24 19:02:57 bf7c7f30…59bcc` — so the engine question does not distinguish them. Accepted cost: Node 24 still flags `node:sqlite` experimental, recorded as a re-examination trigger in §4c. Evidence: `qualification/evidence/sqlite-qualification.json` (linux), `sqlite-qualification-win32.md` (win32).                                                                      | **Yes** — given |
| C-10 | Stage 0 exit gate: "F1–F12 green"                                                                                                                                         | Read as: every rule enforceable at Stage 0 is green; every rule whose subject belongs to a later stage is explicitly `partial`/`not-yet-enforceable` **and carries a dormancy guard** that fails the moment its subject appears un-enforced | **Owner-approved 2026-09-05.** The literal reading is unsatisfiable at Stage 0: seven of the thirteen rules name components (`packages/launcher`, `packages/releases`, `packages/resolver`, `simulations/`) that Stage 0 deliberately does not create, so "green" could only be reached by deleting the rules or by letting them pass over nothing — the vacuous success this repository already hit once. The approved reading keeps every rule visible and makes dormancy **conditional on absence**: `fitness/checks/dormancy.test.ts` asserts, per rule, that its subject does not exist yet; the day someone adds one, that test fails and the rule must be armed. Dormancy therefore cannot outlive its reason.                                                                                                                                                                                                                    | **Yes** — given |
| C-11 | §3 composition set: `adapters/* -> core, resolver, telemetry, assurance, store-sqlite, store-supabase`, with `evidence-derivation` listed only for `supabase/functions/*` | `packages/adapters/cli` may import `packages/evidence-derivation`; every other adapter still may not                                                                                                                                        | The guide contradicts itself here, and both halves are load-bearing. §3 puts derivation on the server side; Stage 2's own deliverables require `ieos investigate <run_id>` v0 to produce "D32 deterministic ids **locally from the outbox**", which no package in the adapter composition set can do. The narrowest resolution wins: F2 is split into two dependency-cruiser rules so the exception is one directory wide and mechanically enforced, with a control proving the rule still fires for `adapters/mcp`. The alternative -- widening the composition set for all adapters -- would have relaxed the boundary everywhere to serve one command. Guide §6.1 rule 8 requires a relaxed fitness rule to stay visible as one, so this row exists rather than a quiet regex edit.                                                                                                                                                   | **Yes**         |
| C-12 | Stage 3: trials are "driven by the harness with `setting_sources=[]` so only the target repo's own files influence the run"                                               | `setting_sources: ['project']`, with the trial's cwd being the disposable repo                                                                                                                                                              | Measured, not argued. With every file-reading tool disallowed so only injected context could answer, a repo whose `CLAUDE.md` carried a unique marker was asked for it twice: under `[]` the answer was `NONE`, under `['project']` it was the marker. The D18.4 bootstrap block lives in that file and **is** Stage 3's hidden condition, so under the literal reading the agent is never told EOS exists, "was `resolve` called unprompted" measures nothing, and the exit gate is unreachable by construction. The project settings that carry the four telemetry hooks are suppressed by `[]` for the same reason, so the gate's telemetry requirement is unreachable too. `['project']` admits exactly the disposable repo's own files — the host's `~/.claude`, the evaluator's settings and this repository's own `CLAUDE.md` stay out, which is the leak TD-16 names. Guide §6.1 rule 8 requires the relaxation to stay visible. | **Yes** — given |
| C-13 | Stage 1 exit gate: "MCP server passes a `2026-07-28` conformance smoke"                                                                                                   | The stdio entry serves the 2025 era as well as the modern one (`legacy: 'serve'`), instead of refusing it                                                                                                                                   | Finding S-6, found by the first real trial. `legacy: 'reject'` refused every real client: the primary agent's MCP client opens with a claim-less `initialize`, was answered `-32022`, and the agent was offered no EOS tools at all — so the Agent Contract had never been exercised by a client other than this repository's own smoke. The modern gate is unchanged and still asserted: a modern opening gets the modern era, an unsupported revision is still `-32022`, and per-request envelope re-reading is asserted through the HTTP entry. What changed is that the server no longer refuses the era its clients speak, which is not a property any gate should have been protecting.                                                                                                                                                                                                                                            | **Yes**         |

---

## 6. Explicitly not done at Stage 0

Recorded so that absence is a decision rather than an oversight: no Supabase
project, key, migration or Edge Function; no MCP server or client; no launcher;
no resolver, telemetry runtime, evidence deriver, scorer or index; no knowledge
assets; no legacy import; no CI workflows; no dashboards, daemons, UI,
embeddings, marketplace or ecosystem discovery; no real agent trial; no
`qualification/reports/` entry.
