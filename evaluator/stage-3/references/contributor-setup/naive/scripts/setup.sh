#!/usr/bin/env bash
# The plausible wrong answer: the plugin is assumed to be on the official
# marketplace, which is the attempt the record says was tried and failed.
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
claude plugin install superpowers@claude-plugins-official || echo "    already installed"

echo "setup complete"
