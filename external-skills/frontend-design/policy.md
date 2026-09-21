# frontend-design — Policy

> ⚠️ **DEPRECATED — superseded by [`ui-ux-pro-max`](../ui-ux-pro-max/).** Do not install in new
> projects. This wrapper is kept for reference only; the UI/UX execution level now belongs to
> `ui-ux-pro-max`. See the registry in [`../README.md`](../README.md).

## Classification

| Field | Value |
|---|---|
| Type tags | `ui-ux`, `coding` |
| Source license | Apache-2.0 |
| Config/secrets required | None |
| Scope | Project-level (installed per Claude Code project or globally) |

## Execution Level

| Condition | Level |
|---|---|
| Task involves building or reshaping user-facing UI **and** skill is installed | **Level 2** — Claude leads the design process autonomously through all passes before presenting output |
| Skill is installed but task is not UI work | **Level 1** — skill may be referenced for context but does not drive the workflow |

**Trigger condition:** The skill auto-triggers on description match. It activates when:
1. The installed `example-skills` plugin is active in the current Claude Code session, AND
2. The user's request matches the skill's description (UI building, visual design, aesthetic direction, typography, layout).

No explicit slash command is required.

## Composition Rules

- Runs in the **coding phase**, after planning and spec are finalized.
- **Defers to an explicit brief:** If the user's prompt specifies exact colors, typefaces, or layout choices, those choices are authoritative. The skill's multi-pass brainstorm process does not override explicit instructions.
- **Defers to security review** before production UI ships. `frontend-design` covers aesthetics and structure; it does not cover XSS, CSP, or auth-gated rendering decisions.
- **Does not apply to backend tasks.** Invoking the skill for API, database, or logic work adds process overhead with no design benefit.

## Notes

- The skill is distributed inside the `example-skills` plugin. Removing or disabling that plugin removes `frontend-design` as well.
- There are no environment variables, API keys, or external service calls — the skill is purely prompt-based guidance injected into Claude's context.
- Updates to the upstream `anthropics/skills` repo are not automatically applied. Re-running the install commands or updating the plugin will pull the latest `SKILL.md`.
