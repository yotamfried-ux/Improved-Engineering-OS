# superpowers — Orchestration Policy

## Classification

| Field       | Value                                          |
|-------------|------------------------------------------------|
| Type tags   | planning, review, orchestration, self-correction |
| Source repo | https://github.com/obra/superpowers            |
| Plugin ID   | `superpowers@claude-plugins-official`          |

## Execution Level

**LEVEL 2 — mandatory. Default-ON in every project.**

superpowers is installed by default in **every** project (see
[`core/skill-orchestration-policy.md`](../../core/skill-orchestration-policy.md) ›
`<default_activation>`). Its SessionStart hook keeps the `using-superpowers` skill loaded
at all times, so the methodology is **always active** — the only thing that scales is the
*depth* of process, not the skill's presence.

How depth scales with the task:

| Task | superpowers depth |
|---|---|
| Non-trivial feature / bugfix (multi-step, code changes, real DoD) | **Full pipeline** — `brainstorming` → `writing-plans` → worktree → TDD → `verification-before-completion` → code review |
| Trivial edit (one-liner, typo, log line, rename) | **Light touch** — the plugin stays loaded; the heavy brainstorm/TDD cycle is skipped because the skill's own logic deems it unnecessary |
| Read-only / question | Loaded but dormant; no workflow imposed |

LEVEL 2 means: for any non-trivial development task, running the appropriate superpowers
skill is not optional — it is the required first action. The plugin is **never uninstalled
per task**; "skipping" only ever means skipping the heavy cycle for a genuinely trivial change.

## Composition rules

1. **Planning runs first.** `brainstorming` → `writing-plans` must complete before any
   file-modifying tool is called. Do not skip to `executing-plans` without a written plan.

2. **Never overrides a security-level skill.** If a `patterns/security/` rule or an
   Engineering OS hook (see [`core/hooks-policy.md`](../../core/hooks-policy.md)) conflicts
   with a superpowers workflow step, the security/hook rule wins. Example: a pre-commit
   hook that blocks a commit is not bypassed to satisfy `finishing-a-development-branch`.

3. **Review skills run last.** `requesting-code-review` and `receiving-code-review` are
   terminal-phase skills. They are never invoked before `verification-before-completion`
   confirms a green test suite.

4. **Parallel agents are opt-in.** `dispatching-parallel-agents` is invoked only when the
   plan contains genuinely independent tasks. Do not dispatch parallel agents for tasks
   that share mutable state or have ordering dependencies.

5. **`using-superpowers` is always available.** The SessionStart hook injects it
   automatically; do not manually invoke it as a pre-check — the hook handles that.

## Notes / caveats

- **Overhead on trivial tasks.** The full brainstorm → plan → worktree → TDD pipeline adds
  meaningful overhead. For throwaway scripts, one-liners, or read-only tasks, do not trigger
  the heavy cycle — but the plugin stays installed and loaded (it is default-on per project).
  "Skip" here means skip the heavy process, not uninstall the skill.

- **Opinionated and mandatory by design.** superpowers describes its workflows as
  "mandatory, not suggestions." This is intentional: the plugin is designed to steer Claude
  away from the most common failure mode (jumping directly to code without a spec). If a
  task feels like the workflow is overkill, reconsider whether it truly qualifies for LEVEL 2
  before skipping the skill.

- **No configuration surface.** superpowers has no env vars, no feature flags, and no
  per-project customization. The only knob is whether the plugin is installed or not.

- **Skills live in `~/.claude/skills/`** when installed. Custom skills that extend or
  override superpowers must also live there; they are not project-local by default.
