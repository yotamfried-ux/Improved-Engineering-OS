/**
 * Registering a trial's run with the Evidence Plane (D36).
 *
 * Every case here is a failure case, because the success case is the one that
 * cannot go wrong quietly. A harness that recorded an unreachable plane as
 * "registered" would produce trials its report called qualification evidence
 * while the plane stamped every event `operational` -- two halves each
 * internally consistent and jointly false.
 */

import { describe, expect, it } from 'vitest';
import type { RegisterRunRequest } from '@ieos/core';
import { RunRegistry } from '../src/run-registry.ts';
import { httpRegisterRun, registerWithPlane } from '../src/plane-registrar.ts';

const request: RegisterRunRequest = {
  run_id: 'run_t1',
  origin_class: 'qualification',
  eval_set_version: 'stage-3',
  holdout_state: null,
  simulation_id: null,
};

describe('registering a run', () => {
  it('is plane-confirmed when the plane accepts', async () => {
    const registry = new RunRegistry();
    const result = await registerWithPlane(registry, request, () => Promise.resolve({ ok: true }));
    expect(result.confirmed).toBe(true);
    expect(registry.isConfirmedByPlane('run_t1')).toBe(true);
    expect(registry.originClassFor('run_t1')).toBe('qualification');
  });

  it('records intent but NOT confirmation when the plane refuses', async () => {
    const registry = new RunRegistry();
    const result = await registerWithPlane(registry, request, () =>
      Promise.resolve({ ok: false, reason: 'missing_scope' }),
    );
    expect(result.confirmed).toBe(false);
    expect(result.reason).toContain('missing_scope');
    // Registered, so the report can say what the harness meant -- and
    // `operational`, because that is what the plane will stamp.
    expect(registry.isRegistered('run_t1')).toBe(true);
    expect(registry.originClassFor('run_t1')).toBe('operational');
  });

  it('treats a thrown transport error as a refusal, not as a success', async () => {
    const registry = new RunRegistry();
    const result = await registerWithPlane(registry, request, () =>
      Promise.reject(new Error('socket hang up')),
    );
    expect(result.confirmed).toBe(false);
    expect(result.reason).toContain('socket hang up');
    expect(registry.originClassFor('run_t1')).toBe('operational');
  });

  it('records intent when no plane is enrolled at all', async () => {
    const registry = new RunRegistry();
    const result = await registerWithPlane(registry, request, null);
    expect(result.confirmed).toBe(false);
    expect(result.reason).toContain('no Evidence Plane is enrolled');
    expect(registry.originClassFor('run_t1')).toBe('operational');
  });

  it('never throws, so an observability outage does not stop the trial', async () => {
    // The same inversion D23 forbids one layer down: telemetry deciding
    // whether work may proceed.
    const registry = new RunRegistry();
    await expect(
      registerWithPlane(registry, request, () => Promise.reject(new Error('boom'))),
    ).resolves.toBeDefined();
  });
});

describe('the transport', () => {
  it('refuses a cleartext endpoint before the service token can be sent', () => {
    let calls = 0;
    const fetch = (() => {
      calls += 1;
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as unknown as typeof globalThis.fetch;
    expect(() =>
      httpRegisterRun({ endpoint: 'http://plane.invalid/ingest', serviceToken: 't', fetch }),
    ).toThrow(/must use https/u);
    expect(calls).toBe(0);
  });

  it('sends the service token in the D22.2 header, to the register_run route', async () => {
    interface Seen {
      url: string;
      headers: Record<string, string>;
      body: string;
    }
    const seenCalls: Seen[] = [];
    const transport = httpRegisterRun({
      endpoint: 'https://plane.invalid/ingest/',
      serviceToken: 'a'.repeat(43),
      fetch: ((url: string, init: RequestInit) => {
        seenCalls.push({
          url,
          headers: init.headers as Record<string, string>,
          body: String(init.body),
        });
        return Promise.resolve(new Response('{}', { status: 200 }));
      }) as unknown as typeof globalThis.fetch,
    });
    await transport(request);
    const seen = seenCalls[0];
    expect(seen?.url).toBe('https://plane.invalid/ingest/register_run');
    expect(seen?.headers['X-IEOS-Installation-Token']).toBe('a'.repeat(43));
    expect(JSON.parse(seen?.body ?? '{}')).toEqual(request);
  });

  it('refuses a redirect instead of replaying the service token to its target', async () => {
    // The HTTPS check covers the URL written here, not one the far end names.
    // A 307/308 replays the body and this custom header -- which undici does
    // not strip the way it strips `authorization` -- and fetch does not refuse
    // an https->http hop, so following one would move the run-classifying
    // credential into cleartext.
    let seenRedirect: RequestInit['redirect'];
    const transport = httpRegisterRun({
      endpoint: 'https://plane.invalid/ingest',
      serviceToken: 'a'.repeat(43),
      fetch: ((_url: string, init: RequestInit) => {
        seenRedirect = init.redirect;
        return Promise.resolve(new Response('{}', { status: 200 }));
      }) as unknown as typeof globalThis.fetch,
    });
    await transport(request);
    expect(seenRedirect).toBe('error');
  });

  it('reads the refusal code from the body but does not need one', async () => {
    const withCode = httpRegisterRun({
      endpoint: 'https://plane.invalid/ingest',
      serviceToken: 'a'.repeat(43),
      fetch: (() =>
        Promise.resolve(
          new Response(JSON.stringify({ code: 'late_registration' }), { status: 409 }),
        )) as unknown as typeof globalThis.fetch,
    });
    expect(await withCode(request)).toEqual({
      ok: false,
      reason: 'the Evidence Plane refused register_run: late_registration',
    });

    // A refusal with an unreadable body is still a refusal.
    const withoutCode = httpRegisterRun({
      endpoint: 'https://plane.invalid/ingest',
      serviceToken: 'a'.repeat(43),
      fetch: (() =>
        Promise.resolve(
          new Response('<html>gateway</html>', { status: 502 }),
        )) as unknown as typeof globalThis.fetch,
    });
    expect((await withoutCode(request)).ok).toBe(false);
  });
});
