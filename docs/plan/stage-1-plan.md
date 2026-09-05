# Stage 1 implementation plan — minimal runtime from source

| Field     | Value                                                                                                                                                                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status    | **Gate PASSED** — `qualification/reports/stage-01-2026-09-05.md`, 9 pass / 0 fail / 0 unproven on `linux` and `win32`. The report is the authority, not this document. Stage 1 closes procedurally when PR #2 is reviewed and merged, as Stage 0 did. |
| Written   | 2026-09-05                                                                                                                                                                                                                                            |
| Base      | Stage 0, merged at `c436c1f`, gate PASSED by `qualification/reports/stage-00-2026-09-05.md`.                                                                                                                                                          |
| Authority | `docs/source/Improved-Engineering-OS_Architecture_Report.pdf` (constitution) > `docs/source/Improved-Engineering-OS-Build-Guide-FROZEN-v1.4.1.md` (frozen guide) > this plan.                                                                         |

## 1. What the guide asks for

Quoted from the frozen guide, Stage 1:

> **Goal.** `pnpm ieos` runs from a checkout on the owner's machine and in a cloud
> container, with `doctor`, `init` (footprint per D18.4 pointing at the _source
> checkout_ for now) and `build:index`.
>
> **Deliverables.** `adapters/cli` skeleton (`ieos doctor|init|resolve|inspect|expand|observe|auth`),
> `adapters/mcp` stateless server exposing the four tools with `server/discover`,
> `store-sqlite` KnowledgeIndex reader, `releases/build-index.ts`,
> `releases/scores-snapshot.ts` in bootstrap mode emitting the deterministic
> `UNPROVEN` snapshot (D24, Q-02).
>
> **Exit gate additions.** `ieos doctor` reports index digest, contracts versions,
> session kind and ingest reachability; MCP server passes a `2026-07-28`
> conformance smoke: `server/discover` implemented, self-describing `_meta` on
> every request accepted, `tools/list` with `ttlMs`, `tools/call`; the smoke also
> passes without the client ever calling `server/discover`.

## 2. What was verified against official sources before writing any code

The guide's claims about MCP are load-bearing for this stage, so each was checked
against the specification rather than taken on faith. All held.

| Claim (guide)                                                          | Official source                                           | Result                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Servers **must** implement `server/discover`; clients need not call it | spec `2026-07-28` `/server/discover`, `/basic/versioning` | **Confirmed.** _"All servers are required to implement this operation."_ and _"While clients may call server/discover … they are not required to do so."_                                                                                                      |
| Initialization handshake removed; stateless core                       | spec `2026-07-28` `/changelog`                            | **Confirmed.** _"transitioned to a stateless architecture by removing the initialization handshake."_                                                                                                                                                          |
| Every request is self-describing via `_meta`                           | spec `2026-07-28` `/basic`                                | **Confirmed.** Required per-request fields are protocol version and client capabilities; missing them makes the request **malformed** (invalid params / HTTP 400). Keys are `io.modelcontextprotocol/protocolVersion`, `…/clientInfo`, `…/clientCapabilities`. |
| Version mismatch yields error `-32022`                                 | spec `2026-07-28` `/basic/versioning`                     | **Confirmed**, with `data.supported` and `data.requested`.                                                                                                                                                                                                     |
| Lists carry `ttlMs` / `cacheScope`                                     | spec `2026-07-28` `/server/discover`, `/server/tools`     | **Confirmed.** Also: servers **must** declare the `tools` capability and **should** return tools in a deterministic order.                                                                                                                                     |
| D18.5's `@modelcontextprotocol/sdk` coordinate is stale (C-4)          | npm registry                                              | **Confirmed.** `sdk` latest is `1.30.0` (the v1 monolith). The v2 line is `@modelcontextprotocol/server` / `…/client`, both `2.0.0`.                                                                                                                           |

**One correction to our own record.** Deviation C-4 and decision-log §3.3 list the
MCP v2 packages with licence "MIT (npm registry field)" and note the field may be
insufficient. It is. The `LICENSE` shipped inside `@modelcontextprotocol/server@2.0.0`
states the project is mid-transition: **new code is Apache-2.0**, documentation is
CC-BY-4.0, and contributions whose authors have not consented to relicensing
**remain MIT**. So the package is a mixture, and `package.json`'s `"license": "MIT"`
understates it. Recorded properly in the decision log rather than carried forward
as "MIT".

**Facts the guide did not carry, learned from the spec and worth building on:**

- Streamable HTTP requests also carry `MCP-Protocol-Version`, `Mcp-Method` and
  `Mcp-Name` headers. The shipped server is stdio; the conformance smoke exercises
  the HTTP entry in-process, so it does send them (see below).
- The v2 SDK exports exactly what this stage needs: `McpServer`, `DiscoverRequest`/
  `DiscoverResult`, `LATEST_PROTOCOL_VERSION`, `SUPPORTED_PROTOCOL_VERSIONS`,
  `PROTOCOL_VERSION_META_KEY`, `CLIENT_INFO_META_KEY`, `CLIENT_CAPABILITIES_META_KEY`,
  `UnsupportedProtocolVersionError`, and `InMemoryTransport` — which lets the
  conformance smoke run in-process rather than spawning a server.

**Two corrections this plan owes to what was then measured**, both recorded in
full in decision log §4d:

1. **The protocol era belongs to the serving entry, not to `McpServer`.** The
   obvious wiring — `new McpServer(...)` then `server.connect(transport)` — serves
   the _2025_ era: `server/discover` answers `-32601` and lists carry no cache
   fields. `serveStdio` and `createMcpHandler` are what classify the `_meta`
   envelope and pin the era, and they take a _factory_. So this package hands a
   factory to the entry and never connects a server itself.
2. **The stdio entry pins the era per connection.** A request arriving later on an
   already-opened connection is not re-judged against its own envelope. That is
   the stdio binding's documented design, and it means gate row G4's "on every
   request" cannot be demonstrated on a connection-oriented transport. The smoke
   therefore also drives the same server through `createMcpHandler`, where each
   request is its own serving unit. That leg is a test, not a shipped transport:
   no listener is opened and `ieos-mcp` serves stdio only.

`@modelcontextprotocol/client@2.0.0` was installed for the smoke and then removed:
the smoke has to send a missing envelope, a malformed one and an unsupported
version, and a conforming client cannot produce any of those.

**`node:sqlite`** (selected at Stage 0 as deviation C-9), from the Node 24 API docs:

- `new DatabaseSync(path, { readOnly: true })` exists. The KnowledgeIndex reader
  uses it, which makes fitness rule **F3** — runtime never mutates canonical
  knowledge — structural for this path rather than conventional: the handle
  cannot write.
- `timeout` (busy timeout), `prepare()` → `StatementSync` with `all/get/iterate/run`.
- The module is still **experimental** and can be disabled with
  `--no-experimental-sqlite`. That is the accepted cost recorded in C-9, and it is
  a real operational failure mode, so `ieos doctor` checks for it explicitly.
- FTS5 availability is not assumed: Stage 0's SQLite check 7 already built an
  FTS5 table through this binding and passed on both linux and win32.

## 3. Deliverables, and what each is allowed to assume

| Package                 | Stage 1 scope                                                                                                                                                                                                         | Deliberately NOT here                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/store-sqlite` | `KnowledgeIndex` port implemented over `node:sqlite`, opened **read-only**; FTS5 search; `indexDigest()`.                                                                                                             | Outbox and LocalCache ports (Stage 2 telemetry).                             |
| `packages/releases`     | `build-index.ts` compiling `knowledge/` → `knowledge.sqlite` deterministically (D20.2, F8); `scores-snapshot.ts` in **bootstrap mode** emitting the D24/Q-02 `UNPROVEN` snapshot.                                     | Release manifests, pinning, attestation — Stage 4.                           |
| `packages/adapters/cli` | `ieos doctor\|init\|resolve\|inspect\|expand\|observe\|auth`. `doctor` reports index digest, contract versions, session kind, ingest reachability. `init` writes the D18.4 footprint against the **source checkout**. | `auth` is a stub that says so: installation credentials are Stage 2 (D22).   |
| `packages/adapters/mcp` | Stateless server exposing the four Agent Contract tools, `server/discover`, `ttlMs`/`cacheScope` on lists, `readOnlyHint` on the three reads and `idempotentHint` on `observe`.                                       | A shipped HTTP transport, OAuth, sessions.                                   |
| Ranking                 | Not implemented. `resolve`/`expand` answer the one case that contains no ordering decision — an empty corpus — and **refuse** the moment the index holds an asset or a set.                                           | D20.3 deterministic ranking arrives with `packages/resolver` at **Stage 2**. |

### What the four tools answer at Stage 1, and what they refuse

The refusals are deliberate, and each has a test that fails if it is removed.

| Tool      | Answers                                                                                                      | Refuses                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `resolve` | An empty corpus: `items: []`, a real `ctx_` snapshot id, the bootstrap score view, `score_source: snapshot`. | A non-empty corpus (`ranking_not_available`); a recorded score view it cannot reproduce.           |
| `expand`  | The same, carrying the reason the search widened.                                                            | The same.                                                                                          |
| `inspect` | An asset with its body and `evidence_summary: "none"`; a solution set with its members; a snapshot's inputs. | A snapshot from another session (`snapshot_not_durable`) — durability arrives with the outbox.     |
| `observe` | Records through a staging sink when one is wired, reporting `recorded` or `duplicate`.                       | Everything, at Stage 1 (`staging_unavailable`): there is no sink, so a success would be a fiction. |

`context_snapshot_id` is computed from the eight D35 inputs. Two of them cannot be
observed at this stage, and rather than hashing a zero in their place they carry a
declared `unobserved:<subject>:<why>` value, which `inspect` hands back. The id
stays reproducible; what it is an id _of_ stays legible.

`packages/resolver` is **not** created at Stage 1 — the guide places the minimal
resolver in Stage 2 — so fitness rules F4 and F11 stay dormant and their guards
stay armed.

## 4. Fitness rules Stage 1 wakes

Creating these directories makes `fitness/checks/dormancy.test.ts` fail until the
corresponding rule is armed. That is the mechanism working, not an obstacle:

| Rule | Subject appearing   | What arming it means                                                                                                                                                     |
| ---- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F2   | `packages/adapters` | Adapters own no knowledge semantics: nothing under `adapters/` defines ranking or reads `knowledge/` directly. Enforced by dependency-cruiser once the directory exists. |
| F7   | `packages/releases` | Runtime never resolves `latest`; release resolution requires an exact version + digest.                                                                                  |
| F8   | `knowledge/`        | Deterministic index build — build twice, compare digests.                                                                                                                |

F5 (`packages/launcher`), F10 (`simulations/`), F4 and F11 (`packages/resolver`,
`assurance`, `evidence-derivation`) stay dormant, and their guards stay in force.

## 5. Exit gate

Read the same way Stage 0's was, and closed the same way — by a harness-generated
report in `qualification/reports/`, never by this document. **All nine rows passed
on both platforms**; the report is `qualification/reports/stage-01-2026-09-05.md`.

| Row | Requirement                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | `pnpm ieos` runs from a source checkout: `doctor`, `init`, `build:index` all execute.                                                                                                                    |
| G2  | `ieos doctor` reports index digest, contract versions, session kind and ingest reachability.                                                                                                             |
| G3  | MCP `server/discover` is implemented and returns supported versions, capabilities and server identity.                                                                                                   |
| G4  | Self-describing `_meta` is accepted on every request; a version mismatch yields `-32022`. Demonstrated per request through the HTTP entry, because the stdio entry pins the era for the connection (§2). |
| G5  | `tools/list` carries `ttlMs`, and `tools/call` reaches all four tools. `observe` answers with an explicit refusal, not a fabricated `recorded`: its staging sink arrives at Stage 2 (D22, T-04).         |
| G6  | The conformance smoke **also passes without the client ever calling `server/discover`**.                                                                                                                 |
| G7  | The index build is deterministic: two builds of the same tree produce the same digest (F8).                                                                                                              |
| G8  | The bootstrap snapshot is still the D24/Q-02 `UNPROVEN` one, unchanged from Stage 0 and identical across platforms.                                                                                      |
| G9  | F1–F12 under the C-10 reading: every rule enforceable now is green, every dormant rule guarded.                                                                                                          |

**Not in this gate, and not claimed:** ranking quality, real knowledge assets, a
live agent trial, telemetry delivery, or any Supabase reachability beyond
`doctor` honestly reporting that it is unconfigured.
