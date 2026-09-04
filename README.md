# Improved-Engineering-OS

A personal engineering knowledge and evidence system with an agent-neutral core.

גרסה חדשה של מערכת עזר לבינה מאלכותית שנועדה להכיל בסיס ידע כדי לשפר תהליך יצירת פרויקט תוכנה.

Git holds canonical code, admitted knowledge, controls and release intent.
Supabase is the evidence plane for what actually happened. Agents execute work;
they are not the source of truth for canonical engineering knowledge. The tool
surface stays narrow on purpose: `resolve`, `inspect`, `expand`, `observe`.

## Status

**Stage 0 — in progress. No stage gate has passed.**

What exists: strict TypeScript on a pinned toolchain, the contract set with its
invariants enforced by schema, the single canonical hashing implementation
(RFC 8785 + a separate normalization layer), deterministic identities, the ports,
architecture fitness rules with honest per-rule status, and the evaluation-harness
foundation. 305 tests.

What does not: no Supabase, no MCP adapter, no launcher, no resolver, no
telemetry runtime, no knowledge assets, no CI, and no real agent trial. The
remaining Stage 0 criteria are listed in the plan below and are open.

## Start here

| Document                                              | What it is                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| [Setup](docs/setup.md)                                | prerequisites, commands, troubleshooting                                  |
| [Architecture for contributors](docs/architecture.md) | boundaries, package map, the rules `core` lives under                     |
| [Stage 0 plan](docs/plan/stage-0-plan.md)             | scope, exact versions, acceptance criteria — met and unmet                |
| [Decision log](docs/decisions/DECISION-LOG.md)        | D18–D36 dispositions, every dependency, measured facts, deviations        |
| [ADRs](docs/adr/)                                     | the architectural decisions and their reasoning                           |
| [Security](SECURITY.md)                               | identities, what is already enforced, residual risks                      |
| [Source documents](docs/README.md)                    | the architecture report and the frozen build guide — the actual authority |

```bash
corepack prepare pnpm@11.25.0 --activate   # Node 24.x required
pnpm install --frozen-lockfile
pnpm check
```

## Two things need the owner's confirmation

Both are recorded as deviations in the decision log, because each relaxes or
interprets frozen text rather than merely implementing it:

- **C-1** — fitness rule F1 as written ("core imports nothing outside itself")
  cannot hold alongside D18.5, which requires Zod inside `core`'s contracts. It
  is implemented as two enforceable clauses.
- **C-6** — D35 lists NFC normalization inside the hashing contract, but RFC 8785
  requires strings to be _preserved_ during canonicalization. They are
  implemented as separate ordered layers so JSON semantics are never silently
  altered.
