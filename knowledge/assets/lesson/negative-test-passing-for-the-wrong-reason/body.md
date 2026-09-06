# A negative test that asserts only failure can pass for the wrong reason

## מה קרה

PR #268 made archive import call the shared bundle validator before any mutation, with 14
negative fixtures proving that tampered or foreign bundles are refused. Every fixture asserted
two things: that the import failed, and that the archive was byte-identical afterwards. Neither
assertion says _which_ check refused the bundle. `validate_bundle()` compares checksums
(`telemetry_handoff.py:344`) before boundary position (`:362`), so any fixture that disturbs
both reports the checksum and proves nothing about the boundary. The per-case failure reasons
existed only as a hand-written table in the PR body — prose that no gate reads.

## שורש הבעיה

The boundary fixture rewrote `events.jsonl`, then called `sync_bundle "$B" 2>/dev/null || true`.
That masking made the fixture's meaning depend on whether an unobserved command succeeded. It
happened to succeed — measured, `latest_boundary_position()` returns `0` for a boundaryless run,
`write_handoff_manifest()` writes that value and reseals the checksums, so the bundle reached the
validator internally consistent and could only fail on the boundary. The test was correct by
accident. Any future change to the sync writer would have moved the rejection to the checksum
silently, with the suite green and the PR body still claiming boundary coverage.

The deeper error was placing the evidence in the wrong artifact. A hand-written table of observed
failures is a snapshot of one run on one tree, published where nothing re-checks it. Verification
that lives in prose decays into a claim.

## השערות שנבדקו

- The reviewer's premise was right and the fixture rejected on the checksum — **rejected**:
  measured stderr was `telemetry handoff boundary position is invalid`.
- The masking was harmless because the sync succeeded — **rejected**: it succeeded on this tree,
  which is exactly what makes the dependency invisible rather than absent.
- Patching `boundary_position` to `0` on an already-valid bundle is the better fixture —
  **rejected**: that tests a hand-edited manifest field instead of a real boundaryless run flowing
  through the real writer. Keeping the real run and asserting its reason covers both.

## ראיה

Measured every negative case's real stderr before changing anything, rather than reasoning from
the code. Ordering confirmed at `telemetry_handoff.py:344` (checksums) and `:362` (boundary).
CodeRabbit review comment `#discussion_r3709495773` on PR #268; the reviewer subsequently
confirmed the premise was wrong and the underlying risk real.

## רמת ביטחון

High

## איך מזהים מוקדם

When a negative test asserts that something failed, ask which check produced the failure and
whether anything would notice if a different one did. If the fixture perturbs more than one
validated property, or if any setup step is wrapped in `|| true`, `2>/dev/null`, or an ignored
exit status, the test's meaning depends on unobserved state. A per-case reason recorded in a PR
body, a plan, or a comment rather than in an assertion is a claim, not a verification.

## איך מונעים בעתיד

`reject_unchanged` in `scripts/enforcement/tests/test-telemetry-archive.sh` now takes the expected
reason as a required argument and greps it against the importer's real stderr, so all 14 negative
cases prove which check fired. The failure table moved out of the PR body and into the assertions.
The boundary fixture re-syncs unmasked under `set -e`, so a sync failure fails the test instead of
silently changing what the case tests. Making the reason a required parameter — rather than an
optional one — is what stops the next fixture from being added without it.

## טסט רגרסיה

scripts/enforcement/tests/test-telemetry-archive.sh

## סטטוס הבשלה

Verified Lesson

## Applies To Paths

- scripts/enforcement/tests
- scripts/monitoring

## Domain Tags

- testing
- telemetry
- enforcement
- verification

## Prevented Future Issues: 0
