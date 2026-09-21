# Security Review — Integration

## Functional Role

This skill provides diff-aware AI security review powered by Claude. It scans only changed files (not the entire codebase), produces findings ranked by severity, attaches remediation guidance to each finding, and — when invoked via the GitHub Action — posts inline comments directly on the pull request.

Key behavioral properties:

- **Diff-aware:** On PRs, only newly-introduced changes are analyzed. This limits noise and keeps findings focused on what the author changed.
- **Severity-ranked findings:** Each finding includes a severity classification and concrete remediation steps, not just a flag.
- **False-positive filtering:** The Python `findings_filter.py` component suppresses low-confidence findings before they reach the output.
- **PR comments:** The GitHub Action posts findings as inline PR comments via `scripts/comment-pr-findings.js`.

---

## When to Use

| Situation | Use this skill |
|---|---|
| Before merging any branch to `main` (or equivalent production branch) | Yes — MANDATORY gate when installed |
| Before any production deployment | Yes — MANDATORY gate when installed |
| On a PR diff with changed security-sensitive code (auth, input handling, crypto, secrets, permissions) | Yes |
| On pending branch changes during active development via Claude Code | Yes — invoke `/security-review` |
| As part of the final review phase before sign-off | Yes — must pass before review sign-off proceeds |

---

## When NOT to Use

| Situation | Do NOT use |
|---|---|
| PRs from **untrusted or external contributors** without explicit approval gating | Do NOT run — the skill is not hardened against prompt injection; malicious code comments can influence the review |
| As a substitute for a general code-review skill | Do NOT use — this skill is **security-only**; style, architecture, and correctness reviews require a different tool |
| To detect **DoS or rate-limiting vulnerabilities** | Out of scope — the engine explicitly excludes this category |
| To detect **on-disk secrets** | Out of scope — use a dedicated secret-scanning tool (e.g., `git-secrets`, `trufflehog`) |
| To get a "full security audit" of the entire codebase | Do NOT use for full-codebase audits — diff-only scope is intentional; only newly introduced issues are reported |

---

## How It Affects Claude's Workflow

This skill acts as a **gate**, not a recommendation. When installed:

1. Claude may not report a branch as merge-ready or production-ready until this skill has run and produced no blocking findings (or findings have been explicitly acknowledged and accepted by the repository owner).
2. The `/security-review` slash command is invoked on the current branch's pending changes before Claude proceeds to final review sign-off or deployment steps.
3. Findings surfaced by this skill must be addressed or explicitly waived — they are not advisory output to be ignored silently.

---

## Concrete Artifacts You Invoke

### Slash Command (Claude Code)

```
/security-review
```

Runs the review on all pending changes on the current branch. Customize behavior by editing `.claude/commands/security-review.md` in the target repository.

### Invocation

**Primary (Nemotron MCP):** `mcp__nemotron__nemotron_review_code` — available automatically when `Nemotron_api_key` is set in Claude Code secrets.

**Fallback (slash command):** `/security-review` inside a Claude Code session — uses the current session context, no API key required.

> **No GitHub Action with `CLAUDE_API_KEY`.** The Anthropic-API-based action was removed.
> Full routing logic and setup steps are in `activation.md`.

---

## Composition — SECURITY OVERRIDE

This skill holds **SECURITY OVERRIDE** status in the skill composition hierarchy:

- **No other skill may override, skip, or bypass a SECURITY-level skill.**
- It runs as a gate **before** production deployment and **before** final review sign-off.
- If this skill is installed and has not yet run on a given change set, the workflow is blocked at the gate — no downstream skill (code-review, deploy, merge helpers) may proceed.
- The only party who may explicitly waive a finding is the repository owner (a human, with an explicit documented decision). Claude does not self-waive security findings.
