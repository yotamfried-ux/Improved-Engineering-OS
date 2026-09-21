# gstack

A virtual engineering team for Claude Code — maps specialist roles (CEO, Eng Manager,
Designer, Reviewer, QA Lead, Security Officer, Release Engineer) onto your development
pipeline through a collection of slash-command skills.

## Source

- **Repo:** https://github.com/garrytan/gstack
- **License:** MIT (Garry Tan)
- **Version documented:** 1.58.1.0

## What it ships

A Claude Code **skill collection** installed via a `./setup` script — NOT a plugin
(no `.claude-plugin/`, no `marketplace.json`, no `plugin.json`).

```
~/.claude/skills/gstack/   ← install root after ./setup
  59 SKILL.md files total
  bin/                     ← gstack-team-init and other helpers
  setup                    ← install script (symlinks skills into host's skills dir)
```

The README describes the collection as "twenty-three specialists and eight power tools"
(the remainder of the 59 SKILL.md files are sub-skills, browser-skills, and ClawHub
variants that back the top-level commands).

## Status

| Field           | Value                                                              |
|-----------------|--------------------------------------------------------------------|
| Wrapper status  | Active                                                             |
| Classification  | orchestration, role-simulation, planning, review, qa, security     |
| Execution Level | **LEVEL 1 — recommended, use selectively for complex projects**    |

## Install summary

```bash
git clone --single-branch --depth 1 \
  https://github.com/garrytan/gstack.git ~/.claude/skills/gstack \
  && cd ~/.claude/skills/gstack && ./setup
```

Requirements: Claude Code, Git, Bun v1.0+. Full steps, team-mode setup, and
verification: [activation.md](./activation.md).

---

See [integration.md](./integration.md) for behavioral contract and command reference,
[policy.md](./policy.md) for orchestration rules, [activation.md](./activation.md) for
install, verification, and uninstall.
