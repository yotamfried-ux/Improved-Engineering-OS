# SQLite qualification on win32 — CI transcript

Evidence for open item **O-4** and Stage 0 criterion **B7**: the seven recorded
acceptance checks, executed against `node:sqlite` on a Windows runner.

## Provenance

| Field                | Value                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Repository commit    | `5639572` (`claude/hopeful-curie-h5jqf5`, PR #1)                                                                  |
| Workflow run         | [33953023783](https://github.com/yotamfried-ux/Improved-Engineering-OS/actions/runs/33953023783)                  |
| Job                  | `windows smoke (D35 cross-platform digest)`, id `101271307843`                                                     |
| Runner               | GitHub Actions `windows-latest`, Node 24.20.0, pnpm 11.25.0                                                        |
| Command              | `pnpm sqlite:qualify` (`node tools/sqlite-qualification/src/cli.ts`)                                               |
| Date                 | 2026-09-05                                                                                                        |
| Uploaded artifact    | `windows-sqlite-qualification`, id `9965471126`, 1148 bytes, zip `sha256:e767942f72496fff59e8035e0f05980bd7d15bde38a68de23d23c2b7319d87e5` |

## Why this is a transcript and not the JSON artifact

The job uploaded `qualification/evidence/sqlite-qualification.json` as the
artifact named above. That artifact **could not be downloaded into the session
that wrote this file**: GitHub redirects artifact downloads to
`*.blob.core.windows.net`, which this environment's egress policy denies
(`CONNECT tunnel failed, 403`).

So what is recorded below is the runner's own stdout, copied verbatim from the
job log, rather than a JSON file reconstructed by hand. A hand-built JSON would
look machine-generated and would invite a later reader to trust it as tool
output; this does not. The artifact remains the primary record until it expires
(2026-12-04), and the run is permanently addressable at the URL above.

## Verbatim excerpt

```
$ node tools/sqlite-qualification/src/cli.ts
better-sqlite3 was not resolvable, so its checks were NOT executed here.
It is deliberately not a dependency of this repository: adding it would be adopting a
candidate in order to qualify it. Point at an installation with
  pnpm sqlite:qualify --better-sqlite3 <path>/node_modules/better-sqlite3/lib/index.js

node:sqlite (binding 24.20.0, engine 3.53.4) on win32
  PASS       1. engine version measured at runtime, not inferred from a package version
      node:sqlite reports sqlite_version() = 3.53.4, source_id = 2026-07-24 19:02:57 bf7c7f30031888f4e796e429ab3978879485813aaca6f641c7b33e4e09459bcc
  PASS       2. engine >= 3.51.3 (R3 WAL corruption fix)
      3.53.4 vs required 3.51.3
  PASS       3. journal_mode = wal on a real file database
      on win32: pragma returned "wal", read back "wal", -wal sidecar present: true. Required platforms: linux, win32; this run observed win32 only.
  PASS       4. busy handling: two writers, timeout >= 5000 ms, no SQLITE_BUSY surfaced
      second writer waited 1240 ms for the lock and then committed; no SQLITE_BUSY reached the caller
  PASS       5. WAL truncation under a concurrent reader
      wal bytes 2080632 -> 0; pragma wal_checkpoint(truncate) returned {"busy":0,"log":0,"checkpointed":0}; concurrent reader saw 500 rows before and 500 after
  PASS       6. UNIQUE(event_id) collision absorbed as a no-op
      after a duplicate insert: 1 row(s), first write preserved (payload=a); control -- a plain duplicate insert still raises: true
  PASS       7. the same input builds a reproducible index (F8)
      logical content digest stable: true (sha256:f64a785113eefc0b); raw database file byte-identical: true.
  all checks passed on win32: true
  QUALIFIED (all checks on all required platforms linux + win32): false

evidence written to qualification/evidence/sqlite-qualification.json
```

## Reading this correctly

- `QUALIFIED: false` is **not** a failure. A single run observes a single
  platform, so no single run can satisfy a two-platform criterion. The field is
  deliberately conjunctive over `platformsRequired`, and it stays `false` here
  by construction.
- Cross-platform coverage for `node:sqlite` is therefore asserted **across two
  runs** — this one for win32, and the Linux run recorded in
  `sqlite-qualification.json` — and stated as such in the decision log, rather
  than being synthesised into a field that no measurement supports on its own.
- Check 4 waited **1240 ms**, so the two writers genuinely contended. A near-
  zero wait would have meant the check proved nothing, and it is asserted as a
  failure in that case.
- `better-sqlite3` reports itself **not executed** here rather than being
  silently omitted. Its win32 coverage remains unobserved.
