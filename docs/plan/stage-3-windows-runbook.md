# Stage 3 qualification host on Windows

Stage 3 personal v1 qualifies the system on the owner's real runtime: native Windows.
WSL is not required. Linux remains an optional stronger profile for future use and CI,
not an owner prerequisite.

## One-time Windows preparation

Use the repository from a normal local Windows path. The workspace pins Node 24.x and
pnpm 11.25.0; CI currently runs Node 24.20.0. The owner qualification should use those
same versions:

```powershell
node --version   # v24.20.0
pnpm --version   # 11.25.0
pnpm install --frozen-lockfile
```

Claude Code and Git must be available from the same PowerShell session.

Validate the host before creating credentials:

```powershell
pnpm stage3:preflight --host-only
```

A ready Windows host reports profile `windows-personal-v1`. The host preflight also
fails closed unless the exact pnpm pin is active, Git Bash can be resolved from the Git
for Windows installation, and the current process can create a directory symlink. The
machine may still show `C:\\Windows\\System32\\bash.exe` first in `where.exe bash`;
the harness resolves Git Bash from `git --exec-path` and supplies it to trial children
without rewriting the system PATH.

If the symlink probe fails with `EPERM`, enable Windows Developer Mode, restart
PowerShell, and rerun the host preflight. A warning that Windows does not provide the
optional Linux PID/network namespace confinement is informational, not a failure. Stage
3 does not claim those unmeasured properties on Windows.

Before any exact-head canary, run the harness suite on the owner machine itself:

```powershell
pnpm vitest run --project harness
```

The target is **0 failed**. This owner-machine run is not interchangeable with GitHub's
Windows runner: the owner's machine has WSL installed, so `C:\\Windows\\System32\\bash.exe`
can shadow Git Bash in a way CI does not reproduce. If the only failures are symlink
`EPERM` failures in `isolation.test.ts`, enable Windows Developer Mode, restart
PowerShell, and rerun the suite. Do not weaken or skip those tests.

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

`supabase/migrations/0003_observation_subject_kind.sql` is also required. It was applied
to the current production Evidence Plane and verified on 17 September 2026. 0001 built
`observations.subject_type` from `(o->'subject')->>'type'`, a key no Agent Contract
producer emits: the contract types the subject as `{kind, id}`. Every real observation
therefore arrived with a NULL `subject_type` and was refused by the column's NOT NULL
constraint -- which is how the earlier live canary failed, with the observations rejected
and the run fail-closed. Check first, read-only:

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
local credentials, an HTTPS ingest endpoint, that the knowledge index exists and is
readable, and performs an authenticated installation `read_minimal health` request
against the live Evidence Plane. This catches network/TLS/installation-token failures
before the one-shot canary. It does not prove the index matches the current
`knowledge/` tree; rebuilding it before qualification does. The canary then proves the
service-token registration path plus durable hook/flush behaviour.

## No-model gate before the paid bank

Run exactly one no-model canary. Keep its evidence outside the repository so the
qualification worktree does not become dirty merely because the canary ran:

```powershell
$canaryDir = Join-Path $env:USERPROFILE "Documents\Codex\stage3-final-canary"
New-Item -ItemType Directory -Force -Path $canaryDir | Out-Null
$canaryPath = Join-Path $canaryDir "canary.json"
pnpm run stage3:canary -- --out $canaryPath
```

Do not automatically retry a failed canary. Preserve its evidence and investigate the
failure first.

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

## Paid campaign matrix and reporting

A fresh paid campaign is one campaign id, one exact repository HEAD, and **22 trials**.
Choose a short campaign id using only ASCII letters, digits, or underscores (maximum
12 characters), and do not reuse an earlier id.

The matrix is fixed before the first paid run:

- primary qualification bank: `guard-fail-closed`, `misleading-clue-merge`,
  `backoff-breaks-a-test`; two `eos` trials each = **6 trials**;
- paired hard bank: `plugin-install-marketplace`, `plan-dod-external-gates`,
  `commit-message-protocol`, `quality-gate-cleanup`; two `eos` and two `native`
  trials each = **16 trials**.

Run every trial at the same exact HEAD. The CLI writes records under
`qualification/evidence/stage-3/<campaign>/`. It refuses to overwrite an existing
trial record/transcript, refuses to mix campaign revisions, checks the owner-host
preflight and knowledge index again before each paid run, records the knowledge-index
digest, Node runtime and Claude Code version, disables Claude Code auto-update inside the
trial, and refuses to write the result if repository HEAD changed while the trial was
running. If HEAD changes after the campaign starts, do not combine the old and new
revisions under one campaign.

Each trial is launched explicitly:

```powershell
node tools/harness/src/stage3-cli.ts --task <task-id> --trial <1-or-2> --campaign <campaign> --arm <eos-or-native>
```

For the three primary tasks, use only `--arm eos`. For each hard-bank task, run trials
1 and 2 in both `eos` and `native` arms. Pre-register the execution order before the
first paid run and balance arm order across repetitions (for example, native→eos for
trial 1 and eos→native for trial 2) so a fixed arm-first ordering does not become a time
or warm-cache confound. No rescue prompt, task-specific EOS coaching, grader change, or
fixture repair is allowed inside a campaign.

After all 22 records exist, generate the campaign-scoped report:

```powershell
node tools/harness/src/stage3-campaign-report-cli.ts --campaign <campaign>
```

The report refuses to mix historical root-level evidence, requires exactly 22 records,
requires one current EOS revision, one qualification profile, one IPC transport, one
knowledge-index digest, one Node 24.x runtime, one Claude Code version, one requested
model and one resolved model, requires unique run/trial ids, and derives the formal
T1-T9 gate from the campaign. It also emits per-trial measurements and paired
cost/wall-clock/tool-call/token vectors without inventing an aggregate score.

Interpret the paired hard bank as a **vector of task-level results**, not one aggregate
score. The three knowledge-discriminating tasks are
`plan-dod-external-gates`, `commit-message-protocol`, and
`quality-gate-cleanup`; each manifest already states its own stopping rule and what
counts as value. `plugin-install-marketplace` is retained as the calibration/noise-floor
task and is not a value discriminator. Do not invent a post-hoc overall threshold after
seeing the results: report each task, cost, wall-clock, tool-call, token, telemetry, and
resolve measurement separately, as required by `docs/budgets.md`.
