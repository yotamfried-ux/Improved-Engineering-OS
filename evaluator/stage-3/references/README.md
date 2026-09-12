# Reference implementations — grader validity controls

`simulationManifestSchema` requires `validity_controls` with a positive and a
negative case, because the Stage 0 manifest lists "the evaluator does not detect
known-bad" as a failure condition and D14 warns that a broken eval produces false
confidence. A grader that returns the same verdict for a correct and an incorrect
solution has proven nothing about any trial it ever graded.

So each task carries reference solutions, and the harness's own tests overlay them
onto a fresh target repo and run the real hidden-condition check against them:

- `correct/` — the fix a competent engineer would make. Every rule must read `proven`.
- `naive/` — the plausible wrong fix, which is the one the task's trap produces. At least one rule must read `failed`.
- `mutation-*/` — the positive case perturbed. Each must stop reading `proven`.

These run in CI with no agent, no namespace and no network. That is deliberate:
the question "can this grader tell good from bad" should not cost a trial to ask,
and it should be answered again on every commit rather than once.
