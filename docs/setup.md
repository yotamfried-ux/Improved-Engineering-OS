# Setup

## Prerequisites

Install these explicitly. **Having an AI coding tool installed does not mean you
have the required runtime** — Codex ships standalone native binaries, so the
guide's "Node is present wherever the agents run" inference does not hold
(research finding R4, ADR-0002).

| Tool    | Required version                    | Why exactly this                                                                        |
| ------- | ----------------------------------- | --------------------------------------------------------------------------------------- |
| Node.js | `24.x` (verified against `24.20.0`) | D18.1. `engines.node` + `engineStrict`, so pnpm refuses to install under anything else. |
| pnpm    | `11.25.0`                           | D18.6. Pinned through both `packageManager` and `devEngines.packageManager`.            |

```bash
# Node 24: use your version manager, or nodejs.org. Verify the download digest
# against the release's own SHASUMS256.txt -- this repository did.
node --version        # expect v24.x

# pnpm, via corepack (ships with Node)
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm --version        # expect 11.25.0
```

## Install and verify

```bash
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` runs, in order: the toolchain doctor, `tsc --noEmit`, the
contract-schema staleness check, and the full test suite. If any step fails it
stops there, and the failure names both what it found and what it required.

## Commands

| Command                             | What it does                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm ieos-doctor`                  | Validates Node and pnpm against the pins. Named `ieos-doctor` because `pnpm doctor` is a built-in pnpm command that would shadow it. |
| `pnpm typecheck`                    | Strict TypeScript over every package and test.                                                                                       |
| `pnpm test`                         | The whole suite: core, harness, contracts-gen, fitness.                                                                              |
| `pnpm fitness`                      | Just the architecture invariants (F1–F12).                                                                                           |
| `pnpm contracts:emit`               | Regenerates `contracts/schemas/` from `packages/core`.                                                                               |
| `pnpm contracts:check`              | Fails if the committed schemas differ from what the contracts produce.                                                               |
| `pnpm format` / `pnpm format:check` | Prettier.                                                                                                                            |

## After changing a contract

`contracts/schemas/*.schema.json` is committed and diffed, so a contract change
is a two-step edit:

```bash
# 1. edit packages/core/src/contracts/*.ts
pnpm contracts:emit
# 2. commit the regenerated schemas alongside the contract change
```

CI fails on any drift between the two. That is deliberate: the emitted schema is
the artifact other systems will validate against, and a silent divergence between
it and the contract is the kind of thing nobody notices until something rejects
valid data.

## Troubleshooting

**`ERR_PNPM_UNSUPPORTED_ENGINE`** — you are on the wrong Node major.
`engineStrict` is on precisely so this fails at install rather than surfacing
later as a confusing runtime error.

**`pnpm ieos-doctor` says pnpm is the wrong version** — the pin is exact.
`corepack prepare pnpm@11.25.0 --activate`.

**`contracts/schemas is out of date`** — run `pnpm contracts:emit` and commit the
result.

**A fitness check fails** — the message names the file, the line and the matching
text. If the occurrence is legitimate, add an entry to `fitness/allowlist.yaml`
**with a reason**; a test asserts every entry has one, because an allowlist entry
without a reason is just a hole.

## Platform status

Everything above is verified on **Linux x64 only**. No Windows or macOS
verification has been performed, and the Linux + Windows-smoke CI the guide
requires (D18.3) does not exist yet. The D35 cross-platform hashing gate is
therefore **not** claimed — see `docs/plan/stage-0-plan.md` §7, B1.

The rules that make cross-platform correctness likely are in force from day one:
`.gitattributes` normalizes line endings to LF, `path.join` is used everywhere,
there are no shell scripts in runtime paths, and text is LF-normalized before
hashing so the same asset digests identically wherever it was checked out.
