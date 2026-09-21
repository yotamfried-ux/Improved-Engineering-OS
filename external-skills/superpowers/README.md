# superpowers

A Claude Code Skills library that enforces spec-first, TDD, and review discipline
across any non-trivial development task.

## Source

- **Repo:** https://github.com/obra/superpowers
- **License:** MIT (Jesse Vincent)

## What it ships

A Claude Code **plugin** — not an MCP server, not a set of slash commands.

```
.claude-plugin/
  marketplace.json      # marketplace metadata
  plugin.json           # plugin manifest, v5.1.0
hooks/
  hooks.json            # SessionStart hook → injects `using-superpowers` on startup/clear/compact
skills/                 # 14 skills, each invoked via the Skill tool
```

The SessionStart hook fires automatically on session start, `/clear`, and `/compact`,
injecting the `using-superpowers` skill so Claude checks for a relevant skill before
acting on any prompt.

## Status

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Wrapper status | Active                                     |
| Classification | planning, review, orchestration, self-correction |
| Execution Level | **LEVEL 2 — mandatory** for non-trivial multi-step dev tasks (conditioned on plugin being installed) |

## Install summary

Install via `/plugin install superpowers@claude-plugins-official` inside Claude Code.
Full steps and verification: [activation.md](./activation.md).

## The 14 skills

**Bootstrap / meta**
- `using-superpowers` — entry-point skill; auto-injected by the SessionStart hook; routes Claude to the right skill for the current task

**Planning**
- `brainstorming` — collaborative ideation and problem decomposition before any code is written
- `writing-plans` — turns a brainstormed spec into a structured, bite-sized execution plan
- `executing-plans` — drives execution against an existing written plan, step by step

**Agent orchestration**
- `subagent-driven-development` — delegates implementation work to a focused subagent
- `dispatching-parallel-agents` — fans out independent work items across parallel subagents

**Development discipline**
- `test-driven-development` — enforces RED → GREEN → REFACTOR cycle; writing tests before code
- `systematic-debugging` — structured root-cause debugging protocol; prevents random patching

**Quality gates**
- `verification-before-completion` — mandates running and confirming tests/checks before declaring done
- `requesting-code-review` — prepares and submits work for code review
- `receiving-code-review` — structures the response to incoming review feedback

**Git workflow**
- `using-git-worktrees` — isolates feature branches in git worktrees to enable parallel agents
- `finishing-a-development-branch` — standardized branch-finish checklist (tests green, PR ready, worktree cleaned)

**Meta / authoring**
- `writing-skills` — guide for authoring new skills that follow the superpowers convention

---

See [integration.md](./integration.md) for behavioral contract, [policy.md](./policy.md) for
orchestration rules, [activation.md](./activation.md) for install + verification.
