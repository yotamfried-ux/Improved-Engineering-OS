# Stage 3 — Real agent vertical slice

**Status: in progress.** No gate is claimed here. The only artifact permitted to
say whether Stage 3 passed is a harness-generated report under
`qualification/reports/`, and this document is one of the things that report is
meant to be able to contradict.

## What the guide asks for

> A real agent, in a fresh session, on a realistic disposable repo, performs an
> ordinary bounded task and uses EOS naturally: `agent → resolve → inspect →
> work → tests → telemetry → (minimal) evidence → investigation`.

**Hidden condition.** The target repo carries the generated bootstrap block
(D18.4), stating that EOS tools exist and what they are for. No task-specific
hints, no asset names, no instruction to call any tool.

**Trials (T-07).** At least three independent tasks, **primary agent only**, each
in a fresh sandbox, harness-driven, every run pre-registered `qualification`
(D36) with `ranking_mode: recorded` and a fixed `score_view_id` (D24). One task
requires a lesson imported at Stage 2; one includes a misleading clue; one has a
test failure mid-task.

**Exit gate.** No rescue; telemetry → attribution evidence → investigation
timeline complete for every trial; the agent used EOS in at least the trials
where the imported lesson was needed, or correctly did not need it. If the slice
is not natural, stop and simplify — nothing from Stage 4 is built until this
passes.

## O-3 is closed by reading, not by preference

O-3 asked which agent is "the primary agent". It is **Claude Code**, and the
frozen guide settles it in three independent places rather than leaving it to
taste:

- Stage 0's deliverables name `drivers/claude-code.ts` as
  "Agent SDK `query()` with `setting_sources=[]` and explicit `allowed_tools`,
  or `claude -p --output-format stream-json`", alongside a separate
  `drivers/codex.ts`.
- Stage 3's own trial paragraph fixes the driver by its parameter:
  `setting_sources=[]` is the Claude surface. Codex's headless surface in the
  same guide is `codex exec --json --ephemeral`.
- Stage 8 is titled around the "**second agent (Codex)** adapter and hooks built
  here and brought to parity with the primary agent, with the Stage 3 task bank
  re-run through it".

So "primary" was never an open preference; it was an unread cross-reference. O-3
is recorded as closed on that reading, with no contract consequence: the
`AgentDriver` port is unchanged, and `drivers/codex.ts` remains Stage 8's.

## C-12 — `setting_sources: ['project']`, and why the literal text cannot stand

Stage 3 says trials are driven with `setting_sources=[]` "so only the target
repo's own files influence the run". Taken literally, the parameter defeats the
sentence that justifies it, and defeats Stage 3's hidden condition with it.

This was measured, not reasoned about. A fresh temp repo was given a `CLAUDE.md`
carrying a bootstrap block with a unique marker, every file-reading tool was
disallowed so that only injected context could answer, and the same question was
put twice:

| `setting_sources` | Answer | Meaning |
| --- | --- | --- |
| `[]` | `NONE` | the target repo's own `CLAUDE.md` never reaches the agent |
| `['project']` | `ZANZIBAR-7719` | the repo's own bootstrap block reaches the agent |

Under `[]` the agent is never told EOS exists. "Was `resolve` called unprompted?"
would then measure nothing, the lesson-dependent task could not be passed by any
agent, and the exit gate would be unreachable by construction — a stage failing
for a methodological reason rather than a true one.

`['project']` delivers exactly what the guide's own rationale asks: the trial's
cwd **is** the disposable repo, so the only settings and memory files in scope
are that repo's. The host's `~/.claude`, the evaluator's settings and this
repository's own `CLAUDE.md` stay out — which is the leak TD-16 names.

Recorded as approved deviation **C-12**, owner-approved on the evidence above.
It relaxes the letter of a frozen parameter, so it is visible as a deviation
rather than absorbed silently, per guide §6.1 rule 8.

## The isolation precondition ADR-0005 deferred to this stage

`defaultTrialPolicy` requires all four boundaries and the Stage 0 sandbox can
prove two. Its own comment says so: proving `process` and `network` "needs a
container, namespace or equivalent mechanism, which is a Stage 3 precondition".
Left alone, every Stage 3 trial reports `qualificationEligible: false` and the
stage cannot honestly pass. So the mechanism is built here.

`tools/harness/scripts/ns-trial.sh` runs each trial inside a rootless Linux
namespace set: user + mount + PID + network. What each boundary gets is different
in kind from a directory check:

| Boundary | Mechanism | Observed |
| --- | --- | --- |
| `filesystem` | the evaluator tree is bind-mounted empty inside the namespace | `0` entries visible where the repository is on the host — "`evaluator/` never mounted" literally, not by convention |
| `environment` | `env -i` plus the policy's named variables | built, never filtered |
| `process` | PID namespace with `--mount-proc` | the trial is pid 1 and sees only its own tree |
| `network` | `slirp4netns` for egress, `iptables -P OUTPUT DROP` plus one allowlisted destination | a control host is refused; the agent still completes, because the one allowed destination is the inference endpoint |

The network policy for a real-agent trial is therefore `allowlist`, not `deny`,
and that is a statement about what the trial is rather than a relaxation: the
inference channel is the agent. Everything else — package registries, code
search, the open internet — is dropped by the same rule that proves the
boundary, and `WebSearch`/`WebFetch` are additionally not in the driver's
`allowed_tools`, so a trial cannot fetch its own answer.

Two system packages (`slirp4netns`, `iproute2`) are required on the machine that
runs trials. They are not build dependencies and nothing in `pnpm run check`
needs them; a machine without them gets `network: unproven` and ineligible
trials, which is the truthful outcome rather than a silent pass.

## Trial protocol

- **Three tasks**, each its own Simulation Manifest under `simulations/`.
  Agent runs are stochastic, so `repetition_policy.type` is `stochastic` and the
  contract already refuses a `minimum_trials` below 2 — no capability is inferred
  from a single run.
- **Registration first.** The harness registers each run with the live Evidence
  Plane as `qualification` before the agent's first event. Registration that the
  plane does not confirm leaves the trial `operational`, and the report says so
  instead of claiming the class the harness intended.
- **Recorded ranking.** `ranking_mode: recorded` with a pinned `score_view_id`,
  so a score change between trials cannot reorder results (Q-06).
- **Budget.** `$3` per trial, declared in each manifest; the harness aborts at
  `2x` it, the multiplier the guide names (TD-20). Wall-clock and tool-call
  budgets are declared the same way.
- **No coaching.** `allowed_interventions.eos_coaching` is `false` in every
  manifest. The prompt is the task, and nothing in it names an asset, a tool or
  EOS.

## What this stage measures

The guide's list, which becomes the first rows of `docs/budgets.md`: task
success, whether `resolve` was called unprompted, critical asset recall, returned
bytes, tool calls, tokens, wall-clock, resolve latency, telemetry completeness,
rescues. Cost per trial is measured too, since `claude -p --output-format json`
reports it and TD-20 exists because it was not measured before.

Every number lands as a measurement with the trial that produced it. An axis no
trial exercised keeps reading `not measured`; the table is not filled in by
inference from a neighbouring axis.

## What is deliberately not done

- **No second agent.** Stage 8's, by T-07. `drivers/codex.ts` is not written
  here, and the task bank is built to be re-run rather than rewritten there.
- **No CI trial job.** Trials cost money and need namespaces and credentials CI
  does not have. The harness's own unit tests — including the graders' positive,
  negative and mutation controls — run in CI with no agent and no network; the
  trials themselves are owner-run and their artifacts are committed.
- **No grader weakened to fit a result.** Criteria may never be changed after a
  failure to produce a pass (D14). A scenario found invalid gets a new manifest
  `version` and the old failure stays.
