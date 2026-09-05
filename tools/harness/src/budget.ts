/**
 * Trial budgets (TD-20, guide section 7 item 9).
 *
 * TD-20 records the failure this guards: unbudgeted agent-trial cost causes
 * stages to be skipped "for now". So a budget is declared per simulation and
 * the harness aborts at 2x it -- the multiplier the guide names.
 *
 * Nothing here invents a number. The budget is supplied by the manifest;
 * `docs/budgets.md` keeps every baseline empty until Stage 3 measures one.
 */

export interface TrialBudget {
  readonly wallClockSeconds: number;
  readonly maxToolCalls: number;
}

/** The guide's rule: the harness aborts at twice the declared budget. */
export const ABORT_MULTIPLIER = 2;

export interface BudgetUsage {
  readonly wallClockSeconds: number;
  readonly toolCalls: number;
}

export type BudgetState = 'within' | 'over_budget' | 'aborted';

export interface BudgetVerdict {
  readonly state: BudgetState;
  readonly reasons: readonly string[];
}

/**
 * Classify usage against a budget.
 *
 * Three states, not two: exceeding the budget is a measurement worth recording,
 * while exceeding twice it stops the trial. Collapsing them would either abort
 * usable trials or hide overruns.
 */
export function classifyUsage(budget: TrialBudget, usage: BudgetUsage): BudgetVerdict {
  const reasons: string[] = [];
  let state: BudgetState = 'within';

  const check = (name: string, used: number, allowed: number): void => {
    if (used > allowed * ABORT_MULTIPLIER) {
      state = 'aborted';
      reasons.push(
        `${name}: ${String(used)} exceeds ${String(ABORT_MULTIPLIER)}x the budget of ${String(allowed)}`,
      );
    } else if (used > allowed) {
      if (state !== 'aborted') state = 'over_budget';
      reasons.push(`${name}: ${String(used)} exceeds the budget of ${String(allowed)}`);
    }
  };

  check('wall clock seconds', usage.wallClockSeconds, budget.wallClockSeconds);
  check('tool calls', usage.toolCalls, budget.maxToolCalls);

  return { state, reasons };
}

/** True when the harness must stop the trial. */
export function mustAbort(verdict: BudgetVerdict): boolean {
  return verdict.state === 'aborted';
}
