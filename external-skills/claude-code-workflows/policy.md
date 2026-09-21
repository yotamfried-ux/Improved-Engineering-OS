# claude-code-workflows — Policy

## Classification

| Field | Value |
|---|---|
| Type tags | `review`, `orchestration` |
| Source | https://github.com/OneRedOak/claude-code-workflows |
| License | MIT |
| Install mechanism | Manual file copy (no installer, no manifest) |

---

## Execution Level

| Level | When it applies |
|---|---|
| **Level 1** (default) | Routine code review invocations: running the `pragmatic-code-review` subagent or `/security-review` on a typical feature branch |
| **Level 2** | Large refactors; before merging PRs with broad scope (many files changed, architectural shifts, cross-cutting concerns); any time the outer-loop GitHub Action review is being set up or modified |

**Trigger:** Level 1 is the default for any review invocation. Escalate to Level 2 when the diff is large (>50 files or significant structural change) or when the PR represents a meaningful architectural decision. Level 2 signals that the review output should be treated as a blocking gate, not advisory feedback.

---

## Composition Rules

1. **Review runs last.** These artifacts run in the review phase, after coding is complete and after any dedicated security-level gating. Do not invoke `pragmatic-code-review` or `design-review` subagents mid-implementation.
2. **Does not override the dedicated security-review skill.** The `/security-review` command and `security.yml` Action here provide automated surface-level scanning. They do not replace a full security-review skill pass for compliance, audit, or threat-model work. When both are present, run the dedicated security-review skill first (or as the primary gate), and treat `security.yml` as a lightweight outer-loop signal.
3. **Outer-loop Actions are always-on once installed.** Once the `.github/workflows/` files are in the repo, they fire on every PR without any manual invocation. Account for this in CI cost and secret rotation planning.
4. **Design review requires an active Playwright MCP session and a reachable preview URL.** If either is missing, skip `design-review` — do not attempt to run it against a staging URL that is down or a local dev server that is not accessible from the action runner.
5. **Do not modify the GitHub Actions model pin without testing.** The workflows pin `claude-opus-4-1-20250805`. Changing the pin may alter review behavior; test on a branch before updating the production workflow.

---

## Notes

- **Manual install and customization are expected.** The source repo is a template. The artifacts are starting points — copy them, read them, and adapt the prompts to your project's conventions. Do not treat them as immutable.
- **Model pinned in the GitHub Action:** `claude-opus-4-1-20250805`. This affects API cost. The subagent files may specify different models (`claude-sonnet-*` for `design-review`). Check each file before copying.
- **Playwright MCP dependency for `design-review`:** This is a hard dependency, not optional. The `design-review` subagent cannot function without a running Playwright MCP server and a live URL. See [`activation.md`](./activation.md) for setup details.
- **Secret scope:** `CLAUDE_CODE_OAUTH_TOKEN` (preferred) or `CLAUDE_API_KEY` must be set as a GitHub repository secret. These are not interchangeable in all contexts — `CLAUDE_CODE_OAUTH_TOKEN` is the recommended default for `anthropics/claude-code-action@v1`.
