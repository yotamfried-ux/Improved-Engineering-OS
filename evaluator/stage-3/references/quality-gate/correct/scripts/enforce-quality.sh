#!/usr/bin/env bash
# Quality gate for the staged diff.
#
# The split between blocking and warning is the project's, recorded in its quality
# gates: an unambiguous debug leftover or a merge-conflict marker must never reach a
# commit, while a stray log line is something a developer needs telling about rather
# than being stopped for. The bypass exists for the case where someone knows better,
# and is named so that its use is visible in a shell history.
set -euo pipefail

if [ "${EOS_BYPASS_CLEANUP:-}" = "1" ]; then
  echo "quality gate bypassed via EOS_BYPASS_CLEANUP=1" >&2
  exit 0
fi

staged="$(git diff --cached --name-only --diff-filter=ACM || true)"
[ -n "$staged" ] || exit 0

blocked=0
while IFS= read -r file; do
  [ -f "$file" ] || continue
  added="$(git diff --cached -U0 -- "$file" | grep -E '^\+' | grep -Ev '^\+\+\+' || true)"
  [ -n "$added" ] || continue

  if printf '%s' "$added" | grep -Eq '(^|[^[:alnum:]_])(debugger|breakpoint\(\)|pdb\.set_trace\(\)|import pdb|binding\.pry|byebug)'; then
    echo "BLOCKED $file: a debug leftover must not reach a commit" >&2
    blocked=1
  fi
  if printf '%s' "$added" | grep -Eq '^\+?(<<<<<<<|>>>>>>>)'; then
    echo "BLOCKED $file: a merge-conflict marker must not reach a commit" >&2
    blocked=1
  fi
  if printf '%s' "$added" | grep -Eq '(console\.log|[^[:alnum:]_]print\()'; then
    echo "WARNING $file: a leftover console.log/print was added; not blocking" >&2
  fi
done <<< "$staged"

exit "$blocked"
