# Stage 3 — Real agent vertical slice

**Status: gate NOT PASSED.** `qualification/reports/stage-03-2026-09-12.md` —
harness-generated, 7 pass, 2 fail, 0 unproven. Nothing in this document decided that,
and this document is one of the things that report is meant to be able to contradict.
An earlier report, `stage-03-2026-09-11.md`, is kept and marked superseded rather than
replaced.

**The first diagnosis of the two failing rows as environment-only was incomplete.**
Subsequent wiring review found production defects on the path those rows measure: the
Claude hook composition root had no configured Evidence Plane ingest path, T7 was not
derived from trial telemetry, and the host/trial IPC protocol depended on EOF semantics
that fail on Windows named pipes. Those defects are fixed in code. A fresh qualification
bank is still blocked until an owner-run, no-model canary proves active installation and
Harness service credentials, pre-registration, platform-profile trial integrity, durable
ACK/drain, and a final `COMPLETE` + qualification-eligible run. The paid trials do not
start before that canary passes.

## What the stage actually found

The first bank — three tasks, six trials — was passed by the agent without consulting
EOS once, so it measured the agent's competence rather than the knowledge base. That was
the honest finding and it was not the end of it.

A second bank was then built from assets that were already in the corpus, and run in
**paired arms**: the `eos` arm offers the four EOS tools, the `native` arm is a project
without EOS at all. With the original bootstrap block, both arms failed identically and
`resolve` was called in **0 of 12** trials. Rewriting the block to say what the record is
_for_ (C-14) changed that on every task where the knowledge is genuinely not derivable:

| Task                         | native arm                              | eos arm                 |
| ---------------------------- | --------------------------------------- | ----------------------- |
| `plan-dod-external-gates`    | 4/6 rules, resolve not called           | **6/6, resolve called** |
| `commit-message-protocol`    | 3/5 rules, resolve not called           | **5/5, resolve called** |
| `quality-gate-cleanup`       | 6/8 rules, resolve not called           | see the report          |
| `plugin-install-marketplace` | passed — **retired as a discriminator** |                         |

So the binding constraint was never retrieval or the corpus. It was that nothing gave
the agent a reason to look, and the block was the only thing that could. The overhead
this buys is recorded in `docs/budgets.md` and is not small.

The corrections along the way are in the decision log rather than smoothed over: S-6
(the MCP server refused the era its clients speak), S-7 (the harness and the hooks used
different run ids), S-8 and S-9 (trials graded that the agent never attempted, or was
refused), S-12 (the `native` arm was mislabelled for three rounds — it withheld the tools
without removing the server), and two graders that fooled themselves, one of which
reproduced the very corpus lesson it was not testing.

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

| `setting_sources` | Answer          | Meaning                                                   |
| ----------------- | --------------- | --------------------------------------------------------- |
| `[]`              | `NONE`          | the target repo's own `CLAUDE.md` never reaches the agent |
| `['project']`     | `ZANZIBAR-7719` | the repo's own bootstrap block reaches the agent          |

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

## Qualification platform profiles

The owner's real v1 runtime is **native Windows**. Stage 3 therefore qualifies the
system on Windows rather than requiring the owner to maintain WSL solely for the
experiment. This is an owner-approved scope correction: the experiment must represent
the product that is actually used, not a stronger operating-system sandbox that the
product does not depend on.

`windows-personal-v1` is the canonical Stage 3 profile. It proves the controls the
Windows harness can actually observe and enforce:

- a fresh disposable task workspace, with before/after workspace-integrity probes;
- a child environment built from an explicit allowlist rather than inherited;
- installation, Harness service, and Supabase privileged credentials absent from the
  child environment by both name and value;
- `WebSearch` and `WebFetch` withheld from the subject agent;
- project-only Claude settings, exactly one task prompt, and closed stdin;
- Evidence Plane access only through the host-selected named-pipe proxy;
- pre-registration, durable acknowledgement, terminal flush, empty outbox, and
  `telemetry_state: COMPLETE` before the run is qualification eligible.

This profile **does not claim Windows PID, network, or host-filesystem kernel
confinement**. Network egress is not an isolation claim in personal v1, and an agent with
Bash may have the network access the owner's normal Windows session has. Likewise, the
workspace probe is evidence about the staged trial workspace, not a claim that Windows
prevents an absolute-path read elsewhere on the host. T3 records those limits explicitly
instead of turning an unmeasured property into a PASS.

The previous rootless Linux namespace mechanism is retained as the optional
`linux-namespace-v1` profile. It still proves user + mount + PID + network namespaces,
AF_UNIX socket mounting, and network allowlisting. It is useful for CI and for a future
owner who chooses Linux, but it is not a v1 product prerequisite and the current owner
does not need WSL or Linux packages to qualify or use the system.

## Qualification preflight and credentials

A qualification host owns two separate credentials, and neither enters the agent
process. The installation credential has only the D22 ingest scopes. The Harness
credential is a service principal with exactly `run.register`, so it can classify a Run
before the first event but cannot insert telemetry as an installation. Both raw tokens
stay in owner-only local credential files; the enrolment commands print only hash-bearing
SQL for the owner to apply to the Evidence Plane.

On native Windows, `pnpm stage3:preflight --host-only` requires the pinned Node 24
runtime plus Git and Claude Code. It does **not** require WSL, `unshare`, `slirp4netns`,
`iptables`, or other Linux namespace tooling.

```powershell
pnpm stage3:preflight --host-only
pnpm ieos auth enroll --owner <supabase-auth-user-uuid>
pnpm stage3:service-auth enroll --owner <supabase-auth-user-uuid>
# Apply both printed hash-only SQL statements as the owner.
$env:IEOS_INGEST_URL = "https://<project-ref>.supabase.co/functions/v1/ingest"
pnpm stage3:preflight
pnpm stage3:canary
```

The default files are `.ieos/credentials.json` and `.ieos/harness-service.json`. The
canary is no-model and fail-closed. On Windows it uses a named pipe; on the optional Linux
profile it uses the existing AF_UNIX socket mount. In both profiles the canary must prove
authenticated reachability, pre-registration, host-proxy IPC, credential
non-propagation, durable ingest acknowledgement, an empty outbox,
`telemetry_state: COMPLETE`, and qualification eligibility before any paid trial bank
starts.

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
- **No CI trial job.** Trials cost money and require owner credentials CI does not
  have. The harness's own unit tests — including Windows named-pipe coverage and
  the graders' positive, negative and mutation controls — run in CI with no paid
  agent trial; the trials themselves are owner-run and their artifacts are committed.
- **No grader weakened to fit a result.** Criteria may never be changed after a
  failure to produce a pass (D14). A scenario found invalid gets a new manifest
  `version` and the old failure stays.
