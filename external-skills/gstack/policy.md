# gstack — Orchestration Policy

## Classification

| Field       | Value                                                          |
|-------------|----------------------------------------------------------------|
| Type tags   | orchestration, role-simulation, planning, review, qa, security |
| Source repo | https://github.com/garrytan/gstack                             |
| Install     | git clone + `./setup` (NOT a marketplace plugin)               |

## Execution Level

**LEVEL 1 — recommended, use selectively for complex projects**

Trigger condition (both must be true):

1. The project is **non-trivial** — a real feature, a substantial PR, a new service, or
   any work that benefits from structured multi-role review (architecture, design, QA,
   security, or release validation).
2. gstack is **installed** in the current environment (`~/.claude/skills/gstack` exists
   and skills are symlinked; see [activation.md](./activation.md)).

LEVEL 1 means: when the trigger condition is met, invoking the relevant gstack role
commands is **recommended but not mandatory**. Select the commands that match the
current phase; do not force the full pipeline onto small tasks.

## Composition rules

1. **Role commands slot into their pipeline phase.** Planning commands (`/autoplan`,
   `/office-hours`, `/plan-*-review`) run before implementation begins. Review commands
   (`/review`) run after implementation and QA. Release commands (`/ship`,
   `/land-and-deploy`) run last. Do not invoke a downstream-phase command before its
   upstream prerequisites are done.

2. **`/cso` participates in the security gate but does NOT replace the dedicated
   `security-review` skill.** The Engineering OS `security-review` skill is the
   authoritative security gate for this repository. `/cso` adds an OWASP + STRIDE
   role-simulation pass and may complement `security-review`, but it cannot substitute
   for it on security-sensitive branches. If there is any conflict between `/cso`
   output and the `security-review` skill's findings, the `security-review` findings
   take precedence.

3. **`/review` runs in the review phase — last before `/ship`.** It is never invoked
   before implementation exists, and never used to bypass the Engineering OS pre-commit
   hooks or quality gates.

4. **Never override the security-level gate.** Engineering OS hooks defined in
   [`core/hooks-policy.md`](../../core/hooks-policy.md) and quality gates in
   [`core/quality-gates.md`](../../core/quality-gates.md) are deterministic and cannot
   be bypassed by a gstack role recommendation. If a hook blocks an action, treat the
   block as valid; fix the underlying issue rather than using `/ship` or `/careful` to
   work around it.

5. **Platform choices remain the user's decision.** gstack role commands may suggest
   deployment targets, infrastructure, or third-party services. Such suggestions are
   input for discussion, not autonomous decisions. Follow
   [`core/connector-policy.md`](../../core/connector-policy.md) — platform selection
   requires explicit user approval.

## Notes / caveats

- **Bun v1.0+ is required.** The `./setup` script and supporting tooling depend on Bun.
  Without it, the install step cannot complete and no skills will be available.
- **QA and browse commands need a real browser.** `/qa`, `/qa-only`, `/browse`, and
  `/connect-chrome` open or connect to a browser. These commands will not function in
  headless-only or restricted CI environments.
- **Many gstack commands overlap other skills.** For example, `/review` overlaps the
  Engineering OS `code-review` skill; `/document-generate` overlaps `document-release`.
  Choose the tool that best matches the current phase and project context. When a
  dedicated Engineering OS skill exists and is appropriate, prefer it; use the gstack
  role variant when the role-simulation framing adds value.
- **`/pair-agent` requires ngrok.** The remote pair-programmer agent feature depends on
  an active ngrok tunnel. This is an optional, advanced feature; it is not required for
  any other gstack command.
- **`/gstack-upgrade` updates the install in place.** Running it will change the
  symlinked skills. Review the changelog before upgrading on a project in active use.
