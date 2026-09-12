# evaluator/ — hidden conditions, never mounted into a trial

Everything under this directory is invisible to a trial by construction, not by
convention. `tools/harness/scripts/ns-trial.sh` bind-mounts an empty directory
over this tree inside the trial's mount namespace, and the boundary report counts
the entries visible there: a trial whose report says anything other than `0` is
not qualification-eligible.

That is the mechanism TD-16 asked for. The risk it closes is specific — "hidden
fixtures leak into the agent checkout" — and a hidden condition stored next to
its manifest would leak exactly that way, which is why `simulationManifestSchema`
refuses a `hidden_conditions_ref` that is not under `evaluator-only://`.

## What a check is

One script per task, run by the harness **after** the trial, against the
workspace the agent leaves behind. Each prints a single JSON object of observed
facts and exits 0 even when the facts are bad: a check that exits non-zero on a
failing trial cannot be distinguished from a check that crashed.

A check never reads the transcript and never decides a verdict. It observes; the
graders in `tools/harness/src/task-bank.ts` decide, and the grading hierarchy
decides which of them outranks which.
