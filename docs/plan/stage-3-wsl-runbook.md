# Stage 3 qualification host on Windows

Stage 3 qualification is intentionally Linux-only because T3 is proved with rootless user, mount, PID and network namespaces. A Windows owner should run the qualification host inside WSL2 Ubuntu rather than weaken the isolation contract.

## One-time WSL2 host preparation

Keep the repository inside the WSL Linux filesystem (for example `~/src/Improved-Engineering-OS`) rather than under `/mnt/c` when practical. Then install the namespace tools:

```bash
sudo apt-get update
sudo apt-get install -y slirp4netns iproute2 iptables util-linux git
```

The repository pins `engines.node` to `24.x` and CI runs `24.20.0`. A WSL image that ships an older Node makes `pnpm install` refuse the workspace outright, so confirm the toolchain before running the host checks:

```bash
node --version   # must report v24.x
```

Validate the host before creating credentials:

```bash
pnpm stage3:preflight --host-only
```

The command fails closed on native Windows, missing tools, or a host that cannot create the rootless user/network/mount namespace set used by `ns-trial.sh`.

## Local-only qualification identities

On the trusted WSL host, create the installation and Harness service credentials:

```bash
pnpm ieos auth enroll --owner <supabase-auth-user-uuid>
pnpm stage3:service-auth enroll --owner <supabase-auth-user-uuid>
```

The raw tokens remain in `.ieos/credentials.json` and `.ieos/harness-service.json`. Apply only the hash-bearing SQL printed by those commands to the Evidence Plane. Do not copy raw tokens into chat, Git, SQL, or logs.

## Evidence Plane schema prerequisite

`supabase/migrations/0002_bind_evidence_to_run_owner.sql` is the D36 invariant that stops evidence written by one owner's installation from inheriting classification from another owner's pre-registered Run. It is enforced by composite foreign keys rather than by any single ingest function, so a plane without it accepts cross-owner classification borrowing no matter how correct the client is.

Confirm the constraint exists on the target project before qualifying against it:

```sql
select conname from pg_constraint where conname = 'runs_run_id_owner_unique';
```

If that returns no row, apply `0002` before the canary. The migration fails closed on pre-existing inconsistent data rather than grandfathering it in, so apply it on a plane whose evidence is already owner-consistent.

Set the live ingest endpoint and validate the complete local configuration:

```bash
export IEOS_INGEST_URL="https://<project-ref>.supabase.co/functions/v1/ingest"
pnpm stage3:preflight
```

## No-model gate before the paid bank

Only after the full preflight passes, run:

```bash
pnpm stage3:canary
```

The canary launches no model. It must prove pre-registration, the declared AF_UNIX mount, all four isolation boundaries, durable Evidence Plane acknowledgement, an empty local outbox, `telemetry_state=COMPLETE`, and `qualification_eligible=true`.

Do not start the 22 paid Stage 3 trials until the canary evidence has been reviewed at the exact repository HEAD.
