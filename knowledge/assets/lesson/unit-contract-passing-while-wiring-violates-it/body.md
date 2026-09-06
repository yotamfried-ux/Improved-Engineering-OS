# A unit-level contract test cannot prove the wiring that invokes the unit

## מה קרה

PR #266 gave the required hook set one canonical owner and rendered every surface from it. Classifying the three terminal boundaries (`Stop`, `StopFailure`, `SessionEnd`) as `lifecycle`/`soft_setup` made the renderer wrap them in `scripts/enforcement/lib/soft-hook-gate.sh`. That wrapper ends in an unconditional `exit 0`. Under `remote_handoff.mode = "required"` a failed durable handoff would therefore have been reported to Claude Code as a cleanly closed session while no telemetry bundle was produced. Project 8 runs `mode: required`, so the next qualification run would have looked successful and produced nothing. The full 112-suite enforcement run passed; an external reviewer found it.

## שורש הבעיה

`scripts/enforcement/tests/test-dispatch-policy-isolation.sh` already asserts that a required boundary failure must not be swallowed, and its comment says so explicitly. But it invokes `eos-telemetry-dispatch.sh stop` **directly**, not the command that actually lands in `.claude/settings.json`. The contract was therefore verified at the unit level and violated at the wiring level, and no check compared the two. This is the same defect class the PR itself was fixing — declared criticality disagreeing with installed criticality — reproduced one layer up, in the tests rather than in the settings.

## השערות שנבדקו

- The reviewer was describing a theoretical path — rejected: rendering the direct-mode `Stop` command against a unit that exits 2 returned 0, while invoking the same unit bare returned 2.
- Existing coverage would have caught it on the next run — rejected: the full suite was green on the exact commit that carried the defect.
- `lifecycle` was simply the wrong class — partly: the class is right, but class alone did not express that this unit's exit status must survive. The missing concept was failure propagation, not criticality.

## ראיה

Measured directly on the rendered command: gate-wrapped boundary returned `0` while the unit itself returned `2`. `soft-hook-gate.sh:39-46` shows the unconditional `exit 0` after `observe`. Codex review comment `#discussion_r3708433172` on PR #266.

## רמת ביטחון

High

## איך מזהים מוקדם

When a test asserts something about a hook unit, ask which string actually reaches the settings file. If the test builds its own invocation rather than the rendered one, it proves the unit and says nothing about the wiring. Any unit whose exit status is meaningful to the caller needs a test that runs the _rendered_ command, not the unit path.

## איך מונעים בעתיד

Give failure propagation its own declared semantics rather than inferring it from criticality: terminal boundaries now carry `propagate_failure` in `scripts/enforcement/hook-criticality.tsv` and render unwrapped. `check-hard-hook-contract.py` fails when a registered `propagate_failure` unit is wrapped in the fail-open soft gate, so the registry and the wiring cannot silently disagree again. The regression runs the rendered command against a deliberately failing unit and asserts a nonzero status, rather than asserting the absence of a wrapper.

## טסט רגרסיה

scripts/enforcement/tests/test-hook-boundary-parity.sh

## סטטוס הבשלה

Verified Lesson

## Applies To Paths

- scripts/enforcement
- scripts/monitoring

## Domain Tags

- enforcement
- testing
- telemetry
- hooks

## Prevented Future Issues: 0
