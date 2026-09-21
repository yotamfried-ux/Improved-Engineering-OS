# gstack — Activation

## Prerequisites

- **Claude Code** CLI installed and authenticated.
- **Git** available in `PATH`.
- **Bun v1.0+** installed. Install from https://bun.sh if missing:
  ```bash
  curl -fsSL https://bun.sh/install | bash
  bun --version   # confirm >= 1.0.0
  ```
- No API keys or secrets are required for normal skill use (see Config / Secrets below).

---

## Install

### Personal mode (single user)

```bash
git clone --single-branch --depth 1 \
  https://github.com/garrytan/gstack.git ~/.claude/skills/gstack \
  && cd ~/.claude/skills/gstack \
  && ./setup
```

`./setup` symlinks the skills into the Claude Code default skills directory.

To target a different host (Codex, Cursor, etc.), pass `--host`:

```bash
./setup --host codex
```

### Team mode (shared repository)

Run the setup with `--team`, then initialize the shared config and commit the result:

```bash
cd ~/.claude/skills/gstack && ./setup --team
~/.claude/skills/gstack/bin/gstack-team-init
git add .claude/ CLAUDE.md
git commit -m "chore: add gstack team skills"
```

> Reference: see `scripts/skill-bootstrap.sh` in this repo for a scripted version of
> the personal install workflow.

---

## Verify Presence

After install:

1. Confirm the install root exists:
   ```bash
   ls ~/.claude/skills/gstack
   ```
2. Confirm skills are symlinked into Claude Code's skills directory:
   ```bash
   ls ~/.claude/skills/ | grep -i review   # should show gstack's review skill
   ```
3. Start or restart a Claude Code session and run `/review` (or any other gstack
   command). Claude should execute the corresponding skill. If the command is
   unrecognized, the symlinks did not land correctly — re-run `./setup`.

---

## Config / Secrets

**No configuration is required for normal skill use.**

| Item | Purpose | Required? |
|------|---------|-----------|
| `ANTHROPIC_API_KEY` | Used only by the repo's own LLM-judge evaluation suite (`bun run test:eval`) | No — only for contributors running evals |
| `~/.gstack/config.yaml` | Optional: `auto_upgrade: true/false` | No |
| ngrok | Required only for `/pair-agent` (remote pair-programmer) | No — optional feature only |

Do not add `ANTHROPIC_API_KEY` to your project `.env` for gstack. It is not consumed
by the skills at runtime; it is only used by the upstream test harness.

---

## Disable / Uninstall

To remove gstack entirely:

```bash
rm -rf ~/.claude/skills/gstack
```

If `./setup` created symlinks in a separate directory, remove those as well:

```bash
# Personal mode — symlinks land in ~/.claude/skills/ with the skill names
# List what ./setup added and remove the broken symlinks:
find ~/.claude/skills/ -maxdepth 1 -type l -name 'gstack-*' -delete
```

Restart the Claude Code session after removal to deregister the skills.
