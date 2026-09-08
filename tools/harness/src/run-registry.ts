/**
 * Run registration (D36) as the harness sees it.
 *
 * The harness is the service principal that pre-registers a run's
 * `origin_class` before its first event. A trial whose run was never registered
 * cannot be qualification evidence -- an unregistered run is `operational`, by
 * definition and not by policy.
 *
 * From Stage 2 the registry also records WHERE a registration happened, and that
 * distinction is not bookkeeping. The Evidence Plane stamps `origin_class` from
 * its own `runs` table. A registration the harness made only in memory is a
 * claim about a row that does not exist there, so the plane will stamp
 * `operational` regardless -- and a harness that reported `qualification` on the
 * strength of its own map would be describing evidence that was never produced.
 *
 * So `originClassFor` answers one question and answers it honestly: what will
 * the plane stamp? Unconfirmed registrations answer `operational`, which is what
 * the plane will actually do.
 */

import type { RegisterRunRequest } from '@ieos/core';
import { registerRunRequestSchema } from '@ieos/core';

export class LateRegistrationError extends Error {
  constructor(runId: string) {
    super(`run ${runId} already has events; register_run must precede the first event (D36)`);
    this.name = 'LateRegistrationError';
  }
}

/**
 * Where a registration happened.
 *
 * `plane` means the `register_run` RPC accepted it and the Evidence Plane holds
 * a row. `local_only` means the harness recorded its intent and nothing else --
 * true when no plane is enrolled, which is the normal state before Stage 3's
 * first configured environment.
 */
export type RegistrationSource = 'plane' | 'local_only';

interface Registration {
  readonly request: RegisterRunRequest;
  readonly source: RegistrationSource;
}

export class RunRegistry {
  readonly #registered = new Map<string, Registration>();
  readonly #started = new Set<string>();

  /**
   * Record a registration.
   *
   * `source` is required rather than defaulted, because the two cases mean
   * different things about the evidence a trial can produce and a default would
   * pick one silently.
   *
   * @throws when the request is invalid, or the run already started.
   */
  register(request: RegisterRunRequest, source: RegistrationSource): void {
    const parsed = registerRunRequestSchema.parse(request);
    if (this.#started.has(parsed.run_id)) throw new LateRegistrationError(parsed.run_id);
    this.#registered.set(parsed.run_id, { request: parsed, source });
  }

  /** Mark the run as having produced its first event; registration closes here. */
  markStarted(runId: string): void {
    this.#started.add(runId);
  }

  get(runId: string): RegisterRunRequest | undefined {
    return this.#registered.get(runId)?.request;
  }

  /** Where this run was registered, if it was. */
  sourceFor(runId: string): RegistrationSource | undefined {
    return this.#registered.get(runId)?.source;
  }

  /**
   * The class the Evidence Plane would stamp on this run's events.
   *
   * Unregistered means `operational`, never anything stronger. This is the whole
   * of D36 in one line, and the reason a compromised agent cannot manufacture
   * qualification evidence.
   */
  originClassFor(runId: string): string {
    const registration = this.#registered.get(runId);
    if (registration === undefined) return 'operational';
    // A registration the plane never saw leaves no row for it to read, so it
    // will stamp the default. Reporting the intended class here would make the
    // harness the authority on classification, which is precisely what D36
    // takes away from everything except the plane's own record.
    if (registration.source !== 'plane') return 'operational';
    return registration.request.origin_class;
  }

  isRegistered(runId: string): boolean {
    return this.#registered.has(runId);
  }

  /** Registered somewhere the Evidence Plane will actually read. */
  isConfirmedByPlane(runId: string): boolean {
    return this.#registered.get(runId)?.source === 'plane';
  }
}
