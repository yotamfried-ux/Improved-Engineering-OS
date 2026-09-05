/**
 * Run registration (D36) as the harness sees it.
 *
 * The harness is the service principal that pre-registers a run's
 * `origin_class` before its first event. A trial whose run was never registered
 * cannot be qualification evidence -- an unregistered run is `operational`, by
 * definition and not by policy.
 *
 * This is an in-memory stand-in for the `register_run` RPC. It exists at Stage 0
 * so the *rule* is enforced and tested from the first trial the harness ever
 * runs, rather than arriving with the Evidence Plane at Stage 2.
 */

import type { RegisterRunRequest } from '@ieos/core';
import { registerRunRequestSchema } from '@ieos/core';

export class LateRegistrationError extends Error {
  constructor(runId: string) {
    super(`run ${runId} already has events; register_run must precede the first event (D36)`);
    this.name = 'LateRegistrationError';
  }
}

export class RunRegistry {
  readonly #registered = new Map<string, RegisterRunRequest>();
  readonly #started = new Set<string>();

  /** @throws when the request is invalid, or the run already started. */
  register(request: RegisterRunRequest): void {
    const parsed = registerRunRequestSchema.parse(request);
    if (this.#started.has(parsed.run_id)) throw new LateRegistrationError(parsed.run_id);
    this.#registered.set(parsed.run_id, parsed);
  }

  /** Mark the run as having produced its first event; registration closes here. */
  markStarted(runId: string): void {
    this.#started.add(runId);
  }

  get(runId: string): RegisterRunRequest | undefined {
    return this.#registered.get(runId);
  }

  /**
   * The class the Evidence Plane would stamp on this run's events.
   *
   * Unregistered means `operational`, never anything stronger. This is the whole
   * of D36 in one line, and the reason a compromised agent cannot manufacture
   * qualification evidence.
   */
  originClassFor(runId: string): string {
    return this.#registered.get(runId)?.origin_class ?? 'operational';
  }

  isRegistered(runId: string): boolean {
    return this.#registered.has(runId);
  }
}
