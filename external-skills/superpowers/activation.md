# superpowers — Install & Verification

## Prerequisites

- **Claude Code** installed and running (CLI or web session).
- No secrets, API keys, or environment variables required.
- No external services or MCP servers required.

## Install

Two equivalent install paths are available inside a Claude Code session:

**Path A — official plugin registry (recommended):**

```
/plugin install superpowers@claude-plugins-official
```

**Path B — marketplace add then install:**

```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

Both paths install the same plugin. Path A is shorter; Path B is useful if you need to
inspect the marketplace entry before committing.

> **Note on custom skills:** If you author additional skills using the `writing-skills`
> guide, those custom skills must be placed in `~/.claude/skills/` to be discoverable
> by the Skill tool. Project-local placement is not supported by Claude Code's skill
> resolution.

## Verify presence

After installation, confirm the plugin is active:

1. **Check plugin list:** run `/plugin list` inside Claude Code — `superpowers` should
   appear in the output.

2. **Check skill availability:** the `using-superpowers` skill should be resolvable via
   the Skill tool. The SessionStart hook injects it automatically on session start, on
   `/clear`, and on `/compact` — no manual invocation is needed to bootstrap it.

3. **Run the project verifier:**

   ```bash
   bash scripts/skill-bootstrap.sh
   ```

   `scripts/skill-bootstrap.sh` checks that the plugin is installed and that the
   `using-superpowers` skill is available, then reports pass/fail. Run this after
   install and after any Claude Code upgrade that could affect plugin state.

4. **Confirm the SessionStart hook fires:** start a new Claude Code session and observe
   that `using-superpowers` is injected at the top of the context without any manual
   trigger. If it does not appear, the hook in `hooks/hooks.json` may not have been
   registered — reinstall the plugin.

## Config / secrets

None. superpowers has no environment variables, no API keys, and no configuration files
beyond what the plugin manifest ships.

## Availability Without Plugin (Remote/Web Sessions)

When `/plugin install` is not available (Claude Code on the web, remote sessions, GitHub Actions),
use the slash commands installed by `use-in-project.sh`:

| Slash command | Replaces | L2 status |
|---|---|---|
| `/superpowers-brainstorm` | `superpowers:brainstorming` | **L2 mandatory before features** |
| `/superpowers-verify` | `superpowers:verification-before-completion` | **L2 mandatory before done** |
| `/superpowers-plan` | `superpowers:writing-plans` | Recommended before non-trivial code |

These commands are **always available** — they are markdown files in `.claude/commands/` that
work in every Claude Code environment without a plugin. The plugin adds automatic SessionStart
injection on top; the commands are the portable foundation.

**Invocation:** User or Claude types `/superpowers-brainstorm` (or the other commands) in
Claude Code. No plugin, no API key, no setup beyond `use-in-project.sh` having run.

**How they get installed:** `use-in-project.sh` copies them from
`${EOS_HOME}/.claude/commands/` to the target project's `.claude/commands/` during bootstrap.

---

## Disable / uninstall

To stop superpowers from running:

```
/plugin uninstall superpowers
```

This removes the plugin, its skills, and its SessionStart hook. The `using-superpowers`
injection will no longer occur on session start. Any custom skills you placed in
`~/.claude/skills/` must be removed manually if desired.

To temporarily suppress the SessionStart injection without uninstalling: there is no
per-session toggle. The hook fires unconditionally when the plugin is installed. The only
supported path is uninstall → reinstall.
