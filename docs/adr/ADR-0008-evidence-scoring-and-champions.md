# ADR-0008 — Evidence derivation, scoring integrity and the Champion

| Field             | Value                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Status            | Accepted                                                                                                                    |
| Date              | 2026-09-04                                                                                                                  |
| Stage             | 0                                                                                                                           |
| Decisions covered | D24 (offline reads), D27 (staleness), D32 (derivation reproducibility), D33 (holdout policy), D34 (release-pinned Champion) |
| Supersedes        | —                                                                                                                           |

## Context

These five decisions are the project's defence against a system that convinces
itself. Each was written after a review round found a way for evidence to become
self-confirming:

- **T-01**: a live score could change the Champion without a release, so a
  pinned release could recommend A today and B tomorrow.
- **R-07**: derivation keyed on `(run_id, deriver_version)` is not reproducible
  once late CI evidence changes the inputs.
- **R-08**: holdout evidence was allowed to change the Champion, so the holdout
  stopped being a holdout.
- **R-09**: staleness by paths and max age missed dependency, Profile and
  provider changes.
- **P-01**: D34 required a Champion per Solution Set, Stage 5 forbade the
  importer from choosing one, and D19 forbids inventing one without evidence —
  three rules that could not all hold.
- **Q-02**: Stages 0–1 had source builds reading a score snapshot from an
  Evidence Plane that does not exist yet.

## Decision

**Reproducible derivation (D32).** `evidence_id = "evd_" +
base32(sha256(JCS({run_id, deriver_id, deriver_version, input_snapshot_hash})))`.
Late input produces a **new** derivation with a new `input_snapshot_hash` that
supersedes the previous one; nothing is deleted. The replay invariant is exact:
rerunning the same deriver over the same snapshot yields an identical
`evidence_id` **and** an identical payload once `derived_at` is stripped.

**Integrity grading (P-02).** Every Evidence row carries `source_authority` and
`verification`, stamped by the deriver from the event source and the Run record,
never from event content. Client-originated telemetry alone can never produce
`directly_verified` attribution or `externally_verified` integrity.

**The eligibility ladder (C-05).** `reported` is a capped scoring signal;
`observed` makes a candidate or challenger evidence-worthy; `corroborated` or
better is required for a promotion proposal; only an approved promotion plus a
release sets `canonical_state: pinned`. There is no path from `unresolved` to
`pinned` that skips a promotion.

**Holdout (D33).** An active holdout is never an optimization input and never
selects a Champion. Retiring one reclassifies it and requires a replacement set.

**Release-pinned Champion (D34, C-01).** `champion_id` and `canonical_state`
belong to Git and the release. `challenge_state` is derived at runtime into the
score view and never written to Git. A Solution Set may legitimately have no
Champion; `resolve` then reports `unresolved_solution_set` rather than picking a
temporary winner.

**Offline reads (D24, Q-02).** The release carries a score snapshot. In Stages
0–1 there is no Evidence Plane, so the source build emits a deterministic
`UNPROVEN` snapshot: uniform prior, zero evidence, null `computed_at`, policy
version `"0"`. It says in its own data that nothing has been proven.

**Staleness (D27).** Evidence carries `scope: { paths, depends_on, max_age_days }`
with typed selector prefixes, so a dependency bump or a Profile change can
invalidate evidence that no path glob would catch.

## What Stage 0 implemented

- `evidence_id`, `input_snapshot_hash`, `compareReplay` and
  `validateSupersession` in `packages/core`, with the replay invariant tested
  over a synthetic derivation and four negative controls.
- The Evidence contract with the P-02 integrity pairing enforced, and the C-05
  ladder as data (`INTEGRITY_LADDER`) rather than prose.
- The Solution Set contract where `champion_id` is non-null _exactly_ when
  `canonical_state` is `pinned`, and `challenge_state` is unrepresentable.
- The bootstrap `UNPROVEN` snapshot and its emitter, with the digest pinned as
  the cross-platform fixture.

## Rejected alternatives

- **A fresh ULID per derivation** (D32's stated rejection). Replay would produce
  a different id each time, so nothing could be compared.
- **Overwriting a superseded derivation.** History is the audit trail; a
  derivation that vanishes takes its explanation with it.
- **Letting holdout results feed Champion selection** (D33's rejection). The
  holdout would then be measuring itself.
- **A live score swapping the Champion at runtime** (D34's rejection, T-01).
- **Choosing a temporary Champion for an unresolved set** (P-01). "One solution
  in front" is only worth having when the one in front is justified.
- **A network-required `resolve`** (D24's rejection). Coding would stop when the
  Evidence Plane did.

## Consequences and verification

- A "supersession" over unchanged inputs is rejected as a replay in disguise —
  tested.
- Six of seven passing is not a pass anywhere in this design; aggregation is
  conjunctive and pessimistic throughout.
- **Open:** the scorer itself, promotion margins, score weights and the
  challenger threshold are all Stage 10, and guide §7 keeps them open until real
  data exists. Nothing here invents a number.
