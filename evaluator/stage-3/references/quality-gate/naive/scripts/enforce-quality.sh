#!/usr/bin/env bash
# The plausible wrong answer: everything that looks like debug output is treated the
# same way and blocked, and there is no bypass. Defensible reasoning, and not the rule
# this project recorded.
set -euo pipefail

staged="$(git diff --cached --name-only --diff-filter=ACM || true)"
[ -n "$staged" ] || exit 0

blocked=0
while IFS= read -r file; do
  [ -f "$file" ] || continue
  added="$(git diff --cached -U0 -- "$file" | grep -E '^\+' | grep -Ev '^\+\+\+' || true)"
  [ -n "$added" ] || continue
  if printf '%s' "$added" | grep -Eq '(debugger|console\.log|print\(|pdb\.set_trace|byebug|<<<<<<<)'; then
    echo "BLOCKED $file: debug output or conflict marker in the staged diff" >&2
    blocked=1
  fi
done <<< "$staged"

exit "$blocked"
