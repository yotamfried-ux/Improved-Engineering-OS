#!/usr/bin/env bash
# Bring a clean machine to a working checkout. Idempotent by design: every step
# either does its work or reports that it was already done.
set -euo pipefail

echo "==> node"
node --version

echo "==> dependencies"
if [ -d node_modules ]; then
  echo "    already installed"
else
  npm install --no-audit --no-fund
fi

echo "==> git hooks"
if [ -f .git/hooks/pre-commit ]; then
  echo "    already installed"
else
  cp scripts/pre-commit .git/hooks/pre-commit
  chmod +x .git/hooks/pre-commit
fi

echo "==> claude code plugins"
# superpowers is not on the official marketplace; it ships from its own. The
# marketplace has to be added before anything can be installed from it.
claude plugin marketplace add obra/superpowers-marketplace || echo "    marketplace already added"
claude plugin install superpowers@superpowers-marketplace || echo "    plugin already installed"

echo "setup complete"
