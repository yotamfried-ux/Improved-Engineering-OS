/**
 * Registering a trial's run with the Evidence Plane (D36, D22).
 *
 * The harness is the service principal. This is the piece that turns that from
 * a statement into a row: it calls the `ingest` function's `register_run` route
 * with a service token and, only when the plane accepts, records the
 * registration as plane-confirmed.
 *
 * Everything here is about the failing case. A harness that treated an
 * unreachable plane as "registered anyway" would produce trials the report
 * called qualification evidence while the plane stamped every one of their
 * events `operational` -- a disagreement nothing downstream would surface,
 * because both halves would look internally consistent.
 *
 * The transport is injected. The harness has no business owning an HTTP client,
 * and the interesting behaviour -- what happens when registration fails -- needs
 * no network to test.
 */

import type { RegisterRunRequest } from '@ieos/core';
import { requireHttpsEndpoint } from './plane-ingest.ts';
import { RunRegistry } from './run-registry.ts';

/** The one call the harness makes against the Evidence Plane. */
export interface RegisterRunTransport {
  (
    request: RegisterRunRequest,
  ): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }>;
}

export interface RegistrationResult {
  readonly confirmed: boolean;
  /** Why the plane did not confirm, when it did not. */
  readonly reason: string | null;
}

/**
 * Register a run, recording where it landed.
 *
 * Never throws for a plane failure. A trial that cannot be registered is still
 * a trial worth running -- it produces `operational` evidence and the report
 * says so -- and refusing to run it would turn an observability outage into an
 * inability to work, which is the same inversion D23 forbids one layer down.
 */
export async function registerWithPlane(
  registry: RunRegistry,
  request: RegisterRunRequest,
  transport: RegisterRunTransport | null,
): Promise<RegistrationResult> {
  if (transport === null) {
    // No plane is enrolled. Recorded as intent, so the trial report can say
    // what the harness meant and what the plane will actually stamp.
    registry.register(request, 'local_only');
    return { confirmed: false, reason: 'no Evidence Plane is enrolled for this harness' };
  }

  let answer: Awaited<ReturnType<RegisterRunTransport>>;
  try {
    answer = await transport(request);
  } catch (error) {
    answer = { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }

  if (!answer.ok) {
    registry.register(request, 'local_only');
    return { confirmed: false, reason: answer.reason };
  }
  registry.register(request, 'plane');
  return { confirmed: true, reason: null };
}

/**
 * A transport over the `ingest` function's `register_run` route.
 *
 * Built here rather than in the function's own package because it is the
 * harness's client, and it carries a SERVICE token: the one credential in this
 * system that may classify a run. It never touches the installation token, and
 * a harness holding an installation token could not register anything -- the
 * plane's scope constraint sees to that.
 */
export function httpRegisterRun(options: {
  readonly endpoint: string;
  readonly serviceToken: string;
  readonly fetch: typeof globalThis.fetch;
}): RegisterRunTransport {
  const base = requireHttpsEndpoint(options.endpoint);
  return async (request) => {
    const response = await options.fetch(`${base}/register_run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // D22.2: the installation token header carries the service token too.
        // One header, one validation path; a second header for service
        // principals would be a second place for the check to be forgotten.
        'X-IEOS-Installation-Token': options.serviceToken,
      },
      body: JSON.stringify(request),
    });
    if (response.ok) return { ok: true };
    // The body carries a stable `code`. Read for the reason, never trusted to
    // decide anything: a non-2xx response is a refusal whatever it says.
    let code = String(response.status);
    try {
      const body = (await response.json()) as { code?: unknown };
      if (typeof body.code === 'string') code = body.code;
    } catch {
      // A refusal with an unreadable body is still a refusal.
    }
    return { ok: false, reason: `the Evidence Plane refused register_run: ${code}` };
  };
}
