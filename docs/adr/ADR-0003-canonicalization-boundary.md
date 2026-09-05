# ADR-0003 — Canonicalization and normalization boundary

| Field          | Value                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Status         | Accepted                                                                                                 |
| Date           | 2026-09-04                                                                                               |
| Stage          | 0                                                                                                        |
| Implements     | D35 (Hashing Contract), C-02, P-04                                                                       |
| Addresses      | Research finding R2                                                                                      |
| Owner decision | **APPROVED 2026-09-04.** Recorded as approved deviation C-6; the layering below is the accepted reading. |

## Context

D35 states one project-wide rule and lists, in a single block:

```text
JSON records → RFC 8785 (JCS), then UTF-8 bytes
Strings      → UTF-8, NFC normalization
Text assets  → line endings normalized to LF before hashing
File sets    → per-file SHA-256 → sorted manifest → JCS → one SHA-256
```

Research finding R2 identifies a genuine conflict inside that block. RFC 8785
§3.1 requires Unicode strings to be **preserved** during canonicalization, and
§3.2.3 sorts object keys by **UTF-16 code units**. D35 separately sorts file
manifest entries by **UTF-8 byte order** of the relative POSIX path. So the
document contains two different ordering rules and a normalization instruction
that, read as part of JCS, would violate the RFC it names.

Applying NFC inside canonicalization would also change JSON semantics: two
distinct JSON documents would hash identically, and a value read back out would
differ from the value put in. The user's instruction B forbids exactly this.

## Decision

Canonicalization and normalization are **three ordered layers that are never
fused**. Each is a separate exported function with its own tests.

### Layer 1 — Project normalization (IEOS-specific, opt-in per field)

Runs **before** anything is canonicalized, and only on fields explicitly declared
normalizable. It is not applied to arbitrary JSON.

- **Identifier-like text** (slugs, capability and problem ids, relative POSIX
  paths) is normalized to **NFC**.
- **Text asset bytes** are normalized to **LF** line endings, with no
  trailing-whitespace change.
- **Collisions are rejected, never merged.** If two distinct inputs normalize to
  the same value, `normalizeIdentifierSet` throws a typed
  `NormalizationCollisionError` naming both originals. Silent merging would let
  two different assets acquire one identity — the "duplicate identity" failure
  mode D6 names.
- The normalized value becomes **the** value. It is what is stored, what is
  compared, and what is later canonicalized. Normalization is an admission-time
  decision, not a hashing-time trick.

### Layer 2 — RFC 8785 JCS (pure, no normalization)

`canonicalizeJson` implements RFC 8785 exactly and **performs no normalization**:

- Object keys sorted by **UTF-16 code unit** order (§3.2.3).
- Strings **preserved verbatim** (§3.1); escaping per §3.2.2.2 only.
- Numbers serialised per ECMAScript `Number::toString` (§3.2.2.3), with `-0`
  emitted as `0`.
- `NaN`, `Infinity`, `undefined`, functions, symbols, `BigInt`, `Date`, `Map`,
  `Set` and cyclic structures are **rejected with a typed error**, never coerced.
  Silent coercion is the "silent semantic repair" the Stage 0 simulation manifest
  explicitly forbids.

### Layer 3 — Digest

`sha256Hex` over the UTF-8 bytes of the layer-2 output. Textual form
`sha256:<lowercase hex>`; identifiers use **RFC 4648 base32, no padding**, of the
raw digest.

### File sets (P-04)

Per-file SHA-256 of normalized bytes → a manifest
`{ "files": [ { "path", "sha256" }, … ] }` whose entries are sorted by relative
POSIX path in **UTF-8 byte order** → JCS → one SHA-256. Paths are never
concatenated with bytes.

### The two ordering rules are separate implementations

JSON key order (UTF-16 code units) and manifest path order (UTF-8 bytes) are
**different comparators**, in different functions, with a test fixture where they
**disagree**: `U+FFFF` versus `U+10000`. In UTF-16 code units `U+10000`
(`D800 DC00`) sorts _before_ `U+FFFF`; in UTF-8 bytes (`F0 90 80 80` vs
`EF BF BF`) it sorts _after_. A single shared comparator cannot pass both tests,
so the fixture proves the separation rather than asserting it.

## Consequences

- One implementation of canonical hashing exists, in
  `packages/core/src/hashing.ts`, as D35 and F12 require. The two permitted
  exceptions (raw artifact integrity in `packages/launcher`, credential hashing in
  the auth path) do not exist yet; `fitness/allowlist.yaml` pre-registers them as
  forbidden until their stage, so a stray `createHash(` call fails F12 today.
- Correctness is checked against an **external oracle**: the official
  `cyberphone/json-canonicalization` conformance vectors (Apache-2.0, vendored as
  data with a `NOTICE`), plus fast-check properties for idempotence and
  key-insertion-order invariance.
- **This decision picks one reading of an ambiguous sentence in a frozen
  document.** It is deviation C-6 and is flagged for owner confirmation. If the
  owner intends NFC _inside_ JCS, `hashing.ts` changes in one place — but every
  deterministic identifier in the project changes with it, so the confirmation is
  worth having before Stage 2 writes any durable id.
