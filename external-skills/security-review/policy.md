# Security Review — Policy

## Classification

| Field | Value |
|---|---|
| Type tags | `security`, `review` |
| Primary engine | Nemotron (`mcp__nemotron__nemotron_review_code`) |
| Fallback engine | Claude Code slash command `/security-review` (no API key) |
| **NEVER** | Anthropic API / `CLAUDE_API_KEY` |
| Wrapper status | Active |

### Routing Rule

```
Nemotron_api_key set → mcp__nemotron__nemotron_review_code   (PRIMARY)
Nemotron_api_key unset → /security-review slash command       (FALLBACK)
NEVER → Claude Anthropic API, CLAUDE_API_KEY, GitHub Action with claude-api-key
```

This routing is **non-negotiable**. The Anthropic API path was removed to eliminate
external API dependency on the security gate. The gate must remain functional without
any Anthropic API key.

---

## Execution Level

**LEVEL 2 — MANDATORY. Default-ON in every project that ships to production.**

security-review is installed by default in every production-bound project (see
[`core/skill-orchestration-policy.md`](../../core/skill-orchestration-policy.md) ›
`<default_activation>`). "Conditioned on installation" means: if it is not installed in a
given repository, the gate does not apply there — but for any project that reaches
production, installing it is the default, not opt-in.

The skill is **diff-aware**, so running it on the small pending diff is cheap. It fires at
two cadences:

| Cadence | Trigger | Mode |
|---|---|---|
| **Before each commit on a feature branch** | code changes staged/pending on a non-main branch | run `/security-review` on the pending diff — **recommended default**, catches new issues before they enter history (see [`core/git-policy.md`](../../core/git-policy.md) › `<cadence>`) |
| **Before merge to main / deploy** | merge to `main` (or production branch), production deployment, final branch sign-off | **mandatory gate** — must pass; cannot be skipped or overridden |

The per-commit run is the early-warning pass; the pre-merge run is the unconditional gate.
A clean per-commit result does not waive the pre-merge gate.

---

## Composition and Override Rules

### Core rule

> **No skill may override a SECURITY-level skill.**

This rule is unconditional. It does not yield to:

- Convenience ("we're in a hurry")
- Other skills with lower classification (code-review, simplify, run, deploy helpers)
- Implicit user pressure to move fast

If the gate has not been satisfied, Claude must surface that fact explicitly before proceeding with any merge or deployment step.

### Gate sequencing

```
branch changes ready
       |
       v
[SECURITY REVIEW GATE]  <-- this skill; must pass first
       |
       v
[general code review / sign-off]
       |
       v
[merge to main / deploy]
```

No step below the gate may be executed until the gate step is complete and its findings are resolved or explicitly waived by a human.

### Waiver protocol

A finding may be waived ONLY by the repository owner with an explicit, documented decision (e.g., a PR comment stating the rationale). Claude does not self-waive. Claude does not treat silence or time pressure as a waiver.

---

## Security Notes

### Trusted PRs only — prompt injection not hardened

The underlying Python engine and Claude prompts are **not hardened against prompt injection**. A malicious actor can embed instructions in source code, comments, or commit messages that influence the review output.

Mandatory mitigation: **require explicit human approval before the workflow triggers on any PR from an external or untrusted contributor.** Use GitHub's "Require approval for first-time contributors" or equivalent branch protection rules.

### Scope limits — excluded categories

The engine explicitly excludes the following from its scope. These require dedicated tooling:

| Excluded category | Recommended alternative |
|---|---|
| Denial-of-service (DoS) vulnerabilities | Manual review; load/stress testing |
| Rate-limiting gaps | Manual review; API gateway rules |
| On-disk secrets / secrets in repository history | `trufflehog`, `git-secrets`, GitHub secret scanning |

**Do not treat a clean security-review result as a guarantee that the above categories are safe.** The skill's scope is limited to newly-introduced security issues in changed code only.

### Diff-only scope

The skill reviews only the diff — files changed in the current PR or branch. Pre-existing vulnerabilities in unchanged code are not reported. This is intentional (reduces noise) but means the skill is not a substitute for periodic full-codebase security audits.
