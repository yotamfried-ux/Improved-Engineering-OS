# ADR-0009 — Release integrity, the promotion path, and dependency policy

| Field             | Value                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| Status            | Accepted                                                                                                 |
| Date              | 2026-09-04                                                                                               |
| Stage             | 0                                                                                                        |
| Decisions covered | D21 (promotion is a pull request), D25 (Agent Contract), D29 (dependency policy), D35 (hashing contract) |
| Supersedes        | —                                                                                                        |
| Related           | `ADR-0003` covers the canonicalization/normalization boundary inside D35 in depth                        |

## Context

Four decisions about how work leaves the system and how it is addressed:
how a candidate becomes canonical knowledge (D21), the surface an agent sees
(D25), what the project itself depends on (D29), and how anything is identified
at all (D35).

TD-08 records the failure D21 prevents: "Promotion approval has no mechanism.
Approval state ends up in a side database." TD-15 records D29's: "No dependency
policy for EOS itself. The pinned release is reproducible but its inputs are
not." Q-04 records D35's: "Canonical JSON was used in four hashes without a
definition."

## Decision

**Promotion is a pull request (D21, C-04).** The Curator emits a signed
Promotion Proposal; the Promoter validates it and opens the PR; owner approval
_is_ the merge. Git history is the audit log. Before Stage 10 there is no
Promoter, so the bootstrap path applies: an import tool writes a local promotion
bundle and the owner opens the PR. **The tool never pushes.**

**Agent Contract (D25).** Four tools: `resolve`, `inspect`, `expand`, `observe`.
Every response carries a durable `context_snapshot_id`, so a recommendation
stays explainable a month later. `observe` is idempotent through a
caller-minted `observation_id` — T-04 found `idempotentHint: true` declared
without an idempotency key, which is a promise the transport cannot keep.
`resolve` returns Champions only; challenger detail lives in `inspect` (Q-05).

**Dependency policy (D29).** Exact pins, committed lockfile, frozen-lockfile
install in CI, verification of each new dependency against current official
documentation, and a recorded rationale per dependency.

**Hashing (D35, C-02).** One canonical structured hashing implementation, in
`packages/core/src/hashing.ts`. Two narrow exceptions hash _opaque bytes_ and can
never mint an EOS identity: raw artifact integrity in the launcher, and
credential verification in the auth path.

## What Stage 0 implemented

- The four Agent Contract request/response shapes, with `context_snapshot_id`
  derivation implemented and fixture-pinned, and a `ResolveItem` that has **no
  field** a challenger could occupy.
- The single hashing implementation, checked against the official RFC 8785
  conformance vectors.
- F3 armed _before_ `knowledge/` exists: nothing under `packages/` or `tools/`
  may write into it or call a push. The commit that creates `knowledge/` meets
  an existing rule rather than negotiating with one.
- F12 with both permitted exceptions **pre-registered as forbidden until their
  stage**, so a stray `createHash(` fails today rather than after the directory
  that would excuse it appears.
- The dependency policy as an executable check: exact pins, no `latest`, a
  committed lockfile, and every direct dependency recorded in the decision log
  with its version and licence.

No transport, no launcher, no Curator, no Promoter.

## Rejected alternatives

- **A custom approval UI** (D21's rejection). Approval state would leave Git,
  which is where the audit log belongs.
- **Inferring attribution from traces** instead of an `observe` write (D25's
  rejection, TD-10).
- **Listing challengers in `resolve`** (Q-05). It hands the filtering work back
  to the agent, which is the "too many near-identical options" failure the
  report opens with.
- **Per-subsystem canonical serialization** (D35's rejection). Four hashes with
  four definitions is four opportunities for two of them to disagree.
- **A hand-written signature or attestation verifier** (T-08). Digest
  verification in the launcher, attestation via official tooling.

## Consequences and verification

- Adding a third-party import to `core` requires editing
  `fitness/allowlist.yaml`, making it a reviewable decision. The list currently
  holds exactly one entry, `zod`, under approved deviation C-1.
- A dependency added without a decision-log entry fails a test.
- **Open:** the launcher (Stage 4), the MCP and CLI adapters (Stage 1/8), and
  the Curator and Promoter (Stage 10). `@modelcontextprotocol/{server,client}@2.0.0`
  is recorded as the adoption target; its `LICENSE`/`NOTICE` must be read before
  it is added, because upstream carries a licence transition.
