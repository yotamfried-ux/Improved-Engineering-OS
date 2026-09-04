# Architecture for contributors

The authoritative documents are in [`source/`](source/): the architecture report
is the constitution, the frozen build guide is the execution spec. This page is
orientation for someone about to change code — it does not replace either, and
where it seems to disagree with them, they win.

## The five boundaries

Everything in this repository exists to keep these apart.

| Plane                         | Holds                                                                         | Written by                         |
| ----------------------------- | ----------------------------------------------------------------------------- | ---------------------------------- |
| **Canonical Git**             | code, schemas, admitted knowledge, controls, release intent, history          | a reviewed, merged change          |
| **Target Project Git**        | a project's own intent, its EOS pin, its ADRs                                 | the project's owner                |
| **Local Runtime**             | what is happening now: caches, the telemetry outbox                           | the runtime, disposably            |
| **Evidence Plane** (Supabase) | what actually happened: telemetry, observations, candidates, derived evidence | ingestion and server-side derivers |
| **External World**            | what may be true now, and needs verifying                                     | nobody; it is read and dated       |

**There is no direct path from an agent, the internet, or MCP into canonical
truth.** The only route is
`Observation → Curation → Candidate → Validation + Evidence → Promotion → Canonical Git → release`.
Runtime code never writes into `knowledge/`. That is fitness rule F3, and it is
armed today, before `knowledge/` exists.

## Package map, and why the arrows point that way

```text
launcher             -> (nothing)                    zero deps, never imports core
core                 -> (nothing in this workspace)  contracts, hashing, ids, ports
evidence-derivation  -> core
assurance            -> core
resolver             -> core
telemetry            -> core
curator              -> core
releases             -> core, resolver, evidence-derivation
store-sqlite         -> core
store-supabase       -> core
adapters/*           -> core + domain packages       composition root only
```

No domain package imports a `store-*` package. Composition happens in adapters
and in Supabase functions. This is R-05: it is what lets local evaluation keep
working when the Evidence Plane is unreachable, instead of Assurance acquiring a
transitive dependency on a backend being up.

**Existing at Stage 0:** `packages/core`, `tools/harness`, `tools/contracts-gen`,
`fitness`. Everything else is a later stage, and the boundary rules that will
govern it are already written.

## `packages/core` — the part with the strictest rules

`core` is the agent-neutral centre. It holds contracts, the canonical hashing
implementation, identity minting, and the ports. It has three properties worth
knowing before you edit it:

1. **No I/O.** Not "avoids I/O" — it is tested under a poisoned module
   environment where `fetch`, `WebSocket` and the filesystem modules throw, with
   the whole public surface exercised. `node:crypto` is allowed: it is pure
   computation, and D35 needs synchronous SHA-256.
2. **No vendor or agent name.** No `claude`, `codex`, `anthropic`, `openai`,
   `supabase` identifier in the code. Comments may name them — explaining that
   `store-supabase` implements a port is architecture documentation.
3. **One third-party import: `zod`.** Adding a second means editing
   `fitness/allowlist.yaml`, which makes it a reviewable decision.

## Contracts hold invariants, not just shapes

Several rules the guide expects a fitness check or a reviewer to catch are held
by the schemas instead, so a violating record cannot exist rather than being
detected after it does:

- `origin_class` has **no field** in the telemetry envelope. A client cannot
  express a run classification, so a compromised installation cannot pose as
  qualification evidence (D36).
- `challenge_state` has **no field** in a canonical Solution Set. It is derived
  at runtime into the score view and never written to Git (C-01).
- `champion_id` is non-null **exactly when** `canonical_state` is `pinned`. A
  temporary winner for an unresolved set is unrepresentable (P-01).
- A `ResolveItem` has **no field** a challenger could be listed in. "One solution
  in front" cannot be violated by a well-meaning resolver (Q-05).
- Client-originated telemetry cannot be graded `corroborated` or
  `externally_verified` (P-02).
- An `INCOMPLETE` run cannot be `qualification_eligible`. Telemetry loss never
  looks like a measured run (D23).

If you find yourself needing to weaken one of these, that is a design
conversation, not a schema edit.

## Hashing: three layers, never fused

`packages/core/src/hashing.ts` is the single canonical implementation (D35, F12).
The layering is the subtle part, and `ADR-0003` explains it in full:

```text
0. validate      reject NaN, Infinity, undefined, BigInt, Date, Map, Set,
                 cycles, class instances, lone surrogates -- never coerce
1. normalize     NFC on declared identifier fields; LF on text bytes.
                 SEPARATE MODULE. Opt-in, per field, at admission time.
2. canonicalize  RFC 8785 JCS. Pure. Never normalizes. Strings preserved.
3. digest        SHA-256 over the UTF-8 bytes
```

Layer 2 must not call into layer 1. Folding NFC into canonicalization would make
two distinct JSON documents hash identically — a silent change to JSON semantics.
There is a test that fails if that ever happens.

Two orderings, deliberately different implementations:

- JSON object keys: **UTF-16 code units** (RFC 8785 §3.2.3)
- file manifest paths: **UTF-8 bytes** (D35)

They disagree above U+FFFF, and a fixture pins a case where they do, so one
shared comparator cannot pass both tests.

## Fitness rules are honest about what they enforce

`fitness/rules.ts` gives each of F1–F12 a status: `enforced`, `partial`, or
`not-yet-enforceable`. At Stage 0 that is 6 / 4 / 3, and a test asserts the
declaration matches what is actually on disk. "Fitness green" here means what it
says rather than more than it says.

Three mechanisms, because none is sufficient alone:

1. **dependency-cruiser** — the import graph (F1a, F2, F4, F5).
2. **scoped source scans** — forbidden identifiers and shapes (F1b, F3, F6, F9, F12).
3. **behavioural tests** — what code _does_ (no-I/O today; F3 and F11 later).

Every scan carries a control proving it can fire. A check that cannot fail proves
nothing, and one of these controls has already caught a trap that silently could
not trigger.

## Evaluation isolation is a contract, not a claim

`tools/harness` deliberately does **not** claim isolation. Every boundary —
filesystem, environment, process, network — reports `proven | violated |
unproven`, and a trial requiring an `unproven` boundary is not
qualification-eligible. There is no `isolated: true`, so "we did not check" cannot
be recorded as "we checked and it passed".

Today the sandbox proves filesystem and environment containment and reports
process and network as `unproven`, because a temporary directory cannot constrain
either. Making those provable is a Stage 3 precondition (`ADR-0005`).

## Where to look

| You want to                                 | Read                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| know what Stage 0 does and does not cover   | `docs/plan/stage-0-plan.md`                                                                                        |
| know why a version or dependency was chosen | `docs/decisions/DECISION-LOG.md`                                                                                   |
| understand a boundary decision              | `docs/adr/`                                                                                                        |
| add a contract                              | `packages/core/src/contracts/`, then `pnpm contracts:emit`                                                         |
| change hashing                              | `ADR-0003` first. Every deterministic id in the project depends on it.                                             |
| add a dependency                            | `DECISION-LOG.md` §3.1 — version, licence, problem, what was copied vs. studied, and the test that proves it works |
