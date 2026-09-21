# Official Packages

## Purpose

This document records the bridge from Engineering OS custom external capability wrappers to official Claude package files.

The existing `external-skills/*` four-file SIP contract remains the governance layer for third-party capabilities. Project packages under `.claude/skills/*/SKILL.md` are added only for small, reusable Engineering OS workflows that should load selectively.

## First package

The first package is:

```text
.claude/skills/engineering-route/SKILL.md
```

It packages the route-planning workflow only. It does not replace runtime evidence gates, PR policy, CodeRabbit policy, or the external-skills SIP registry.

## Adoption rules

- Add one package at a time.
- Each package must have a validator under `scripts/enforcement/tests/`.
- A package must not allow write or shell tools unless a later PR proves the need.
- A package must reference concrete Engineering OS policies, not generic prompting advice.
- Do not migrate all external entries in bulk.

## Relationship to SIP

| Layer | Role |
|---|---|
| `external-skills/*` | Governance contracts for external capabilities |
| `.claude/skills/*/SKILL.md` | Official-format reusable Claude packages |
| `scripts/enforcement/tests/*` | CI validation for package shape and scope |

## Next candidates

Only after `engineering-route` proves useful:

- `verification-before-merge`
- `official-source-check`
- `code-review-response`

Each candidate needs its own PR, validation, CodeRabbit review, and explicit adoption reason.
