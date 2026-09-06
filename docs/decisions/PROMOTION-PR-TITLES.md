# Promotion PR title convention

## Purpose

A Promotion PR is not an ordinary implementation change. It represents a lesson the system proposes to preserve as canonical knowledge. The PR list should make that visible without requiring the owner to open each PR first.

## Required title

Every Promotion PR MUST be titled with the learned lesson itself:

```text
learn: <concise lesson learned>
```

The title should state the reusable engineering lesson, not the incident, task number, asset id, or implementation detail that happened to reveal it.

Good examples:

```text
learn: init reruns must preserve installation identity
learn: sandbox writes must verify physical path containment
learn: incomplete telemetry cannot qualify a measured run
```

Avoid titles such as:

```text
promote candidate 42
fix init bug
update knowledge asset
```

## PR body

The PR body MUST make the learning chain understandable to a human reviewer and include, directly or through the attached `promotion.yaml` / Promotion Proposal:

1. **Problem** — what recurring engineering problem was observed.
2. **Evidence** — which evidence supports the lesson.
3. **Lesson learned** — the reusable rule being proposed.
4. **Knowledge change** — what canonical asset or Solution Set changes.
5. **Confidence / integrity** — why the evidence is strong enough for promotion.

The title and the `Lesson learned` section MUST describe the same lesson.

## Applicability

This convention applies to both promotion paths defined by the architecture:

- **Bootstrap phase, before the Promoter exists:** the owner opens the promotion PR using this title convention.
- **Automated promotion, once the Promoter exists:** the Promoter MUST derive the PR title from the validated Promotion Proposal and emit `learn: <lesson learned>`.

The Promoter may shorten wording for GitHub readability, but it MUST preserve the meaning of the lesson and MUST NOT replace it with an opaque id or generic action label.

## Non-goal

This convention does not change promotion authority, evidence thresholds, or merge policy. A learned-lesson title makes the proposal understandable; it does not make the proposal trustworthy. Existing Evidence → Curator → Promotion Proposal → Promoter → PR → owner approval rules remain authoritative.
