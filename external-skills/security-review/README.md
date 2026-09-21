# Security Review — SIP Wrapper

**One-line summary:** Diff-aware AI security review gate that scans only changed code, produces severity-ranked findings with remediation guidance, and posts PR comments automatically.

---

## Source

- **Repository:** https://github.com/anthropics/claude-code-security-review
- **License:** MIT (Anthropic)

---

## What It Ships

| Component | Path / Reference |
|---|---|
| Nemotron MCP tool (primary) | `mcp__nemotron__nemotron_review_code` — available when `Nemotron_api_key` is set |
| Claude Code slash command (fallback) | `/security-review` (`.claude/commands/security-review.md`) |
| Python script (CI/local) | `scripts/security-review-nvidia.py` — uses `Nemotron_api_key` |

> **No GitHub Action with CLAUDE_API_KEY.** The Anthropic-API-based GitHub Action was removed.
> Security review runs through Nemotron (NVIDIA) or the Claude Code session context only.

---

## Status

| Field | Value |
|---|---|
| Wrapper status | Active |
| Type tags | `security`, `review` |
| Execution level | **LEVEL 2 — MANDATORY before production / before merge to main** (conditioned on installation) |

---

## Install Summary

- **Primary (Nemotron):** Set `Nemotron_api_key` in Claude Code secrets. The `mcp__nemotron__nemotron_review_code` MCP tool becomes available automatically.
- **Fallback (slash command):** Copy `security-review.md` into `.claude/commands/` in the target repository (done automatically by `use-in-project.sh`).

Full setup steps, secrets config, and verification steps are in `activation.md`.

---

## CRITICAL CAVEAT

> **This skill is NOT hardened against prompt injection attacks.**
> Run it ONLY on trusted code. For external contributor PRs, require explicit approval before the workflow triggers. See `policy.md` for the full security constraint and scope limits.

---

## Navigation

| File | Contents |
|---|---|
| `integration.md` | Functional role, when to use / not use, how it affects Claude's workflow, composition rules |
| `policy.md` | Classification, execution level, override rules, security constraints |
| `activation.md` | Prerequisites, install steps, YAML snippet, secrets config, verify, disable |
