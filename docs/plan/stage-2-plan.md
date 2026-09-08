# Stage 2 — Seed knowledge, resolver, telemetry, Evidence Plane

**Status: built; gate not yet closed.** The gate is closed only by a
harness-generated report in `qualification/reports/`, produced by CI from
two platform records. Nothing in this document can close it, and this
document is one of the things the report is meant to be able to contradict.

## What the guide asks for

> Just enough knowledge and observability for one honest real task.

Deliverables: 10–20 hand-selected assets through the C-04 bootstrap path;
`resolver` v1 over the index with the Champion from the release index
including the `unresolved` path; the minimal evidence kernel (T-03);
`telemetry` v1; `supabase/migrations/0001_*.sql`; `supabase/functions/ingest`
per D22 with the D22.6 invariants; `ieos auth enroll|rotate|revoke`; adapter
hooks for the **primary agent only** (Q-09); `register_run` and the harness
service principal (D36); `scores-snapshot.ts` switching from bootstrap to the
real Evidence Plane read.

Exit gate additions: no Supabase key with authority on the client; coding
never blocked by an ingest outage; `INCOMPLETE` runs visible in
`ieos doctor --last-run`.

## The eleven rows

| Row | Requirement                                                                                 | Rests on                                                |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| H1  | 10–20 assets with the required mix, through C-04                                            | the committed tree, **counted**, plus three named tests |
| H2  | resolver v1 over the real corpus; Champion from the release index, unresolved path included | 4 named tests                                           |
| H3  | telemetry v1: envelope, allowlist, WAL outbox, boundary flush                               | 4 named tests                                           |
| H4  | evidence-derivation v0 replays; `ieos investigate` shows the raw timeline                   | 5 named tests                                           |
| H5  | the Evidence Plane enforces D36 and the D22 boundary                                        | 5 named tests, **executed against PostgreSQL**          |
| H6  | `ieos auth enroll\|rotate\|revoke`                                                          | 3 named tests                                           |
| H7  | hooks never return the blocking exit code; only allowlisted attributes                      | 2 named tests                                           |
| H8  | exit gate: no client-side key with authority                                                | 4 named tests                                           |
| H9  | exit gate: coding never blocked by an ingest outage                                         | 4 named tests                                           |
| H10 | exit gate: `INCOMPLETE` runs visible in `ieos doctor`                                       | 2 named tests                                           |
| H11 | F1–F12 under the C-10 reading                                                               | the shared fitness judgement                            |

Rows rest on **named** tests rather than on counts or project names, so a
renamed or deleted test makes its row `unproven` instead of quietly emptying
it. H1 is measured instead: "13 assets with this mix" is a fact about the
repository, and a test asserting it would only add a second place for the two
to disagree.

## Where this stage relaxes something, and why

**H5 and H8 pass on one platform.** Stage 0 and Stage 1 required both, and
this is the one place Stage 2 does not. Each has a reason about its subject
rather than about convenience:

- H5's subject is the database. CI provides PostgreSQL on Linux and not on
  Windows, and SQL behaviour is not platform-dependent in the way a filesystem
  is. The win32 record still carries the tests as `skipped`, so the report says
  "unproven on this platform" rather than omitting them.
- H8's subject is the repository's own source text, which is byte-identical on
  both platforms.

In both cases a `failed` anywhere still fails the row: "proven somewhere" is a
reading of absence, never of a contradiction. Negative controls in
`tools/qualification-report/test/stage2.test.ts` hold all three properties —
passes when skipped elsewhere, fails when failed anywhere, unproven when no
platform ran it — and a fourth control proves a row _not_ on the list is not
relaxed by accident.

## What is deliberately not done

**Hooks are opt-in.** D18.4 fixes the footprint at six paths and closes with
"Nothing else lands in the project". A hook is a seventh, and it is a command
that runs on every tool call in someone else's repository. `ieos init
--with-hooks` is the owner saying yes; the default footprint stays exactly the
closed list. `ieos doctor` reports when none are registered.

**`candidates`, `promotion_proposals` and the proposal RPCs.** Stage 10's.
An empty table with a stub RPC would answer "no proposals" to a caller who
could not tell that from "not implemented here".

**Nothing is deployed.** Executing the migration and the function against
PostgreSQL proves their behaviour. It does not prove they work on Supabase,
whose platform supplies `auth.uid()`, the `service_role` identity and the Edge
runtime. That is UNPROVEN until the owner's Pro project exists (D30) and a
deploy runs. **The Stage 2 gate does not claim otherwise**: no row asserts a
deployed plane, and one that did would be the kind of false PASS this
repository is built to refuse.

**No real-agent trial.** That is Stage 3, and the guide is explicit that if
the vertical slice is not natural, everything from Stage 4 waits. The harness
now refuses to call a trial qualification evidence unless the Evidence Plane
confirmed its registration — so with no plane enrolled, no trial is
qualification evidence, which is the truthful state rather than a blocker
worked around.

## Deviations recorded in this stage

**C-11** — `packages/adapters/cli` may import `packages/evidence-derivation`,
which guide §3's composition set puts on the server side, because Stage 2's own
deliverables require `ieos investigate` to derive locally from the outbox. One
directory wide, enforced as its own dependency-cruiser rule with controls
proving it still fires for `adapters/mcp`.
