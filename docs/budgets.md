# Overhead budgets

The report requires EOS to justify not only correctness but **overhead**, and to
report a vector rather than a single score: an improvement in tokens cannot
cancel a regression in security.

Stage 0's job here is to define the measurement, not to invent numbers. The guide
keeps every threshold open until real data exists (§7), and fixing a number
without a baseline turns an arbitrary assumption into technical debt.

## Status

**Every baseline below is empty. No measurement has been taken.** The first rows
are produced by the Stage 3 real-agent slice.

## Axes

| Axis                        | Unit                   | Provisional target                     | Baseline     | Fixed at |
| --------------------------- | ---------------------- | -------------------------------------- | ------------ | -------- |
| Startup latency             | ms                     | —                                      | not measured | Stage 3  |
| `resolve` latency           | ms                     | ≤ 1500 (provisional, open parameter 8) | not measured | Stage 3  |
| Context added per `resolve` | bytes                  | ≤ 6144 (provisional, open parameter 8) | not measured | Stage 3  |
| Tool calls added            | count per task         | —                                      | not measured | Stage 3  |
| Wall-clock overhead         | % vs. native           | —                                      | not measured | Stage 14 |
| Telemetry CPU / IO          | ms per event           | —                                      | not measured | Stage 7  |
| Evidence Plane write growth | rows and bytes per run | —                                      | not measured | Stage 7  |
| Eval cost                   | currency per trial     | —                                      | not measured | Stage 3  |
| Human rescue time           | minutes per task       | —                                      | not measured | Stage 3  |

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

## Trial cost

TD-20 records that unbudgeted agent-trial cost causes stages to be skipped "for
now". The budget per simulation is declared in its manifest, and the harness
aborts at 2× the declared budget. No trial has been run, so no cost is recorded.
