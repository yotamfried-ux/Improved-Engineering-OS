# A fail-closed guard that tests a weaker precondition than the operation it protects

## מה קרה
PR #271 closed a real fail-open: hook commands wired as a bare `bash "<root>/..."` exit 127 when
the Engineering OS runtime is unreachable, and PreToolUse treats every status other than 2 as a
non-blocking error, so a session under `remote_handoff.mode=required` ran to completion with no
telemetry and reported success. The fix wrapped the command and added a bootstrap that denies when
the wrapper is missing.

The bootstrap tested `[ -r "$GATE" ]`. Live review on the downstream project-8 PR pointed out that
a directory is readable. Measured: `[ -r <dir> ]` is true, `[ -f <dir> ]` is false, and
`bash <dir>` exits **126**. So the *absent* wrapper denied, while a readable directory at the same
path reached bash and stepped aside exactly as 127 used to.

The measured case is a readable **directory**, and the claims here are limited to it. Other readable
non-regular nodes were not measured and are not equivalent — a FIFO, for one, can block on open
rather than return any status, which is a different failure needing a different remedy.

The soft form was wrong in a second way: it also invoked the directory and exited **126**. That is a
non-zero process status, not a `PreToolUse` denial — only exit 2 denies — but a hook whose entire
contract is *never block* is defined to warn and exit 0, so any non-zero status makes it report a
failure it is not supposed to be able to have.

## שורש הבעיה
The guard asked whether the file could be **read**. The operation it guarded was to **run** the
file as a script. Readable is a strictly weaker property than runnable-as-a-regular-file, so the
guard admitted a set of states the operation cannot handle, and every one of those states landed
in the fail-open gap the guard existed to close.

This is not a missed edge case; it is a category error that is easy to repeat, because the weaker
test is usually the one that reads naturally ("is it there?") while the operation needs something
narrower. The same shape appears wherever a precondition is a convenient proxy rather than the
actual requirement: checking that a path exists before opening it for write, that a value is
non-empty before parsing it, that a process is running before assuming it is serving.

The compounding error was mine and worth naming separately. In PR #271 I argued explicitly that
tests must **execute** rendered hook commands rather than inspect their text, because the defect
lives in the exit status the shell produces. I then wrote the downstream validator in project-8
as a set of string checks over the same commands. Both weaknesses reviewers found in that
validator — an `exit 2` that appears in the text but is unreachable, and a recorder named in a
shell comment — would have been impossible to write had the validator run the command instead.
Stating a principle in one artifact does not carry it into the next one.

## השערות שנבדקו
- The reported case is theoretical and a directory would never appear at the wrapper path —
  **rejected**: the mechanism does not depend on how it arises, and a partial or interrupted
  install is an ordinary way to produce one. It was reproduced in one command.
- `[ -e ]` is enough — **rejected**: it is true for a directory as well, so it fixes nothing.
- Map any non-zero wrapper-launch status to exit 2 in the command — **rejected**: that also
  swallows the wrapper's own deliberate statuses, so a genuine bug inside `hook-gate.sh` would be
  reported as a policy denial instead of surfacing.
- The soft form can keep `[ -r ]` because soft hooks never block — **rejected**: measured, it
  invoked the directory and exited 126, which is precisely the blocking it must never do.

## ראיה
Measured before acting rather than accepting the review: `[ -r <dir> ]` true, `[ -f <dir> ]` false,
`bash <dir>` exit 126 with `Is a directory`. Measured again after the fix in the same environment:
hard exits 2 with `ERROR_FOR_AGENT`, soft exits 0 with `WARNING_FOR_AGENT` and never invokes the
path. The readable-only test was present in two renderers and four places, not the one file review
pointed at. Raised independently by two reviewers on `yotamfried-ux/project-8#10`.

## רמת ביטחון
High

## איך מזהים מוקדם
For any guard that decides whether to proceed, write down the operation it protects and the
property the guard tests, then ask whether the second implies the first. If the guard tests a
convenient proxy — readable instead of runnable, exists instead of writable, present instead of
valid — the difference between the two is a live failure path, and for a fail-closed guard that
difference is a fail-open path. The signal is a one-word mismatch between the test and the verb it
guards.

A second, cheaper signal: a guard whose regression only inspects text. If no test executes the
guarded command, nothing can distinguish a guard that denies from one that merely looks like it
does.

## איך מונעים בעתיד
Both renderers now test `[ -f "$W" ] && [ -r "$W" ]` before invoking a wrapper, in the hard and the
soft form, so the precondition matches the operation. `[ -f ]` follows symlinks and tests the
target, so a symlink to a real wrapper still works while a symlink to a directory does not.

`scripts/enforcement/tests/test-hook-home-resolution.sh` gained two cases that **execute** the
rendered commands against a wrapper path that is a readable directory, one per form. Each asserts
an exact outcome — hard exits 2, soft exits 0 and emits its warning — rather than "not a pass". The
fixture also asserts its own premise first: the path must satisfy `[ -r ]` and fail `[ -f ]`, so
the case cannot silently stop reproducing the shape it exists to cover. Both cases return 126
against the pre-change form, which is what makes them non-vacuous rather than merely green.

## טסט רגרסיה
scripts/enforcement/tests/test-hook-home-resolution.sh

## סטטוס הבשלה
Verified Lesson

## Applies To Paths
- scripts/enforcement
- scripts/monitoring
- scripts/enforcement/tests

## Domain Tags
- enforcement
- hooks
- fail-closed
- verification

## Prevented Future Issues: 0
