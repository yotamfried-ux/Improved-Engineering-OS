# Security

Threat model, identity boundaries and residual risks for Improved-Engineering-OS.

**Stage 0 status: no credential, key, token or hosted resource exists.** No
Supabase project has been created, no Edge Function deployed, no GitHub App
registered. What follows is the model the implementation is being built to, plus
the controls that are already enforced.

## Principles

- **`AVAILABLE ≠ RECOMMENDED ≠ AUTHORIZED`.** A knowledge recommendation never
  grants a permission. `resolve` may suggest an integration; it can never
  authorize one.
- **No component holds two authorities.** The Curator has Supabase authority and
  no GitHub credential; the Promoter has GitHub authority and no Supabase key.
  A single compromise must not yield both plane admin and canonical Git write
  (T-02, D31).
- **Provenance is not authority.** Content that arrives with a trustworthy source
  does not thereby acquire instruction authority. External documents, MCP
  descriptions and asset bodies are data.
- **Fail closed only where the consequence demands it.** Ordinary coding is never
  blocked by a telemetry backend being down. A critical assurance gate does not
  fail open.

## Identities

| Identity                                         | Holds                                                                                    | May                                                | Never                                                                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Installation** (an agent machine or container) | one opaque, revocable token, ≥ 256 bits, stored in the OS keychain                       | insert telemetry and observations; minimal reads   | mutate evidence, promote a candidate, change a score, read another installation's sensitive records, set `origin_class` |
| **Owner**                                        | a Supabase Auth session                                                                  | enrol installations; read-only investigation       | —                                                                                                                       |
| **Deriver** (Edge Function)                      | the Supabase secret key                                                                  | read raw events, write evidence and investigations | touch Git                                                                                                               |
| **Curator** (Edge Function)                      | the secret key + a proposal-signing key                                                  | emit signed Promotion Proposals                    | hold any GitHub credential                                                                                              |
| **Promoter** (GitHub Actions)                    | a GitHub App installation token, single repo, `contents: write` + `pull_requests: write` | validate a proposal, push a branch, open a PR      | hold the Supabase key; **merge**                                                                                        |
| **Harness** (service principal)                  | scope `run.register`                                                                     | pre-register a run's `origin_class`                | insert telemetry as an installation                                                                                     |

The Supabase secret key exists only inside Edge Function secrets and the owner's
password manager. The GitHub App private key exists only in the canonical
repository's Actions secrets.

## What Stage 0 already enforces

These are executable, not aspirational:

- **A client cannot classify its own run.** `origin_class` has no field in the
  telemetry envelope contract, and the envelope is `.strict()`. An unregistered
  run is `operational` — the weakest class — by construction (D36).
- **A client cannot claim strong integrity.** Evidence with
  `source_authority: agent_runtime` is rejected at `corroborated` or above, and
  client-originated operational telemetry cannot claim `directly_verified`
  attribution (P-02). A compromised installation can nudge a score; it cannot
  manufacture the grade a promotion requires.
- **An installation cannot hold a service scope.** The principal contract rejects
  `run.register`, `proposal.read` and `proposal.ack` on an installation (D22).
- **A raw token is never storable.** The principal contract accepts only a
  64-character hex digest in `token_hash`.
- **Ingest time is server-owned.** `ingested_at` must be null on a
  client-produced event.
- **No secret-shaped value may be committed.** Fitness F9 scans for Supabase
  keys, JWTs, private-key headers, GitHub tokens and AWS access-key ids, with no
  allowlist entries — a secret-shaped value has no legitimate home here.
- **Runtime cannot write canonical knowledge.** Fitness F3 forbids any write into
  `knowledge/` from `packages/` or `tools/`, and forbids any push or
  branch-creation call in either. The `KnowledgeIndex` port has no write method.

## Residual risks, stated rather than mitigated away

- **An agent with shell access can read the installation token.** Accepted (D22.6).
  Blast radius: inserting telemetry and observations as that installation, plus
  minimal reads. Every insert is attributable and the token is revocable. This is
  the accepted cost of D1's single-user design.
- **The Curator's signature proves origin, not isolation.** Edge Function secrets
  are project-wide, so the signature proves a proposal came from the approved
  Evidence Plane, not that only the Curator process produced it. Sufficient while
  owner merge is mandatory; the signing key's isolation must be revisited before
  any auto-merge category is enabled (Q-08).
- **Evaluation isolation is unproven for network and process.** The harness
  reports both `unproven` and marks affected trials ineligible for qualification,
  rather than claiming a containment a temporary directory does not provide
  (`ADR-0005`, research finding R5).
- **No Windows verification.** All Stage 0 results are Linux x64 only.

## Reporting

This is a personal system with a single owner. Security concerns go directly to
the repository owner.
