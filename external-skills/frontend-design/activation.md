# frontend-design — Activation

## Prerequisites

- **Claude Code** CLI installed and authenticated.
- No API keys, secrets, or environment variables required.
- No external services or network dependencies at runtime.

---

## Install

### Option A — Plugin marketplace (recommended)

Run both commands inside Claude Code (the CLI chat interface):

```
/plugin marketplace add anthropics/skills
/plugin install example-skills@anthropic-agent-skills
```

- The first command registers the `anthropics/skills` marketplace bundle.
- The second installs the `example-skills` plugin from that bundle, which includes `frontend-design`.

> `frontend-design` is not a standalone plugin. It is one of ~18 skills bundled under `example-skills`.

### Option B — Manual copy (no marketplace access required)

Clone the source repository and copy the skill directory into your project:

```bash
git clone https://github.com/anthropics/skills.git /tmp/anthropics-skills
cp -r /tmp/anthropics-skills/skills/frontend-design .claude/skills/
```

The `.claude/skills/` directory is Claude Code's local skill search path. The skill is self-contained (`SKILL.md` + `LICENSE.txt`) — no further configuration needed.

> Reference: see `scripts/skill-bootstrap.sh` in this repo for a scripted version of the manual copy workflow.

---

## Verify Presence

After install, confirm the skill is available:

1. Start or restart a Claude Code session in the target project.
2. Ask Claude: "What skills are available?" or "List installed skills." The `frontend-design` skill should appear.
3. **Functional test:** Send a UI-related request (e.g., "Design a landing page for a SaaS product"). Claude should automatically enter the multi-pass design process (ground the brief → token system → self-critique → code) without needing an explicit `/frontend-design` command.

---

## Config / Secrets

None. The skill is purely prompt-based. No `.env` entries, no API keys, no service accounts.

---

## Disable / Uninstall

### If installed via plugin:

```
/plugin uninstall example-skills@anthropic-agent-skills
```

This removes the entire `example-skills` plugin (and all skills it bundles, including `frontend-design`). To remove only `frontend-design` while keeping other skills in the bundle, use the manual copy approach instead and skip copying `frontend-design/`.

### If installed manually:

```bash
rm -rf .claude/skills/frontend-design
```

Restart the Claude Code session to deregister the skill.
