# ADR-0006 — Knowledge identity, lifecycle, storage and taxonomy

| Field             | Value                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Status            | Accepted                                                                                       |
| Date              | 2026-09-04                                                                                     |
| Stage             | 0                                                                                              |
| Decisions covered | D19 (identity and canonical lifecycle), D20 (storage and retrieval), D28 (taxonomy governance) |
| Supersedes        | —                                                                                              |

## Context

These three decisions are one architectural question wearing three hats: _what
is a canonical knowledge object, how is it addressed, and who may add one?_
Splitting them across three ADRs would put the identity rule in one file, the
thing it identifies in another, and the vocabulary both depend on in a third.

TD-04 records what happens without them: "Asset schema has no body/content
model, no identity-minting rule, no rename rule, no legacy ID mapping. Import
invents a layout under time pressure; retrieval then depends on it."

R-04 adds the failure that motivated the lifecycle rule: Stage 2 originally
wrote `status: candidate` assets straight into canonical `knowledge/`, bypassing
Observation → Candidate → Promotion entirely.

## Decision

**Identity (D19).** Every canonical object gets an opaque, immutable ULID with a
type prefix. Slugs and titles are mutable metadata. `content_hash` is an
_addressing key_, not a merge rule: equal hash with different
recommendation-relevant metadata yields `related_to` and a report entry, never a
merge, and `failed_solution` is never merged with anything. `legacy_ids[]`
carries old Engineering-OS paths so provenance survives the rebuild. Renames
never change an id; supersession is a relationship.

**Canonical lifecycle (D19, R-04).** `active | restricted | quarantined |
deprecated | superseded`. `observation`, `candidate` and `promotion_proposal`
exist only in Supabase staging. An `active` asset with no evidence is explicitly
"admitted, unproven".

**Storage and retrieval (D20).** One directory per asset
(`knowledge/assets/<type>/<slug>/`), with `asset.yaml`, `body.md` and an
optional `files/`. Retrieval v1 is deterministic — capability match, FTS5 BM25,
Project Fit, Champion per Solution Set, Asset Score tie-break. Embeddings are an
optional `Retriever` port implementation, added only if Stage 14 proves
deterministic recall insufficient.

**Taxonomy (D28).** `contracts/capabilities.yaml` is versioned, seeded from the
legacy `core/capability-registry.yaml`, and grows only through a promotion PR.

## What Stage 0 implemented, and what it deliberately did not

Implemented: the asset and solution-set contracts, `content_hash` via the D35
file-set digest, ULID minting with injected clock and randomness, and the
capability seed (`tools/capability-seed`, 28 ids from
`yotamfried-ux/Engineering-OS@4d51784`, enforcement fields dropped and named).

Not implemented: the knowledge tree itself, the compiled index, FTS5, and any
retrieval. Those are Stage 1–2. Stage 0 owns the contracts they will have to
satisfy.

## Rejected alternatives

- **Path-derived ids** (named and rejected by D19). A rename would change
  identity, and every piece of evidence attached to the old path would be
  orphaned.
- **Merging on equal `content_hash`.** Two assets with identical bodies but
  different applicability are different recommendations. Merging them loses the
  distinction that made them separate.
- **Free-form tags** instead of a governed taxonomy (rejected by D28). "One
  Champion per equivalent problem" becomes undecidable without a stable
  equivalence class (TD-14).
- **Embeddings in v1.** They would couple retrieval to a vendor (TD-13) before
  anything has shown deterministic recall to be insufficient.

## Consequences and verification

- A staging status in a canonical asset is a schema rejection, not a review
  finding: `assetStatusSchema` simply does not contain those values.
- The seed is reproducible from an exact revision, and a test regenerates it
  byte-for-byte against the real checkout when that checkout is present.
- Duplicate capability ids, unknown kinds and an empty source are all rejected
  by the seeder — an empty taxonomy can never be confused with an unreachable
  source.
- **Open:** Stage 2 must decide the FTS5 index build, and Stage 5 the bulk
  import. Neither can change the identity rule without a migration, which is why
  the identity rule is fixed now.
