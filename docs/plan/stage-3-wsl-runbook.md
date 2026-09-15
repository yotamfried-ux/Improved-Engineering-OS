# Stage 3 qualification host on Windows

Stage 3 qualification is intentionally Linux-only because T3 is proved with rootless user, mount, PID and network namespaces. A Windows owner should run the qualification host inside WSL2 Ubuntu rather than weaken the isolation contract.

## One-time WSL2 host preparation

Keep the repository inside the WSL Linux filesystem (for example `~/src/Improved-Engineering-OS`) rather than under `/mnt/c` when practical. Then install the namespace tools:

```bash
sudo apt-get update
sudo apt-get install -y slirp4netns iproute2 iptables util-linux git
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
