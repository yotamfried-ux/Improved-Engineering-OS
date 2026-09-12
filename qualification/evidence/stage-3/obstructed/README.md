# Obstructed trials — kept because they were not failures

Four version-1 trials of `plan-dod-external-gates`, two per arm. Every rule reads
failed and not one of them is a fact about the agent.

The task asked for a plan file under `.claude/plans/`. The agent's own Write tool
refuses that directory because it holds settings, and `--permission-mode acceptEdits`
does not cover it. Each agent composed the plan, was refused, tried once more, was
refused again, and then said so plainly rather than working around it — which is the
right behaviour. The harness graded the empty workspace and recorded it as a failure
to write a plan.

They are kept for two reasons. A failure that disappears from the record is a
criterion quietly changed (D14). And the `permission_denials` they carry hold the
plans the agents actually composed, which is worth reading: **all four placed "CI is
green on the pull request" inside the `## DoD` checklist** — the exact structure the
recorded control forbids, in both arms, with `resolve` never called.

That is suggestive and it is not evidence. Grading blocked content would be scoring
an intention rather than an outcome, so these trials stay ungraded and version 2
re-runs the same criteria against a fixture the agent is allowed to write.
