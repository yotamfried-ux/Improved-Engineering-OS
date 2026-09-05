# Stage 0 implementation plan — minimal contracts and harness foundation

| Field               | Value                                                                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | Active. Stage 0 is in progress; **no Stage 0 gate has passed**.                                                                                                               |
| Written             | 2026-09-04                                                                                                                                                                    |
| Authority           | `docs/source/Improved-Engineering-OS_Architecture_Report.pdf` (constitution) > `docs/source/Improved-Engineering-OS-Build-Guide-FROZEN-v1.4.1.md` (frozen guide) > this plan. |
| Supporting evidence | `docs/research/2026-09-04-research-inventory.md`. Evidence only; it does not close a decision.                                                                                |
| Scope               | Stage 0 only. Stages 1+ are out of scope and must not be started here.                                                                                                        |

This plan answers seven questions before implementation, then fixes the Stage 0
acceptance criteria. Decisions are recorded in
[`docs/decisions/DECISION-LOG.md`](../decisions/DECISION-LOG.md); architectural
ones additionally in `docs/adr/`.

---

## 1. What is the smallest viable repository structure?

The frozen guide fixes the _target_ monorepo layout (guide §3). Stage 0 creates
only the subset that Stage 0 deliverables actually need. Directories are created
when the first file that belongs in them is written, never speculatively.

```text
Improved-Engineering-OS/
  package.json                  # workspace root, toolchain pins, scripts
  pnpm-workspace.yaml           # packages/*, tools/*
  pnpm-lock.yaml                # committed, frozen in CI
  tsconfig.base.json            # strict TypeScript, shared by every package
  vitest.config.ts              # single deterministic test project set
  .gitattributes .editorconfig .gitignore
  SECURITY.md
  contracts/
    capabilities.yaml           # D28 — seeded at Stage 2, structurally valid now
    telemetry-attributes.yaml   # D26 — initial allowlist
    schemas/*.schema.json       # emitted from packages/core, committed
  docs/
    plan/ decisions/ adr/ setup.md architecture.md budgets.md
  packages/
    core/                       # contracts, hashing, ids, ports. No I/O, no vendor.
  tools/
    harness/                    # isolation contract + sandbox + fake driver
    contracts-gen/              # emits contracts/schemas from core (keeps core I/O-free)
  fitness/                      # F1–F12: dependency-cruiser config + executable checks
```

**Not created at Stage 0**, because nothing in Stage 0 needs them and creating
them empty would assert progress that does not exist: `packages/resolver`,
`packages/telemetry`, `packages/evidence-derivation`, `packages/assurance`,
`packages/releases`, `packages/store-sqlite`, `packages/store-supabase`,
`packages/curator`, `packages/adapters/*`, `packages/launcher`, `knowledge/`,
`supabase/`, `simulations/`, `evaluator/`, `qualification/`, `tools/import-legacy/`,
`.github/workflows/`.

Two of these are deliberate deferrals inside Stage 0's own deliverable list and
are recorded as remaining acceptance criteria in §7: the CI workflows, and the
real agent drivers under `tools/harness/drivers/`.

**Why one package (`core`) and not several.** Stage 0's architectural job is to
establish the _agent-neutral centre_ and the boundary rules around it. A second
package at Stage 0 would only exist to be pointed at by a dependency rule.
`tools/harness` and `tools/contracts-gen` are separate workspace packages because
they are genuinely on the other side of a boundary from `core`: they perform I/O,
and `core` must be provably free of it. That gives the boundary rules something
real to enforce from day one.

---

## 2. Which exact versions will be used?

Every version below is pinned exactly (no ranges) and recorded with its licence
and the problem it solves in `docs/decisions/DECISION-LOG.md` §3.

| Role                                        | Choice             | Exact version                                            | Licence    |
| ------------------------------------------- | ------------------ | -------------------------------------------------------- | ---------- |
| Runtime                                     | Node.js            | `24.20.0` (`engines.node: "24.x"`)                       | MIT        |
| Package manager                             | pnpm               | `11.25.0` (`packageManager` + `devEngines`)              | MIT        |
| Language                                    | TypeScript         | `6.0.3` (**not** `7.0.2`, see below)                     | Apache-2.0 |
| Node type definitions                       | `@types/node`      | `24.13.3` (tracks the Node 24 runtime, **not** `latest`) | MIT        |
| Test runner                                 | Vitest             | `5.0.0`                                                  | MIT        |
| Property testing                            | fast-check         | `4.9.0`                                                  | MIT        |
| Schema library                              | Zod                | `4.5.4`                                                  | MIT        |
| YAML parsing (contract files, tooling only) | `yaml`             | `2.9.0`                                                  | ISC        |
| Architecture boundaries                     | dependency-cruiser | `18.2.0`                                                 | MIT        |
| Formatting                                  | Prettier           | `3.9.6`                                                  | MIT        |

**TypeScript is pinned to 6.0.3, not to `latest`.** Measured, not assumed:
dependency-cruiser 18.2.0 declares support for `typescript >=2.0.0 <7.0.0`, and
under TypeScript 7.0.2 it degraded to _"1 modules, 0 dependencies cruised"_ while
still exiting zero. A boundary check that inspects nothing and reports success is
worse than no boundary check, so the compiler is pinned to the newest stable
major the checker can actually parse. `fitness/checks/dependency-graph.test.ts`
asserts the analysis is non-empty, so this cannot regress silently. Recorded in
`ADR-0002` and `DECISION-LOG.md` §5 C-8.

**Canonicalization library: none.** RFC 8785 (JCS) is implemented inside
`packages/core/src/hashing.ts` rather than taken as a dependency. Rationale in
`ADR-0003`: D35 requires exactly one canonical-hashing implementation and F12
forbids a second one; F1 constrains what `core` may import; and the algorithm is
small, fully specified, and testable against the official conformance vectors.
The vectors themselves _are_ reused, as data, from
`cyberphone/json-canonicalization` (Apache-2.0) with attribution — see
`packages/core/test/fixtures/jcs/NOTICE`.

**ULID and base32: implemented in core, not taken as dependencies.** D19 needs
Crockford base32 (ULID) and D35 needs RFC 4648 base32 (deterministic ids). These
are different alphabets; both are a few dozen lines; and implementing them lets
`Clock` and randomness be injected so identifier minting is deterministic under
test. Recorded in `ADR-0003`.

**MCP packages: recorded, not installed.** Finding A confirmed empirically on
2026-09-04 against the npm registry:

| Package                        | Version  | Registry-declared licence | Status                                                    |
| ------------------------------ | -------- | ------------------------- | --------------------------------------------------------- |
| `@modelcontextprotocol/server` | `2.0.0`  | MIT                       | **the v2 server package to adopt at Stage 1**             |
| `@modelcontextprotocol/client` | `2.0.0`  | MIT                       | v2 client package, conformance testing                    |
| `@modelcontextprotocol/sdk`    | `1.30.0` | MIT                       | the _legacy v1 name_ the guide's D18.5 cites; not adopted |

The guide's `@modelcontextprotocol/sdk` coordinate is stale. No MCP package is
installed at Stage 0 because Stage 0 builds no MCP adapter; installing one would
be Stage 1 work. The upstream repository carries a licence-transition notice
(new code Apache-2.0, existing code MIT), so the registry field alone is not the
whole answer: the `LICENSE` and any `NOTICE` file of the exact adopted version
must be read and recorded at Stage 1 before the dependency is added. Adapter
boundary: MCP types may appear only under `packages/adapters/mcp`; `core` never
references them (F1, F2).

**SQLite: recorded, not adopted.** Finding C. Verified on 2026-09-04 in this
environment: **Node 24.20.0 bundles SQLite 3.53.4 with FTS5 compiled in.** That is
above 3.51.3, so it contains the fix for the WAL concurrent-write/checkpoint
corruption defect named in research finding R3. `better-sqlite3@13.0.3` (MIT) is
the guide's D18.5 choice; its _bundled_ SQLite version is not stated in package
metadata and was **not** verified. No SQLite binding is selected at Stage 0. The
selection is Stage 1/2 work and is gated on an executable check, not on a package
version — see §7 and `DECISION-LOG.md` §4.

---

## 3. Which decisions are fixed by the source documents, and which remain open?

### Fixed — implemented as written

D1–D17 (architecture constitution, accepted by reference in `ADR-0001`);
D18.1/D18.3/D18.6 toolchain and platform rules; D18.5's choice of Zod 4, Vitest
and dependency-cruiser; D19 identity and canonical lifecycle; D24's bootstrap
`UNPROVEN` snapshot shape; D25's four-tool contract and `context_snapshot_id`
derivation; D26's envelope fields; D32's deterministic `evidence_id` and
`integrity` grading; D34/P-01/C-01's nullable `champion_id` with split
`canonical_state`/`challenge_state`; D35's hashing contract; D36's run
classification authority. The five boundaries in the constitution (Canonical Git,
Target Project Git, Local Runtime, Evidence Plane, External World) and the State
Ownership Matrix are treated as invariants that the contracts must not be able to
express a violation of.

### Fixed by the documents but deliberately _not built_ at Stage 0

The launcher (D18.2, Stage 4), Supabase provisioning and the Evidence Plane
(D22/D30/D31, Stage 2+), the resolver, telemetry runtime, evidence derivation,
scoring, and the knowledge corpus. Stage 0 defines their **contracts and ports**
so no migration is needed later, and builds none of their runtime.

### Open — decided provisionally at Stage 0, flagged for the owner

| #                   | Open item                                                                                                                                                                                                                | Provisional treatment                                                                                                                                                                                                                           | Why it is not mine to close                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~O-1~~             | **CLOSED — owner approved 2026-09-04.** F1a/F1b stands; `core` may import the approved Zod dependency and nothing else. It remains recorded as **approved deviation C-1**, not as F1's original wording being satisfied. | See `ADR-0004`, `DECISION-LOG.md` §5 C-1.                                                                                                                                                                                                       | Closed.                                                                                                                                                     |
| ~~O-2~~             | **CLOSED — owner approved 2026-09-04.** Normalization and RFC 8785 canonicalization are separate ordered layers; JCS never normalizes. Recorded as **approved deviation C-6**.                                           | See `ADR-0003`, `DECISION-LOG.md` §5 C-6.                                                                                                                                                                                                       | Closed.                                                                                                                                                     |
| O-1&nbsp;(historic) | **F1 wording vs. Zod in `core`.** F1 says `core` "imports nothing outside itself"; D18.5 requires Zod 4 _inside_ `core`'s contracts. As literally written the two cannot both hold.                                      | F1 is implemented as two enforceable clauses — F1a: `core` imports no other workspace package; F1b: `core` contains no vendor/agent identifier and may import only third-party packages named in `fitness/allowlist.yaml` (today: `zod` alone). | This relaxes the text of a frozen fitness rule. Guide §6.1 rule 8 says stop and report when a fitness rule must be relaxed. Reported; not silently changed. |
| O-2&nbsp;(historic) | **NFC normalization vs. RFC 8785.** D35 lists "Strings → UTF-8, NFC normalization" alongside JCS; RFC 8785 §3.1 requires strings to be _preserved_ during canonicalization.                                              | Two separate layers, never fused (`ADR-0003`): project normalization runs _before_ canonicalization and only on explicitly declared identifier-like fields; JCS itself never normalizes.                                                        | Chooses one reading of an ambiguous frozen sentence. The reading is argued and tested, not assumed.                                                         |
| O-3                 | **Which agent is the "primary agent"** for the Stage 3 slice.                                                                                                                                                            | Not chosen. `tools/harness` defines a vendor-neutral `AgentDriver` port so the choice is a Stage 2/3 decision with no contract consequence.                                                                                                     | Owner/stage decision; no evidence exists yet.                                                                                                               |
| O-4                 | **SQLite binding** (`node:sqlite` vs `better-sqlite3`).                                                                                                                                                                  | Not chosen. Decision criteria and the executable check are written down now.                                                                                                                                                                    | Requires Windows and Node-24 verification that Stage 0 does not perform.                                                                                    |
| O-5                 | **Capability taxonomy seed (D28).** The guide seeds `contracts/capabilities.yaml` from the legacy repository's `core/capability-registry.yaml`, which is not reachable from this session.                                | The file exists with a valid schema and an explicitly empty, provenance-marked seed. No capability ids are invented.                                                                                                                            | Inventing a taxonomy would create exactly the unprovenanced canonical knowledge the constitution forbids.                                                   |
| O-6                 | Every numeric parameter in guide §7 (score weights, promotion margins, trial budgets, latency budgets, retention).                                                                                                       | Left open. `docs/budgets.md` records the measurement method with empty values.                                                                                                                                                                  | The guide keeps them open by design until real data exists.                                                                                                 |

---

## 4. How will deterministic behaviour be tested?

Determinism is the property Stage 0 exists to establish, so it is tested
directly, not inferred from passing unit tests.

1. **Conformance against an external oracle.** The JCS implementation is run
   against the official `cyberphone/json-canonicalization` test vectors
   (`input/*.json` → `output/*.json`), vendored with licence and attribution.
   These cover number serialisation, key ordering, Unicode escaping and
   structural nesting, and were produced independently of this codebase.
2. **Idempotence and stability properties** (fast-check). For arbitrary
   JSON-compatible values: `jcs(parse(jcs(v))) === jcs(v)`; the digest of a value
   is invariant under key insertion order; and canonical output is always valid
   UTF-8 JSON.
3. **Explicit fixture pinning.** Every deterministic identifier the contracts
   define (`content_hash`, `evidence_id`, `context_snapshot_id`,
   `effective_score_view_id`, `index_digest`, manifest digests, the `UNPROVEN`
   score snapshot) has a test asserting an **exact literal digest**. A change in
   any of these is then a visible, reviewable diff rather than a silent
   re-derivation. This is what makes the D35 cross-platform gate meaningful.
4. **The specific cases required by finding B**, each with its own test:
   composed vs. decomposed Unicode; object-key ordering; non-BMP characters;
   invalid values (`NaN`, `Infinity`, `-0`, `undefined`, functions, `BigInt`,
   cycles, lone surrogates); collisions produced _by_ normalization; and
   deterministic manifest ordering. Crucially, a fixture where **UTF-16 key
   ordering and UTF-8 path ordering disagree** (`U+FFFF` vs `U+10000`) proves the
   two ordering rules are genuinely separate implementations and not one rule
   used twice.
5. **Injected nondeterminism.** `Clock` and the random source are ports. Tests
   supply fixed implementations; anything that would reach for `Date.now()` or
   `crypto.getRandomValues()` inside `core` is a boundary violation caught by
   F1/F12-adjacent checks.
6. **Regeneration is a test.** `contracts/schemas/*.schema.json` is committed;
   CI regenerates and fails on any diff. Emission is byte-stable (sorted keys,
   LF, trailing newline).
7. **Negative tests are mandatory, not optional.** Each contract has, at minimum,
   a valid case, an invalid case that must be rejected _with a locatable reason_,
   and — where the contract declares tolerance — an unknown-enum case that must
   be tolerated. Cross-field invariants (`champion_id` non-null exactly when
   `canonical_state === "pinned"`; `holdout_state` only with
   `origin_class: "holdout"`; `origin_class` absent from the telemetry envelope)
   are tested from the _rejecting_ side.

---

## 5. How will module boundaries be enforced?

Three mechanisms, because each alone is insufficient — the research inventory's
note that "a dependency graph cannot prove runtime never writes knowledge" is
taken literally.

1. **Static import graph** — `dependency-cruiser@18.2.0` over TypeScript sources,
   encoding the guide §3 dependency direction as forbidden-rule sets. Catches
   F1a, F2, F4, F5.
2. **Source-text invariants** — executable checks that scan scoped path sets for
   forbidden identifiers, with an explicit `fitness/allowlist.yaml` and
   `fitness/exclusions.yaml`. Catches F1b, F6, F9, F12.
3. **Behavioural tests** — assertions about what code _does_, not what it
   imports. `core` is exercised with a poisoned module environment in which
   `node:fs`, `node:child_process` and `node:net` throw on use, proving `core`
   performs no I/O rather than merely not importing an I/O module by a known
   name. This is the mechanism that will later carry F3 and F11.

**Honest status reporting is part of the mechanism.** Each rule F1–F12 has a
declared status of `enforced`, `partial` or `not-yet-enforceable`, and a test
asserts that the declared statuses match reality. A rule whose subject does not
exist yet (F7 needs release resolution; F11 needs a resolver) is
`not-yet-enforceable` and **may not be reported as green**. Claiming twelve green
rules when four have no subject is precisely the false-completeness the
constitution forbids.

---

## 6. How will later agent evaluation isolation be proven rather than assumed?

Finding E and research finding R5 are accepted in full: a temporary directory is
not isolation, and neither is `setting_sources=[]`.

Stage 0 therefore does **not** claim isolation. It builds the apparatus that
makes isolation falsifiable later:

- **`IsolationPolicy`** — a declared, serialisable statement of the four
  boundaries a trial requires: filesystem (allowed roots, denied roots),
  process (permitted spawns), environment (explicit allowlist; **deny by
  default**, never inherit), and network (deny / allowlist / unrestricted).
- **`IsolationReport`** — the result of _probing_ a prepared sandbox. Every
  boundary carries a tri-state `proven | violated | unproven` plus the evidence
  for that verdict. There is no boolean `isolated: true`, deliberately: the type
  system makes "we did not check" unrepresentable as "we checked and it passed".
- **`AgentDriver`** — a vendor-neutral port. No Claude- or Codex-specific code
  exists at Stage 0; a deterministic `FakeAgentDriver` exercises the harness.
- **Stage 0 proves what it can prove today**, with real tests: the sandbox
  inherits no environment variable not explicitly granted; two trials cannot see
  each other's state; the `evaluator/` path is unreachable from a trial root; a
  trial referencing an unregistered run is rejected; and a boundary the harness
  has not probed reports `unproven` and makes the trial ineligible for
  qualification.
- **Stage 0 records what it cannot prove today.** Network egress and process
  containment cannot be enforced by a fresh directory. `IsolationPolicy` declares
  them; `probe()` reports them `unproven`; and `qualificationEligible` is false
  whenever any required boundary is `unproven`. The enforcement mechanism
  (container, namespace or equivalent) is a Stage 3 precondition, tracked in
  `ADR-0005`, not a Stage 0 claim.

The design rule: **an unproven boundary must be louder than a violated one is
quiet.** Silence never counts as isolation.

---

## 7. Exact Stage 0 acceptance criteria

Stage 0 is complete only when **all** of the following pass. Anything not on this
list is out of scope; anything on it that has not passed is stated as not passed.

### A. Met by this change (each verified by an executable check)

| #   | Criterion                                                                                                                                                            | Verified by                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A1  | `pnpm install --frozen-lockfile` succeeds from a clean checkout on Node 24.20.0 / pnpm 11.25.0; `pnpm-lock.yaml` is committed.                                       | `pnpm install --frozen-lockfile`                                                                        |
| A2  | `ieos-doctor` fails with an actionable message when Node or pnpm is absent or mismatched (finding D).                                                                | `pnpm ieos-doctor` + `tools/harness/test/doctor.test.ts`                                                |
| A3  | Strict TypeScript passes with no errors and no `any` escape hatches in `packages/core`.                                                                              | `pnpm typecheck`                                                                                        |
| A4  | JCS implementation matches all official conformance vectors.                                                                                                         | `packages/core/test/jcs-conformance.test.ts`                                                            |
| A5  | The six finding-B canonicalization cases each have a passing test, including the UTF-16-vs-UTF-8 ordering-disagreement fixture.                                      | `packages/core/test/normalize.test.ts`, `hashing.test.ts`                                               |
| A6  | Normalization never alters JSON semantics: JCS is proven to preserve strings that project normalization would change.                                                | `packages/core/test/hashing.test.ts`                                                                    |
| A7  | Every contract has a valid case, a rejected-with-reason invalid case, and cross-field invariant tests.                                                               | `packages/core/test/contracts/*.test.ts`                                                                |
| A8  | A Solution Set with `champion_id: null` is unrepresentable as `pinned`, and vice versa.                                                                              | `packages/core/test/contracts/solution-set.test.ts`                                                     |
| A9  | `contracts/schemas/` regenerates with zero diff.                                                                                                                     | `pnpm contracts:check`                                                                                  |
| A10 | Deterministic ids and digests match pinned literal fixtures.                                                                                                         | `packages/core/test/ids.test.ts`                                                                        |
| A11 | `core` performs no I/O under a poisoned module environment.                                                                                                          | `packages/core/test/no-io.test.ts`                                                                      |
| A12 | F1–F12 statuses are declared, and the declared status matches the implemented reality.                                                                               | `fitness/checks/*.test.ts`                                                                              |
| A13 | Sandbox: no inherited environment, no cross-trial visibility, evaluator path unreachable, unregistered run rejected, unproven boundary ⇒ not qualification-eligible. | `tools/harness/test/*.test.ts`                                                                          |
| A14 | Every adopted dependency has a recorded version, licence, problem solved, and what was copied vs. studied.                                                           | `docs/decisions/DECISION-LOG.md` §3 + a test asserting the log covers every installed direct dependency |

### B. Reconciliation of the previously open criteria

Status vocabulary, used consistently here and in
`qualification/reports/stage-0-status.md`:

| Status    | Means                                                                            |
| --------- | -------------------------------------------------------------------------------- |
| `PASS`    | the implementation exists **and** the required evidence was actually observed    |
| `PARTIAL` | the implementation exists, but some required verification has not been performed |
| `BLOCKED` | an external dependency prevents completion                                       |
| `FAIL`    | verification ran and exposed an unresolved defect                                |

| #   | Criterion                                                | Status      | Evidence, and what is missing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | -------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Linux CI + Windows smoke; D35 cross-platform digest gate | **PARTIAL** | `.github/workflows/{ci,fitness}.yml` written; YAML parses; every referenced script exists and was executed locally; the vacuity guards were negative-controlled (they exit 1 on an unreachable floor). **First observed CI run, 2026-09-05 (PR #1, commit `368467b`): Linux and fitness passed; the Windows job failed at its first step.** The failure was in the toolchain doctor, not in the digest contract: the pnpm probe used `execFile('pnpm', …)`, which cannot resolve the `pnpm.CMD` shim on Windows, so the doctor reported pnpm missing on a runner that had just invoked it through pnpm. Fixed and re-run. The D35 cross-platform digest comparison is the last step of that job and **has still never executed**, so the Windows half of the gate remains **UNPROVEN** — not failed. |
| B2  | Agent-driver and grader surface                          | **PARTIAL** | Graders (`deterministic`, `trace`, `model` port), the grading hierarchy, grader-validity controls, budgets, artifact collection and trial reports are implemented and tested (65 harness tests). The vendor-neutral `AgentDriver` port and a deterministic fake exist. **No real agent trial has run**: `codex` is not installed, and a live agent trial is Stage 3 work, not Stage 0. Per T-07/Q-09 the second agent's adapter belongs to Stage 8 regardless. Live external qualification is **UNPROVEN**.                                                                                                                                                                                                                                                                                          |
| B3  | ADR coverage for D19–D36                                 | **PASS**    | `ADR-0006`–`ADR-0009` group D19–D36 into four architectural records; `ADR-0001`–`ADR-0005` unchanged. A test asserts every decision D19–D36 is covered by an ADR and that the ADR set, decision log and this plan do not contradict each other.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| B4  | Capability seed (D28)                                    | **PASS**    | Previously reported BLOCKED; **that was stale**. The legacy repository was reachable from this session. `contracts/capabilities.yaml` is seeded from `yotamfried-ux/Engineering-OS@4d51784` with a recorded source digest: 28 ids verbatim, 7 kinds, enforcement fields dropped and named. Regeneration reproduces the committed file byte for byte, verified against the real checkout.                                                                                                                                                                                                                                                                                                                                                                                                             |
| B5  | D32 replay test                                          | **PASS**    | `packages/core/src/replay.ts` implements the invariant D32 states — identical `evidence_id` **and** identical payload after stripping `derived_at`. Tested over a synthetic derivation with four negative controls, including a payload that drifts while its id does not (the failure an id-only comparison would miss). Supersession is validated too: a "supersession" over unchanged inputs is rejected as a replay.                                                                                                                                                                                                                                                                                                                                                                             |
| B6  | Deterministic `UNPROVEN` snapshot emission               | **PASS**    | `tools/snapshot-emit` emits the D24/Q-02 bootstrap snapshot and its D35 digest, pinned as the cross-platform fixture. The claim-status model (`proven \| failed \| unproven`) unifies the vocabularies already in use rather than adding a parallel one, and makes "proven on fewer platforms than required" unrepresentable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| B7  | SQLite binding qualification                             | **PARTIAL** | All seven recorded checks executed against **both** candidates on Linux; all seven pass for each. `better-sqlite3@13.0.3`'s engine was measured **through the binding** (3.53.4), never substituted from Node's. **No binding is selected**: check 3 names Linux _and_ Windows, win32 is unobserved, and `qualified` is computed conjunctively over required platforms, so it reads `false` for both. The first CI attempt did not reach the qualification suite on Windows (see B1), so win32 is still unobserved for this criterion too.                                                                                                                                                                                                                                                           |
| B8  | Owner confirmation of C-1 and C-6                        | **PASS**    | Both approved by the owner on 2026-09-04. C-1 remains recorded as an **approved deviation** from F1's original wording, not as that wording being met.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

**The single external blocker.** Every remaining gap is one observation:
**a GitHub Actions run on a Windows runner.** It is what B1 needs (the D35
cross-platform digest gate) and what B7 needs (check 3 on win32, plus a
`better-sqlite3` native build or prebuild on the Windows/Node 24 ABI). B2's
remaining gap is a Stage 3 activity by the guide's own sequencing, not a Stage 0
one.

### C. Measured result

Measured on Linux x64, Node 24.20.0, pnpm 11.25.0:

- **21 test files, 536 tests, all passing.** Two consecutive full runs produce
  identical results.
- `pnpm typecheck`, `pnpm contracts:check`, `pnpm format:check`,
  `pnpm capabilities:check` all clean; `pnpm install --frozen-lockfile` succeeds.
- Boundary analysis: **75 modules, 210 dependencies cruised**, 0 violations —
  asserted non-vacuous, because this analyzer has degraded silently before.
- Fitness: **6 enforced, 4 partial, 3 not yet enforceable** — not "all green".
- Windows: **one job has started and none has completed.** The 2026-09-05 run
  reached the toolchain doctor and stopped there on a defect in the doctor
  itself. No Windows runner has yet produced a result about canonicalization,
  hashing, or SQLite for this repository.

**No Stage 0 report in `qualification/reports/` claims a pass.**
`qualification/reports/stage-0-status.md` is a status record, not a
qualification report; per guide §4 a stage is closed only by a harness-generated
report, and the gate cannot be met while B1 and B7 remain PARTIAL.
