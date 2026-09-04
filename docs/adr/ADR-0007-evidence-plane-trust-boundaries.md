# ADR-0007 — Evidence Plane trust boundaries and telemetry integrity

| Field             | Value                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status            | Accepted                                                                                                                                                                           |
| Date              | 2026-09-04                                                                                                                                                                         |
| Stage             | 0                                                                                                                                                                                  |
| Decisions covered | D22 (credential boundary), D23 (remote/ephemeral sessions), D26 (telemetry registry and envelope), D30 (hosting), D31 (Curator/Promoter split), D36 (run classification authority) |
| Supersedes        | —                                                                                                                                                                                  |

## Context

These six decisions all answer one question: _who is allowed to assert what
about what happened?_ They were reached through the review rounds that found the
project repeatedly getting the answer wrong:

- **R-02**: D22 originally handed the agent the owner's refresh token.
- **R-03**: D23 originally used a Git branch as a telemetry fallback, violating
  "Git = intent, Supabase = what happened".
- **T-02**: D31 originally gave one Curator both the Supabase secret key and the
  GitHub App key — one compromise yielding plane admin _and_ canonical Git write.
- **Q-03**: D33 forbade clients from setting `origin_class` but named no trusted
  authority that did set it.
- **TD-02**: a real Project 8 run produced `telemetry_events_count: 0` because
  the outbox died with an ephemeral container.

## Decision

**Credential boundary (D22).** One installation-scoped, revocable, ≥256-bit
token per machine, accepted only by the `ingest` Edge Function, carrying exactly
three scopes: `telemetry.insert`, `observation.insert`, `read.minimal`. It
travels in `X-IEOS-Installation-Token`, because Supabase reserves `Authorization`
for Auth JWTs and `apikey` for project keys. No Supabase key with authority ever
reaches an agent machine.

**Run classification (D36).** Only a service principal may pre-register
`run_id → origin_class`, before the run's first event. Ingest stamps
`origin_class` from the Run record. **An unregistered run is `operational`** —
the weakest class — by definition.

**Telemetry envelope (D26).** Adds `installation_id`, `emitter_id` and
`session_kind`; ordering is `(installation_id, emitter_id, sequence)`.
Attributes come from an allowlist with declared sensitivity (TD-06 records that
this project already learned only allowlist reconstruction is safe).

**Ephemeral sessions (D23).** Buffered direct ingest with boundary flushes. If
retries fail, the run is `telemetry_state: INCOMPLETE` and
`qualification_eligible: false`. Coding continues. Nothing goes to Git.
Eligibility is declared up front at SessionStart, not inferred afterwards.

**Authority split (D31).** Curator holds Supabase authority and no GitHub
credential; Promoter holds GitHub authority and no Supabase key; neither merges.
The trust boundary is between systems, because Edge Function secrets are
project-wide and two functions in one project do not separate authority.

**Hosting (D30).** Managed Supabase Pro for v1. Domain code depends on ports, so
another backend stays possible; none is built.

## What Stage 0 implemented

Contracts only — but contracts that make the invariants unrepresentable rather
than merely documented:

- `origin_class` has **no field** in the telemetry envelope, and the envelope is
  `.strict()`. A client cannot express a classification at all.
- `ingested_at` must be null on a client-produced event.
- An installation principal cannot hold a service scope.
- `token_hash` accepts only a 64-character hex digest, so a raw token is
  unstorable.
- An `INCOMPLETE` run cannot be `qualification_eligible`.
- Attribute values are scalars only, so a prompt fragment or credential blob
  cannot ride inside a nested value.

**Nothing was provisioned.** No Supabase project, key, migration or function
exists. Stage 0 does not require one and the guide does not ask for one before
Stage 2.

## Rejected alternatives

- **Owner refresh token on agent machines** (R-02). Too broad even under RLS.
- **Telemetry via Git branch commits** (R-03). Privacy, tampering and cleanup
  problems, and it makes Git hold "what happened".
- **One component holding both authorities** (T-02).
- **Client-declared `origin_class`** (Q-03). A compromised agent could then
  manufacture qualification evidence.
- **A denylist scan as the primary attribute control** (TD-06).
- **Self-hosted Postgres for v1** (R-06). Not a drop-in for Auth, RLS and Edge
  Functions, which the design uses.

## Consequences and verification

- The residual risk is stated rather than mitigated away: an agent with shell
  access can read the installation token. Blast radius is inserting telemetry
  and observations as that installation, and minimal reads — attributable and
  revocable (D22.6).
- The Curator's signature proves a proposal came from the approved Evidence
  Plane, not that only the Curator produced it (Q-08). Sufficient while owner
  merge is mandatory; must be revisited before any auto-merge.
- **Open:** every runtime piece. Stage 2 builds ingest, enrolment and the outbox;
  Stage 7 the Deriver; Stage 10 the Curator and Promoter.
