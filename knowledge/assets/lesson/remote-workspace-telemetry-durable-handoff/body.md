# Remote workspace telemetry requires a durable handoff

## מה קרה

Two real Project 8 runs produced successful product pull requests and valid CI-generated Operational Work History, but the final artifact reported `telemetry_available=false` and `telemetry_events_count=0`. The second run had already passed the local session preflight, so local readiness created a false sense that the later CI artifact would contain the same events.

During repair, several related false-green and false-negative paths were reproduced:

- a stale local sync could bind a newer remote provisional bundle to the exact PR but leave local `handoff-state.json` provisional;
- CI could trust a PR-controlled telemetry policy instead of the exact base policy;
- scalar secrets nested inside JSON arrays bypassed the metadata-only scan;
- noncanonical repository identity, custom telemetry source paths, and `best_effort` policy behavior could diverge between recording, export, sync, and preflight;
- strict exact-head validation rejected a valid remote bundle after the product branch advanced to a descendant commit;
- a shallow checkout could report a missing ancestor object as unrelated history and block a valid head advance;
- a stale workspace could otherwise overwrite telemetry already associated with a newer descendant product head;
- lexicographic `(event_count, boundary_position)` comparison could accept more local events while silently lowering the latest completed lifecycle boundary;
- a manifest could overstate `boundary_position` without a matching lifecycle event because the manifest itself was not covered by the event checksum;
- export from a caller-selected telemetry file copied unknown top-level and nested fields because the privacy check was denylist-based rather than schema-allowlisted;
- malformed UTF-8 could be replaced before privacy validation, changing sensitive input before it was scanned;
- concurrent hook writers could collide on the shared `handoff-state.json.tmp` path after a successful remote push;
- PR CI history was filtered locally after an upstream capped query;
- merge readiness trusted PR-body prose rather than live review-thread state.

## שורש הבעיה

Claude Code web recorded metadata-only events into a gitignored file inside its remote workspace. GitHub Actions generated Operational Work History from a separate clean checkout. No durable transport copied or correlated the local run into the CI workspace. The lifecycle webhook only closed the subscription; it did not carry the telemetry bundle.

The follow-on defects came from treating delivery as a single local-state check instead of an end-to-end contract. Policy, repository identity, telemetry source paths, text decoding, remote bundle integrity, product-head ancestry, PR binding, lifecycle progress, local durable-state concurrency, export schema, CI selection, and live review state were validated in different places with inconsistent assumptions.

The product-head variant was especially subtle: exact-head selection is correct in CI, but sync must first validate an existing remote bundle independently of the current head, then allow replacement only when its head is the same commit or an ancestor of the current product head. A descendant or unrelated remote head must fail closed to prevent stale downgrade. In a shallow checkout, an ancestry lookup error is not proof of unrelated history; the implementation must perform a bounded history fetch and retry before classifying the graph.

Telemetry progress is a partial order, not a lexicographic tuple. A bundle with more events but an older completed boundary is incomparable with the remote bundle and must fail closed rather than overwrite either dimension. The stored boundary must also equal the boundary recomputed from the validated event stream. Privacy is a positive contract: an exported event must be reconstructed from an explicit schema allowlist, and every telemetry text source must decode as strict UTF-8 before scanning. A denylist scanner remains a secondary safeguard, not permission to copy arbitrary caller-supplied fields.

Local state persistence is part of the delivery contract. Atomic rename is insufficient when all writers share one temporary path; each writer needs a unique temporary file in the destination directory before replacing the durable state file.

## השערות שנבדקו

- The hooks did not run — rejected for the second run because local preflight and session lifecycle behavior were present.
- Operational Work History discarded available telemetry — rejected because the collector accepts an explicit telemetry file and correctly reported unavailable when the clean checkout had none.
- The session-close webhook delivered telemetry — rejected because no exported bundle or non-zero event artifact existed after closure.
- The workspaces lacked a durable bridge — confirmed by comparing the remote local-only recorder path with the clean CI checkout and reproducing the boundary in a bare-Git simulation.
- A stale sync only affected remote event ordering — rejected after reproducing correct remote exact binding with stale local durable state.
- Exact current-head validation was required for every sync read — rejected because it blocked a normal descendant commit before the existing bundle could be safely replaced.
- Every non-zero `merge-base --is-ancestor` result meant unrelated history — rejected because shallow clones return lookup errors when the older object is absent.
- Comparing `(event_count, boundary_position)` lexicographically preserved monotonic progress — rejected by a remote `3/2` versus local `4/1` reproduction that downgraded the completed boundary.
- A boundary value within `event_count` was trustworthy — rejected after a manifest-only edit overstated completed lifecycle progress while events and checksums remained unchanged.
- Metadata denylist validation was sufficient for a custom event source — rejected after arbitrary unknown fields survived export without matching a forbidden-key pattern.
- Replacement decoding was harmless before privacy validation — rejected because malformed bytes can change a secret-like value before the scanner sees it.
- A fixed `.tmp` path was safe because the final rename was atomic — rejected by a coordinated two-writer reproduction where one writer removed the other's temporary file.
- `gh api --paginate` guaranteed complete PR history — rejected because the upstream filtered search can be capped before client-side PR selection.
- A configured `best_effort` mode could reuse the required preflight unchanged — rejected because missing durable state then blocked the next tool call.
- The exporter automatically followed the same custom source paths as the recorder — rejected until `EOS_TELEMETRY_FILE` and `EOS_TELEMETRY_RUN_ID_FILE` were propagated consistently.

## ראיה

- Project 8 PR #6 artifact `operational-work-history-6-29245891365` retained 38 workflow runs and 15 historical failures while reporting zero session events.
- `scripts/enforcement/tests/test-remote-telemetry-handoff.sh` proves separate-workspace persistence, exact clean-checkout selection, trusted-policy enforcement, privacy and checksum rejection, canonical identity, monotonic remote progress, local exact-state convergence, and conflicting-PR rejection.
- `scripts/enforcement/tests/test-telemetry-policy-and-path-overrides.sh` proves `best_effort` remains nonblocking, `required` remains fail-closed, and custom event/run-id paths are exported without silently reading default files.
- `scripts/enforcement/tests/test-telemetry-head-advancement.sh` proves stale local state is rejected after a commit, a validated ancestor-head bundle can advance to the current descendant head, and a stale product head cannot downgrade a newer remote bundle.
- `scripts/enforcement/tests/test-telemetry-shallow-head-ancestry.sh` proves a missing ancestor object in a shallow checkout is resolved through a bounded fetch before graph classification.
- `scripts/enforcement/tests/test-telemetry-progress-ordering.sh` proves event count and lifecycle-boundary position advance independently and incomparable progress cannot overwrite the validated remote bundle.
- `scripts/enforcement/tests/test-telemetry-boundary-validation.sh` proves manifest lifecycle progress must equal the boundary recomputed from the event stream.
- `scripts/enforcement/tests/test-telemetry-export-allowlist.sh` proves custom sources retain only the approved telemetry schema and strip unknown top-level, resource, status, attribute, nested-path, and span-event fields, with sensitive sentinels absent from the complete serialized export.
- `scripts/enforcement/tests/test-telemetry-invalid-utf8.sh` proves malformed UTF-8 is rejected in bundle events, bundle summaries, custom export events, and custom run-id files.
- `scripts/enforcement/tests/test-telemetry-state-atomic-write.sh` proves concurrent durable-state writers do not share or remove each other's temporary files.
- `scripts/enforcement/tests/test-live-review-threads.sh` proves unresolved current and outdated threads are blocked from readiness.
- `scripts/enforcement/tests/test-pr-policy-workflow-wiring.sh` requires trusted exact-base policy resolution and a server-side PR-created-at bound before local PR filtering.
- `apply-final-telemetry-fix-v2` run `29508718994` applied the final runtime repair, passed the seven focused telemetry regressions, removed both temporary helper workflows, and produced application head `4e7f9d1faa0d6018e8d22ead60d0e42bf23230fe`.
- Earlier `telemetry-handoff-tests` run `29501895601` passed the named remote handoff, policy/path override, product-head advancement, progress-ordering, export-allowlist, and live-thread stages on application head `b8f974a35b780b960afbbe7db8aa8f0dae18216f`.
- Earlier `enforcement-tests` run `29501895512` passed the complete suite on the same application head.
- Live `pr-policy` run `29464405759` accepted the bounded query and generated OWH containing 737 PR-associated workflow runs before the live-thread gate blocked the outstanding thread.

## רמת ביטחון

High

## איך מזהים מוקדם

Treat these states as explicit failures before starting a real target task:

- local events exist but no durable handoff state exists in `required` mode;
- `best_effort` unexpectedly blocks tool execution after a transport failure;
- recording validates one telemetry path while export reads another;
- a telemetry events, summary, or run-id source is not valid UTF-8;
- exported telemetry contains a key or nested field outside the approved schema allowlist;
- repository identity is not canonical `owner/repo`;
- a fetched remote bundle has not passed schema, checksum, JSONL, privacy, run, repository, branch, and PR-binding validation;
- stored lifecycle-boundary progress differs from the boundary recomputed from validated events;
- ancestry lookup fails because required commit objects are absent from a shallow checkout;
- the remote product head is a descendant of or unrelated to the local product head;
- the current product head advanced but local telemetry progress is behind the validated ancestor-head remote bundle;
- local and remote event/boundary progress each lead in a different dimension;
- two state writers attempt to reuse the same temporary path;
- CI has no exact PR/head-matched telemetry bundle;
- the remote bundle is exact but local durable state is still provisional or bound elsewhere;
- the same run attempts to bind to a second PR;
- OWH reports zero events for a telemetry-required target;
- CI history retrieval has no server-side time/head bound before client-side filtering;
- review readiness claims resolved threads while GitHub still returns any unresolved thread.

## איך מונעים בעתיד

- Persist metadata-only telemetry outside the ephemeral Claude workspace during SessionStart and every terminal boundary.
- Resolve repository identity canonically and fail closed when `owner/repo` cannot be established.
- Read handoff policy from the exact trusted base SHA in CI, never from the PR-controlled checkout.
- Use the same explicit event and run-id source paths for validation, export, sync, and readiness.
- Decode events, summaries, and run identifiers as strict UTF-8 before sanitization or privacy validation.
- Reconstruct every exported event from an explicit top-level and nested schema allowlist; use sensitive-pattern scanning only as defense in depth.
- Keep `best_effort` nonblocking and `required` fail-closed through both sync and preflight.
- Validate every fetched bundle completely before trusting progress or PR binding.
- Recompute lifecycle-boundary position from validated events and require exact agreement with the manifest.
- Match CI bundles by repository, PR number, source-branch hash, and exact head SHA.
- During sync, distinguish same, ancestor, descendant, unrelated, and lookup-failed product heads: perform bounded fetch/retry for missing objects, permit safe ancestor advancement, reject stale descendant downgrade, and fail closed on unresolved or unrelated history.
- Compare event and lifecycle-boundary progress independently; reject incomparable states and never reduce either validated dimension.
- Preserve the greater validated remote event/boundary progress and never overwrite it with stale local data.
- Treat exact PR binding as immutable for a run and return the effective remote binding from every sync path.
- Persist local durable state after every successful remote outcome using a unique same-directory temporary file per writer before atomic replacement.
- Scan scalar values inside arrays as well as dictionaries for sensitive patterns.
- Feed only the exact selected bundle to Operational Work History and upload it for archive import.
- Bound workflow-run retrieval server-side from PR creation, then retain exact local PR-number filtering.
- Query live GitHub review threads and fail closed instead of trusting PR-body prose.
- Keep high-risk regressions as named CI stages with explicit job and network-operation timeouts so failures are isolated before broad reruns.

## טסט רגרסיה

- `scripts/enforcement/tests/test-remote-telemetry-handoff.sh`
- `scripts/enforcement/tests/test-telemetry-policy-and-path-overrides.sh`
- `scripts/enforcement/tests/test-telemetry-head-advancement.sh`
- `scripts/enforcement/tests/test-telemetry-shallow-head-ancestry.sh`
- `scripts/enforcement/tests/test-telemetry-progress-ordering.sh`
- `scripts/enforcement/tests/test-telemetry-boundary-validation.sh`
- `scripts/enforcement/tests/test-telemetry-export-allowlist.sh`
- `scripts/enforcement/tests/test-telemetry-invalid-utf8.sh`
- `scripts/enforcement/tests/test-telemetry-state-atomic-write.sh`
- `scripts/enforcement/tests/test-live-review-threads.sh`
- `scripts/enforcement/tests/test-pr-policy-workflow-wiring.sh`
- `scripts/enforcement/tests/test-install-policy-gate-coverage.sh`

## סטטוס הבשלה

Verified Lesson

## Prevented Future Issues: 0
