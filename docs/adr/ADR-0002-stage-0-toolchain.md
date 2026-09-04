# ADR-0002 — Stage 0 toolchain, runtime and dependency policy

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-04 |
| Stage | 0 |
| Implements | D18, D29 |
| Addresses | Research findings R1 (MCP package identity), R3 (WAL engine version), R4 (Node availability) |

## Context

TD-01 records that leaving the language, runtime, package layout and platforms
undecided means the first agent session decides them implicitly and every later
stage inherits the accident. D18 proposes the stack; D29 proposes the dependency
policy. Three research findings show that parts of D18 cannot be adopted verbatim:

- **R1**: D18.5 names `@modelcontextprotocol/sdk`, but the current TypeScript SDK
  ships as separate `server` and `client` v2 packages.
- **R3**: SQLite had a WAL concurrent-write/checkpoint corruption defect fixed in
  3.51.3. A `better-sqlite3` version number does not disclose the engine it
  bundles.
- **R4**: D18.1 infers "Node is present wherever the agents run" from the agents
  being Node-based. Codex ships standalone native binaries, so that inference does
  not hold.

## Decision

**Runtime and package manager.** Node.js `24.20.0` (`engines.node: "24.x"`,
`engineStrict`), pnpm `11.25.0` pinned through both `packageManager` and
`devEngines.packageManager`. The Node 24.20.0 tarball's SHA-256 was verified
against the official `SHASUMS256.txt` before use, so the runtime that produced
every Stage 0 result is identified rather than assumed.

**Node availability is checked, never inferred (R4).** `pnpm doctor` runs a
`tools/harness` check that verifies the Node major and the pnpm version against
the declared pins and fails with an actionable message naming what is missing and
what is required. The presence of an AI coding tool is not treated as evidence
that the required runtime exists.

**Exact pins for every dependency.** No ranges, no `latest`, anywhere —
`^`/`~` are forbidden in every `package.json`, `pnpm-lock.yaml` is committed,
and CI installs with `--frozen-lockfile`. Versions, licences, the problem each
solves and what was copied vs. studied are recorded in
`docs/decisions/DECISION-LOG.md` §3.

**Selected:** TypeScript `7.0.2`, `@types/node` `24.13.3` (matched to the *runtime*,
not `latest` — types ahead of the runtime would let `core` typecheck against APIs
Node 24 does not have), Vitest `5.0.0`, fast-check `4.9.0`, Zod `4.5.4`, `yaml`
`2.9.0`, dependency-cruiser `18.2.0`, Prettier `3.9.6`.

**Deliberately absent:**

- *A canonicalization library.* RFC 8785 is implemented in
  `packages/core/src/hashing.ts` (ADR-0003).
- *A ULID / base32 library.* Implemented in `core` so the clock and random source
  are injectable and identifier minting is deterministic under test.
- *ESLint.* `typescript-eslint` support for TypeScript 7.0.2 is unverified, and no
  Stage 0 criterion depends on lint. Deviation C-3.
- *Any MCP package.* Stage 0 builds no adapter. **R1 resolved for the record:**
  the adoption target is `@modelcontextprotocol/server@2.0.0` and
  `@modelcontextprotocol/client@2.0.0`, not `@modelcontextprotocol/sdk`. Before
  adoption at Stage 1, the `LICENSE` and any `NOTICE` of the exact version must be
  read: upstream carries a transition notice (new code Apache-2.0, existing code
  MIT), so the registry's `license` field is not the whole obligation. MCP types
  may appear only under `packages/adapters/mcp`.
- *Any SQLite binding.* **R3 resolved for the record:** Node 24.20.0 bundles
  SQLite **3.53.4** with FTS5 (measured, not inferred), which is above 3.51.3 and
  therefore contains the WAL fix. `better-sqlite3@13.0.3`'s bundled engine was
  **not** measured. The binding is selected at Stage 1/2 against the seven
  executable checks in `DECISION-LOG.md` §4 — a runtime `sqlite_version()` call,
  WAL on a real file, busy handling, checkpointing, idempotency and byte-identical
  index rebuild, on Linux and Windows — never against a package version.

**Platforms.** D18.3's rules hold from day one: no shell scripts in runtime paths,
`path.join` everywhere, `.gitattributes` with `* text=auto eol=lf`. The Linux
primary + Windows smoke CI matrix is **not yet built** (plan §7, B1), so the D35
cross-platform digest gate is unverified.

## Consequences

- Contributors need Node 24 explicitly installed; `docs/setup.md` says so and
  `pnpm doctor` enforces it.
- TypeScript 7.0.2 and Vitest 5.0.0 are recent majors. They were chosen on
  measured behaviour in this repository (typecheck and suite both pass), not on
  reputation; if either proves unstable the pin is a one-line change and the
  lockfile records exactly what was used.
- Stage 1 inherits two written-down obligations rather than two open questions:
  read the MCP v2 licence files, and run the SQLite check matrix.
