# gstack — Behavioral Contract

## Functional Role

gstack is a **role-based virtual engineering team** for Claude Code. It assigns
specialist personas — CEO, Eng Manager, Designer, Reviewer, QA Lead, Security Officer,
Release Engineer, Tech Writer — to distinct phases of the development pipeline. Each
role runs as a slash-command skill that reads prior artifacts (design docs, diffs, PRs)
and produces structured output appropriate to that role's perspective.

The skills chain naturally: `/office-hours` writes a design doc that `/plan-ceo-review`
reads; `/review` catches production bugs that `/ship` verifies before deploy.

## When to use

Invoke gstack skills when:

- Working on a **complex feature or PR** that benefits from structured multi-role review
  (architecture lock-down, design critique, QA validation, security audit, release gate).
- Establishing a **first-time structured workflow** on a project that currently has no
  consistent review or planning discipline.
- Needing an **opinionated second opinion** from a specific role (e.g., run `/cso` before
  merging any security-sensitive change; run `/review` before shipping).
- Running a **full planning pass**: `/office-hours` → `/autoplan` → `/plan-ceo-review` →
  `/plan-eng-review` → code → `/review` → `/qa` → `/cso` → `/ship`.

## When NOT to use

Do not invoke gstack skills when:

- You are **unwilling or unable to install Bun** (v1.0+) and run `./setup` — the
  collection cannot be used without the install step.
- You want a **one-click plugin install** from the marketplace — gstack is not a plugin
  and has no marketplace entry.
- The task is **small or trivial** (one-liner fix, typo, documentation lookup) — the
  multi-role overhead is not warranted.
- A **dedicated Engineering OS skill** already covers the need precisely (e.g., the
  built-in `security-review` skill; see Composition below).

## How it affects Claude's workflow

gstack maps roles onto pipeline phases. A full structured run looks like:

```
1. Planning phase
   /office-hours          → writes a design doc (the shared artifact)
   /autoplan              → generates an implementation plan from the design doc
   /plan-ceo-review       → CEO/Founder reviews product direction and priorities
   /plan-eng-review       → Eng Manager locks architecture before coding starts
   /plan-design-review    → Designer reviews UX/design direction in the plan
   /plan-devex-review     → DevEx review of developer-experience concerns

2. Design / UX phase
   /design-consultation   → structured design dialogue before committing to direction
   /design-shotgun        → rapid parallel design alternatives (diverge before converge)
   /design-html           → generates an HTML prototype for design validation
   /design-review         → Designer audits implementation for AI slop, UX regressions

3. Review phase  (runs last before release)
   /review                → Reviewer finds production bugs and regressions in the diff
   /retro                 → Eng Manager retrospective on the work completed

4. QA phase
   /qa                    → QA Lead opens a real browser and runs end-to-end checks
   /qa-only               → QA checks only, without review or release steps

5. Security phase
   /cso                   → Chief Security Officer runs OWASP + STRIDE audit

6. Release phase
   /ship                  → Release Engineer validates and ships the PR
   /land-and-deploy       → lands the branch and triggers deployment
   /document-release      → Tech Writer produces release notes
   /document-generate     → generates or updates other documentation artifacts

7. Power tools  (available at any phase)
   /browse                → headless browser for research or QA assist
   /connect-chrome        → connects to a local Chrome instance
   /canary                → runs a canary / smoke check against the deployment
   /benchmark             → performance benchmarking
   /careful               → enforces a slower, more deliberate coding mode
   /freeze                → freezes the codebase (blocks accidental edits)
   /guard                 → guards a file or path from modification
   /unfreeze              → releases a freeze
   /pair-agent            → spawns a remote pair-programmer agent (requires ngrok)
   /gstack-upgrade        → upgrades gstack to the latest version
   /setup-deploy          → configures deployment integration
   /setup-gbrain          → configures the optional GBrain memory backend
```

Phases are not strictly sequential — invoke the role commands that match the current
need. The full pipeline above is the maximal structured workflow for complex projects.

## Concrete artifacts you invoke

All commands are slash-command skills invoked directly in Claude Code.

### Planning

| Command | Role / Purpose |
|---------|---------------|
| `/autoplan` | Generates an implementation plan from a design doc or prompt |
| `/office-hours` | CEO/Eng Manager office-hours session; writes a design doc |
| `/plan-ceo-review` | CEO/Founder reviews product direction and priorities in a plan |
| `/plan-eng-review` | Eng Manager locks architecture and technical direction |
| `/plan-design-review` | Designer reviews UX direction in the plan |
| `/plan-devex-review` | Developer-experience review of the plan |

### Design

| Command | Role / Purpose |
|---------|---------------|
| `/design-review` | Designer audits implemented UI for AI slop and regressions |
| `/design-consultation` | Structured design dialogue before committing to direction |
| `/design-html` | Generates an HTML prototype for visual validation |
| `/design-shotgun` | Rapid parallel design alternatives |

### Review

| Command | Role / Purpose |
|---------|---------------|
| `/review` | Reviewer finds production bugs and regressions in the diff |
| `/retro` | Eng Manager retrospective on the completed work |

### QA

| Command | Role / Purpose |
|---------|---------------|
| `/qa` | QA Lead opens a real browser and runs end-to-end validation |
| `/qa-only` | QA checks only, without the review or release steps |

### Security

| Command | Role / Purpose |
|---------|---------------|
| `/cso` | Chief Security Officer — OWASP + STRIDE audit |

### Release

| Command | Role / Purpose |
|---------|---------------|
| `/ship` | Release Engineer validates and ships the PR |
| `/land-and-deploy` | Lands the branch and triggers deployment |
| `/document-release` | Tech Writer produces release notes |
| `/document-generate` | Generates or updates documentation artifacts |

### Power tools

| Command | Role / Purpose |
|---------|---------------|
| `/browse` | Headless browser for research or QA assist |
| `/connect-chrome` | Connects to a local Chrome instance |
| `/canary` | Smoke / canary check against a live deployment |
| `/benchmark` | Performance benchmarking |
| `/careful` | Slower, more deliberate coding mode |
| `/freeze` | Blocks accidental edits to the codebase |
| `/guard` | Protects a specific file or path from modification |
| `/unfreeze` | Releases a `/freeze` |
| `/pair-agent` | Spawns a remote pair-programmer agent (requires ngrok) |
| `/gstack-upgrade` | Upgrades gstack to the latest version in-place |
| `/setup-deploy` | Configures deployment integration |
| `/setup-gbrain` | Configures the optional GBrain memory backend |

## Composition

- **Orchestration / role-simulation:** gstack spans the entire pipeline by mapping
  specialist roles to phases. It is not scoped to a single phase.
- **Security phase:** `/cso` participates in the security gate (OWASP + STRIDE audit)
  but does NOT replace the dedicated `security-review` Engineering OS skill. For
  security-sensitive branches, run the Engineering OS `security-review` skill first;
  `/cso` can serve as an additional role-simulation pass if warranted.
- **Review phase:** `/review` runs last — after planning, implementation, and QA — and
  before `/ship`. It is never invoked before the implementation exists.
- **Precedence:** Engineering OS hooks and quality gates (see
  [`core/hooks-policy.md`](../../core/hooks-policy.md) and
  [`core/quality-gates.md`](../../core/quality-gates.md)) take precedence over any
  gstack role recommendation. A pre-commit hook that blocks a commit is not bypassed
  to satisfy `/ship`.
