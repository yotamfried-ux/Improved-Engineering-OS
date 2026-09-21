# superpowers — Behavioral Contract

## Functional Role

superpowers is a **planning-and-discipline layer** for Claude Code. It enforces a
structured, methodology-driven workflow — spec → plan → isolated branch → TDD
implementation → verification → review — rather than letting Claude jump directly
into writing code. The enforced workflows are mandatory by design, not suggestions.

## When to use

Invoke superpowers skills whenever:

- Implementing a new feature (any scope beyond a trivial one-liner)
- Fixing a non-obvious bug where root cause is not immediately confirmed
- Refactoring code that spans more than one file or concern
- Starting a task that requires coordination between parallel workstreams
- Preparing work for merge or code review

The `using-superpowers` skill (auto-injected at session start by the SessionStart hook)
checks for a relevant skill before Claude acts, so in practice the plugin self-activates
on qualifying tasks.

## When NOT to use

Do not invoke superpowers skills for:

- One-off questions or read-only exploration (no code change)
- Single-expression throwaway scripts with no persistence
- Lookup tasks (searching for a symbol, reading a file, answering a factual question)
- Trivial one-liner patches where the change and its test are self-evident

Forcing the full workflow onto trivial tasks adds overhead with no benefit.

## How it affects Claude's workflow

The enforced pipeline when superpowers is active:

```
1. brainstorming          → clarify the problem, identify constraints, draft spec
2. writing-plans          → decompose spec into bite-sized, ordered tasks
3. using-git-worktrees    → create an isolated worktree for the branch
4. executing-plans        → work the plan one task at a time
   └─ subagent-driven-development / dispatching-parallel-agents  (if tasks are independent)
   └─ test-driven-development     → write failing test FIRST, then implementation
   └─ systematic-debugging        → if anything breaks, follow the structured debug protocol
5. verification-before-completion → confirm all tests pass; do not declare done otherwise
6. requesting-code-review  → submit for review
7. receiving-code-review   → apply feedback
8. finishing-a-development-branch → clean up worktree, finalize PR
```

Claude does not advance to a later stage without completing the gates of the prior one.

## Concrete artifacts you invoke

All 14 skills are invoked through the Claude Code `Skill` tool.

| Skill | Purpose |
|-------|---------|
| `using-superpowers` | Auto-injected on session start; routes to the correct skill |
| `brainstorming` | Problem decomposition and spec drafting |
| `writing-plans` | Structured, bite-sized execution plan from a spec |
| `executing-plans` | Drives step-by-step execution of a written plan |
| `subagent-driven-development` | Delegates focused implementation to a subagent |
| `dispatching-parallel-agents` | Fans out independent tasks to parallel subagents |
| `test-driven-development` | Enforces RED → GREEN → REFACTOR cycle |
| `systematic-debugging` | Root-cause debugging protocol; stops random patching |
| `verification-before-completion` | Confirms tests/checks pass before declaring done |
| `requesting-code-review` | Prepares and submits work for review |
| `receiving-code-review` | Structures response to review feedback |
| `using-git-worktrees` | Isolates work in a git worktree |
| `finishing-a-development-branch` | Standardized branch-finish and PR checklist |
| `writing-skills` | Authoring guide for new superpowers-style skills |

## Composition

- **Role in the pipeline:** superpowers is a **planning-first** skill set. It runs at the
  beginning of any qualifying task, before any code is written or any tool that modifies
  files is called.
- **TDD and verification skills** participate in the coding phase and the transition to
  review; they do not run before the plan exists.
- **Review skills** (`requesting-code-review`, `receiving-code-review`) are the last gate
  before merge.
- **Security skills** (from `patterns/security/`) take precedence over superpowers
  methodology if a conflict arises (e.g., a security fix that must not be held behind a
  full brainstorm cycle). See [`core/precedence.md`](../../core/precedence.md).
- superpowers does not replace or override any Engineering OS quality gate defined in
  [`core/quality-gates.md`](../../core/quality-gates.md); it operates alongside them.
