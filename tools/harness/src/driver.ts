/**
 * Agent driver port, and a deterministic fake (ADR-0005, deviation C-5).
 *
 * No Claude- or Codex-specific code exists at Stage 0. Which agent is primary
 * for the Stage 3 slice is an open question (plan section 3, O-3), and this port
 * means answering it changes no contract.
 *
 * `FakeAgentDriver` exists so the harness itself is testable without a vendor
 * CLI, an API key or a spend decision. It is a test double, not a stand-in for
 * a trial: `TrialOutcome.driverKind` records which produced a result, so a fake
 * run can never be mistaken for a real one in a report.
 */

import type { IsolationReport } from './isolation.ts';
import type { Trial } from './sandbox.ts';

export interface TrialTask {
  readonly taskId: string;
  /** The prompt the agent receives. No EOS coaching, per the Stage 3 hidden condition. */
  readonly prompt: string;
  readonly budget: { readonly wallClockSeconds: number; readonly maxToolCalls: number };
}

export interface ToolCallRecord {
  readonly name: string;
  readonly at: string;
}

/**
 * What one agent run consumed.
 *
 * Nullable on {@link DriverResult} rather than optional, because "this driver
 * cannot report cost" and "this run cost nothing" are different facts and a
 * missing field would collapse them. TD-20 exists because trial cost went
 * unmeasured, so a driver that can report it must, and one that cannot has to
 * say so out loud.
 */
export interface AgentRunUsage {
  readonly wallClockSeconds: number;
  readonly costUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly cacheCreationInputTokens: number;
  /**
   * Every input token the turn consumed: uncached, cache reads and cache writes.
   *
   * Derived rather than measured, and recorded because reading `inputTokens`
   * alone invites the mistake it is named after. A real trial here reports 36
   * uncached input tokens beside 879,130 cache reads, so the bare field looks
   * like a broken counter and is in fact the small remainder. Kept alongside
   * the three parts, never instead of them: the parts price differently, so
   * `costUsd` stays the number a budget is enforced on.
   */
  readonly totalInputTokens: number;
  readonly turns: number;
}

/** What the harness asked for, and what the agent reported actually running. */
export interface AgentModel {
  /** The model the harness requested, or `null` when it named none. */
  readonly requested: string | null;
  /**
   * The model the agent says it ran, from its own start-up event.
   *
   * `null` when the agent did not report one, which is not the same as it
   * having matched: a silent substitution and an unreported model look alike
   * from the configuration alone, which is why this is read from the run.
   */
  readonly resolved: string | null;
}

export interface DriverResult {
  readonly completed: boolean;
  readonly toolCalls: readonly ToolCallRecord[];
  readonly transcriptRef: string | null;
  /** `null` when the driver has no way to report consumption. */
  readonly usage: AgentRunUsage | null;
  /** Absent for a driver that runs no model at all. */
  readonly model?: AgentModel;
}

/**
 * What a real driver must provide. Implemented at Stage 2/3 for the primary
 * agent, and at Stage 8 for the second one.
 */
export interface AgentDriver {
  /** Vendor-neutral label recorded in the run metadata, never branched on. */
  readonly kind: string;
  run(trial: Trial, task: TrialTask): Promise<DriverResult>;
}

export interface TrialOutcome {
  readonly trialId: string;
  readonly taskId: string;
  readonly driverKind: string;
  readonly result: DriverResult;
  readonly isolation: IsolationReport;
  /**
   * Only true when the run was registered AND every required boundary was
   * proven. Both halves matter: D36 says an unregistered run is `operational`,
   * and ADR-0005 says an unproven boundary is not a boundary.
   */
  readonly qualificationEligible: boolean;
  readonly reasons: readonly string[];
}

/** Deterministic driver for testing the harness. Never used in a real trial. */
export class FakeAgentDriver implements AgentDriver {
  readonly kind = 'fake';
  readonly #toolCalls: readonly string[];
  readonly #completed: boolean;

  constructor(options: { toolCalls?: readonly string[]; completed?: boolean } = {}) {
    this.#toolCalls = options.toolCalls ?? ['resolve'];
    this.#completed = options.completed ?? true;
  }

  run(_trial: Trial, _task: TrialTask): Promise<DriverResult> {
    return Promise.resolve({
      completed: this.#completed,
      // A fixed timestamp: a fake that varied would make harness tests flaky for
      // no reason and hide real nondeterminism behind noise.
      toolCalls: this.#toolCalls.map((name) => ({ name, at: '2026-09-04T00:00:00.000Z' })),
      transcriptRef: null,
      // Zeroes, not null: a fake really does consume nothing, and that is a
      // measurement rather than an inability to measure.
      usage: {
        wallClockSeconds: 0,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        totalInputTokens: 0,
        turns: 0,
      },
    });
  }
}
