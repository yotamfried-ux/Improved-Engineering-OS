# Stage 3 qualification host on Windows

Stage 3 personal v1 qualifies the system on the owner's real runtime: native Windows.
WSL is not required. Linux remains an optional stronger profile for future use and CI,
not an owner prerequisite.

## One-time Windows preparation

Use the repository from a normal local Windows path. The workspace pins Node 24.x; CI
currently runs Node 24.20.0. Confirm the toolchain and install the workspace:

```powershell
node --version
pnpm --version
pnpm install --frozen-lockfile
```

Claude Code and Git must be available from the same PowerShell session.

Validate the host before creating credentials:

```powershell
pnpm stage3:preflight --host-only
```

A ready Windows host reports profile `windows-personal-v1`. A warning that Windows does
not provide the optional Linux PID/network namespace confinement is informational, not a
failure. Stage 3 does not claim those unmeasured properties on Windows.

## Canonical owner identity

Both qualification principals belong to one real Supabase Auth owner. Use the UUID of
that Auth user; do not reuse or infer a historical `owner_id` from revoked evidence.

If no owner user exists yet, create the dedicated owner in Supabase Auth first and copy
only its UUID. The UUID is an identifier, not a credential.

## Local-only qualification credentials

On the trusted Windows host, create the installation and Harness service credentials:

```powershell
pnpm ieos auth enroll --owner <supabase-auth-user-uuid>
pnpm stage3:service-auth enroll --owner <supabase-auth-user-uuid>
```

The raw tokens remain in `.ieos/credentials.json` and `.ieos/harness-service.json`.
Never copy raw tokens into chat, Git, SQL, telemetry, or trial evidence. Apply only the
hash-bearing SQL printed by the enrolment commands to the Evidence Plane.

The two principals have deliberately separate authority:

- the installation principal holds only the D22 ingest scopes;
- the Harness service principal holds exactly `run.register` for Stage 3 registration.

## Evidence Plane prerequisite

`supabase/migrations/0002_bind_evidence_to_run_owner.sql` enforces the D36 owner-binding
invariant with composite foreign keys. Before qualifying a new Evidence Plane, confirm
the constraint exists:

```sql
select conname from pg_constraint where conname = 'runs_run_id_owner_unique';
```

The current production Evidence Plane had this migration applied and verified on
15 September 2026. Do not reapply it if the constraint already exists.

`supabase/migrations/0003_observation_subject_kind.sql` must also be applied, and as of
this writing it has not been. 0001 built `observations.subject_type` from
`(o->'subject')->>'type'`, a key no Agent Contract producer emits: the contract types the
subject as `{kind, id}`. Every real observation therefore arrived with a NULL
`subject_type` and was refused by the column's NOT NULL constraint -- which is how the
first live canary on this machine failed, with the observations rejected and the run
fail-closed. Check first, read-only:

```sql
select position('''kind''' in pg_get_functiondef('public.ingest_observations(bytea,jsonb)'::regprocedure)) > 0 as has_0003;
```

When that returns `true` the migration is already applied: do not reapply it. When it
returns `false`, apply `supabase/migrations/0003_observation_subject_kind.sql` in the
Supabase SQL Editor, then re-run the check and confirm it has become `true`. The
migration is a `create or replace` of one function, so it keeps that function's owner and
the grants 0001 gave it, and it changes nothing else in the schema.

## Knowledge index

The MCP server a trial starts reads the compiled knowledge index, `knowledge.sqlite`. It
is a gitignored build artifact, so a fresh checkout has none. Build it at the exact HEAD
you will qualify, and rebuild it whenever `knowledge/` changes:

```powershell
pnpm build:index
```

## Full preflight

Set the live ingest endpoint in PowerShell and validate the complete configuration:

```powershell
$env:IEOS_INGEST_URL = "https://<project-ref>.supabase.co/functions/v1/ingest"
pnpm stage3:preflight
```

The full preflight must pass before the canary. It checks the platform/toolchain, both
local credentials, an HTTPS ingest endpoint, and that the knowledge index exists and is
readable. It does not prove the index matches the current `knowledge/` tree; rebuilding
it before qualification does. The real canary then proves authenticated Evidence Plane
reachability.

## No-model gate before the paid bank

Run exactly one no-model canary:

```powershell
pnpm stage3:canary
```

On Windows, the host exposes Evidence Plane ingest through a Windows named pipe. The
agent/canary child receives the pipe address but not the installation token, Harness
service token, or Supabase privileged credentials.

The canary must prove:

- run registration is confirmed before the first event;
- the child environment is built from the explicit allowlist;
- host-only credentials do not propagate by name or raw value;
- host-proxy IPC is the selected named pipe;
- hooks receive durable Evidence Plane acknowledgement;
- terminal flush succeeds with `flush_ever_failed=false`;
- the local outbox drains to zero;
- `telemetry_state=COMPLETE`;
- `qualification_eligible=true`.

Windows personal v1 intentionally does not claim PID, network, or host-filesystem kernel
confinement. T3 reports that limitation explicitly instead of inferring a sandbox that is
not present.

Do not start the 22 paid Stage 3 trials until this canary evidence has been reviewed at
the exact repository HEAD and the owner explicitly approves the paid bank.
