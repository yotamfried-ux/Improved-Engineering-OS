# Overhead budgets

The report requires EOS to justify not only correctness but **overhead**, and to
report a vector rather than a single score: an improvement in tokens cannot
cancel a regression in security.

Stage 0's job here is to define the measurement, not to invent numbers. The guide
keeps every threshold open until real data exists (§7), and fixing a number
without a baseline turns an arbitrary assumption into technical debt.

## Status

**First measurements taken — Stage 3, 6 trials, revision `4371506`.** Most axes
are still empty, and the reason each one is empty is worth more than a number
would be. Two facts govern the table:

1. **No paired native baseline was run.** The method below requires the same task
   run native and EOS-assisted; only the EOS-assisted side exists. So an axis
   phrased as a _delta_ ("added", "overhead") cannot be filled from these trials,
   however tempting the absolute number is.
2. **`resolve` was never called.** In all six trials the agent solved the task
   without consulting EOS, with the tools connected and verified. Every axis that
   measures a `resolve` — its latency, the bytes it returns — therefore has no
   observation behind it, and an axis with no observation stays `not measured`
   rather than being filled with a zero that would read like a fast result.

Every filled cell is excluded from qualification evidence: all six runs ended
`telemetry_state: INCOMPLETE` because this environment's egress policy does not
reach the Evidence Plane, and rule 4 below excludes an INCOMPLETE run. They are
honest measurements of cost and behaviour; they are not qualification evidence.

## Axes

| Axis                        | Unit                   | Provisional target                     | Baseline                                    | Fixed at |
| --------------------------- | ---------------------- | -------------------------------------- | ------------------------------------------- | -------- |
| Startup latency             | ms                     | —                                      | not measured                                | Stage 3  |
| `resolve` latency           | ms                     | ≤ 1500 (provisional, open parameter 8) | **no observation** — `resolve` never called | Stage 3  |
| Context added per `resolve` | bytes                  | ≤ 6144 (provisional, open parameter 8) | **no observation** — `resolve` never called | Stage 3  |
| Tool calls added            | count per task         | —                                      | **+2.5 to +15.5, paired, n=3 tasks**        | Stage 3  |
| Tool calls per task         | count per task         | —                                      | **11.7 mean (7–19), n=6**                   | Stage 3  |
| Wall-clock per trial        | s                      | —                                      | **78s mean (34–137), n=6**                  | Stage 3  |
| Wall-clock overhead         | % vs. native           | —                                      | **+10% to +174%, paired, n=3 tasks**        | Stage 14 |
| Telemetry CPU / IO          | ms per event           | —                                      | not measured                                | Stage 7  |
| Evidence Plane write growth | rows and bytes per run | —                                      | not measured — no run reached the plane     | Stage 7  |
| Eval cost                   | currency per trial     | —                                      | **$0.214 mean ($0.130–$0.341), n=6**        | Stage 3  |
| Cost overhead               | % vs. native           | —                                      | **+32% to +204%, paired, n=3 tasks**        | Stage 3  |
| Human rescue time           | minutes per task       | —                                      | **0 — no trial was rescued, n=6**           | Stage 3  |

## Measurement method

1. **Paired trials.** Same agent, same task, same tools, same budget, same
   environment; native versus EOS-assisted. Anything else measures the harness.
2. **Recorded ranking.** `ranking_mode: recorded` with a pinned `score_view_id`,
   so a live score change cannot reorder results between two runs being compared
   (Q-06).
3. **Registered runs.** The harness pre-registers every measured run with
   `origin_class: qualification` (D36). An unregistered run is `operational` and
   is not a measurement.
4. **Complete telemetry only.** A run with `telemetry_state: INCOMPLETE` is
   excluded. A partially measured run is not a cheap measurement, it is a wrong
   one (D23).
5. **Multiple trials for anything stochastic.** No capability is inferred from a
   single stochastic run; the minimum is declared in the simulation manifest.
6. **Vector reporting.** Each axis is reported separately. There is no overall
   score, deliberately.

## What EOS costs when it is used

The hard bank's paired arms are the first measurement of overhead this project has,
and the numbers are not flattering. Each row is the mean of two trials per arm on one
task, `native` → `eos`:

| Task                         | Tool calls          | Cost                    | Wall clock          |
| ---------------------------- | ------------------- | ----------------------- | ------------------- |
| `plan-dod-external-gates`    | 15.5 → 18.0 (+2.5)  | $0.203 → $0.268 (+32%)  | 74s → 81s (+10%)    |
| `commit-message-protocol`    | 7.0 → 22.5 (+15.5)  | $0.179 → $0.544 (+204%) | 76s → 177s (+134%)  |
| `quality-gate-cleanup`       | 24.5 → 35.5 (+11.0) | $0.520 → $1.298 (+149%) | 217s → 595s (+174%) |
| `plugin-install-marketplace` | 22.0 → 17.5 (−4.5)  | $0.333 → $0.289 (−13%)  | 139s → 110s (−21%)  |

**The last row is the calibration, not an outlier.** On that task `resolve` was never
called in either arm, so the two arms were behaviourally identical and the whole spread
is run-to-run variance. That puts the noise floor at roughly ±20% on cost and wall
clock with two trials per arm — which is the right lens for the rest of the table:
`plan-dod`'s +32% and +10% sit close to it and should not be read as a firm measurement,
while the +149% and +204% rows are clearly outside it.

Read plainly: on a task where the recorded knowledge decides the outcome, consulting it
roughly doubles to triples the cost and can triple the wall clock. Whether that is worth
paying is a question about the value of being right, and this table is not the place to
answer it — but the number belongs here rather than in a footnote, because the report
this project is built to produce has to justify overhead and not only correctness.

Two limits on every number above. They rest on two trials per arm, which is the
contract's minimum and not a comfortable sample. And every one of these runs ended
`telemetry_state: INCOMPLETE`, so by rule 4 below none of them is qualification
evidence; they are honest measurements of cost and behaviour and nothing more.

## Trial cost

TD-20 records that unbudgeted agent-trial cost causes stages to be skipped "for
now". The budget per simulation is declared in its manifest, and the harness
aborts at 2× the declared budget.

Declared: **$3 per trial** (owner, Stage 3), with wall clock 900s and 60 tool
calls. Measured across the six Stage 3 trials: **$1.29 total**, mean $0.214, worst
$0.341 — an order of magnitude inside the budget, and worth recording as such
rather than quietly congratulating: the budget was set before any measurement
existed, and the first measurement says it was set generously.

Two halves of the budget are prospective and one is not. Wall clock and turns are
capped before the fact (the driver passes `--max-turns` at twice the declared
tool-call budget and kills the trial at twice the declared wall clock); cost is
classified afterwards, because nothing bills by the call in advance. That
asymmetry is why the turn cap matters: it is the only thing that bounds spend
before it happens.
