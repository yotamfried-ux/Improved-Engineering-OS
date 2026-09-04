# ADR-0001 — Architecture baseline: D1–D17 accepted by reference

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-04 |
| Stage | 0 |
| Supersedes | — |

## Context

The owner's architecture report (`docs/source/Improved-Engineering-OS_Architecture_Report.pdf`,
Architecture Baseline 1.0, 37 pages) records 17 approved architectural decisions
and an Architecture Constitution. The frozen build guide (§1.1) reviews each of
D1–D17 and returns `CONFIRMED` or `CONFIRMED+CHANGE`; every `CHANGE` is closed by
one of D18–D36.

Guide finding TD-18 notes that the 17 decisions exist only inside one large
report, so there is no per-decision history. Its resolution is one baseline ADR
at Stage 0 referencing the report, with individual ADRs only from D18 onward
(softened by R-12).

## Decision

D1–D17 are accepted as the project's architectural baseline **by reference** to
the report, together with the guide §1.1 dispositions. This ADR does not restate
them, and no copy of them is made: the report is the single source, and a second
authoritative copy would create exactly the "two SSOTs for one fact" the
constitution forbids.

The following constitution elements are treated as invariants that implementation
must not be able to express a violation of, rather than as guidance:

1. **Five boundaries.** Canonical Git (what the system knows, defines and
   releases), Target Project Git (what a project intends and what it is pinned
   to), Local Runtime (what is happening now), Supabase Evidence Plane (what
   actually happened and what was learned), External World (what may be true now
   and needs verification).
2. **No direct path** from AI / Internet / MCP / agent observation to canonical
   truth. The only path is
   `Observation → Curation → Candidate → Validation + Evidence → Promotion → Canonical Git → future pinned release`.
3. **State Ownership Matrix.** One state, one owner. Canonical knowledge is
   mutable only through the promotion path; observed state, raw telemetry and
   derived evidence belong to the Evidence Plane; pending telemetry belongs to
   local SQLite; caches are disposable.
4. **`AVAILABLE ≠ RECOMMENDED ≠ AUTHORIZED`.** A recommendation never grants a
   permission.
5. **No silent guessing.** Missing information is `UNKNOWN`, never inferred
   success. Telemetry loss is `INCOMPLETE`, never a measured run.
6. **Evidence before authority.** A high score alone never makes an asset
   canonical and never bypasses a safety gate.
7. **Progressive disclosure.** `resolve` returns little; `inspect` opens depth;
   `expand` widens only on demand.
8. **One equivalent problem → one visible Champion**, and only when evidence
   justifies it. Otherwise the Solution Set is honestly `unresolved`.

## Consequences

- Stage 0's contracts are designed so that violating (2), (3), (5) or (8) is a
  *type error or a schema rejection*, not a code review finding. Concretely:
  `origin_class` cannot be expressed in the telemetry envelope; staging lifecycle
  states cannot be expressed in a canonical asset; `challenge_state` cannot be
  expressed in a canonical Solution Set; and `champion_id` is non-null exactly
  when `canonical_state` is `pinned`.
- Per-decision ADRs are written from D18 onward. D18–D36 are dispositioned in
  `docs/decisions/DECISION-LOG.md` §2; individual ADR files for D19–D36 remain
  outstanding (plan §7, B3).
- The report is preserved byte-for-byte. The guide's TD-17 instruction to replace
  its citation tokens is historical context, not authority to edit the supplied
  PDF; the report's own final page states those tokens were already removed.
