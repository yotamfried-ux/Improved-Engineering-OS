# CI fixtures must not assume host tool absence

## מה קרה
test-tests.sh missing-tool cases passed locally but failed in GitHub Actions run 28596073361 on PR #182: the cases expected exit 1 for a "missing" tool, but the gate exited 0 because the tool was actually present on the runner.

## שורש הבעיה
The fixtures' premise — "go/shellcheck are not installed" — was an environment fact, not a constructed fact. GitHub ubuntu runners preinstall go and shellcheck in /usr/bin, which was inside the test's controlled PATH, so the declared stack ran its checks instead of hitting the missing-tool branch. A second latent issue surfaced under a constrained PATH: tool_waived trimmed entries with xargs, which execs /bin/echo and fails when coreutils are not on PATH.

## השערות שנבדקו
- The new CI=true hard-fail logic itself was wrong — rejected: reproducing with CI=true locally kept all 16 cases green because the tools truly are absent in the container.
- The plan-selection change broke plan-scope in CI — rejected: the failing CI suite extracted from the job log was test-tests.sh, and the plan-scope fixture uses CLI mode with an explicit plan.
- Runner PATH differences — verified: /usr/bin/go and /usr/bin/shellcheck exist on ubuntu runners, satisfying `command -v` inside the restricted PATH.

## ראיה
Job log lines "missing tool in CI hard-fails (expected 1, got 0)" for five cases; after sandboxing, a verbose hermetic reproduction showed "xargs: echo: No such file or directory" and the waiver mismatch, and 16/16 pass in both env modes after the fix.

## רמת ביטחון
High

## איך מזהים מוקדם
Any fixture whose expected branch depends on a tool being absent must construct that absence (sandboxed PATH with explicit symlinks) rather than assume it; run the suite once with the tool present to see the premise break.

## איך מונעים בעתיד
Use a minimal-symlink PATH sandbox (runE_min pattern in test-tests.sh) for absence-dependent cases, and keep enforcement scripts free of implicit binary dependencies (pure-bash trimming instead of xargs) so they behave identically in constrained hook environments.

## טסט רגרסיה
scripts/enforcement/tests/test-tests.sh

## סטטוס הבשלה
Verified Lesson

## Applies To Paths
- scripts/enforcement/tests

## Domain Tags
- testing
- enforcement
- ci

## Prevented Future Issues: 0
