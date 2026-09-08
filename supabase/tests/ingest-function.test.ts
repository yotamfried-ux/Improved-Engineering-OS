/**
 * The `ingest` Edge Function's request path (D22, D22.5).
 *
 * The database tests next door prove what the plane refuses. These prove what
 * the function refuses *before* the plane is touched at all -- which is the
 * other half of D22.5's invariants, and the half a database cannot enforce:
 * body-size limits, rate limits, a closed route list, and a token whose shape
 * is checked before it is hashed.
 *
 * The RPC is injected, so every case here runs without a network and without a
 * database. That is deliberate: a test that needed both would be a test people
 * skip, and these are the checks that stand between a probe and the plane.
 */

import { describe, expect, it } from 'vitest';
import {
  handleIngest,
  isWellFormedToken,
  MAX_BODY_BYTES,
  RateLimiter,
  refusalForDatabaseError,
  ROUTES,
  secretKeyFrom,
  timingSafeEqual,
  TOKEN_HEADER,
  tokenHash,
  toByteaLiteral,
  type RpcCaller,
} from '../functions/ingest/index.ts';

const TOKEN = 'a'.repeat(43);

/** Records what reached the database, so "never called" is checkable. */
function spyRpc(answer: Awaited<ReturnType<RpcCaller>> = { ok: true, data: { count: 0 } }): {
  rpc: RpcCaller;
  calls: { route: string; args: Record<string, unknown> }[];
} {
  const calls: { route: string; args: Record<string, unknown> }[] = [];
  const rpc: RpcCaller = (route, args) => {
    calls.push({ route, args });
    return Promise.resolve(answer);
  };
  return { rpc, calls };
}

function post(
  route: string,
  body: unknown,
  headers: Record<string, string> = { [TOKEN_HEADER]: TOKEN },
): Request {
  return new Request(`https://plane.invalid/ingest/${route}`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const deps = (rpc: RpcCaller, limiter = new RateLimiter()) => ({ rpc, limiter, now: () => 1000 });

describe('what never reaches the Evidence Plane', () => {
  it('refuses a request with no token, without calling the database', () => {
    const { rpc, calls } = spyRpc();
    return handleIngest(post('ingest_events', { events: [] }, {}), deps(rpc)).then((response) => {
      expect(response.status).toBe(401);
      expect(response.body['code']).toBe('missing_installation_token');
      expect(calls).toEqual([]);
    });
  });

  it('refuses a token that cannot be one of ours before hashing it', async () => {
    // D22.5 requires ≥ 256 bits from a CSPRNG. A two-character token is not a
    // guess worth a database round trip, and refusing it here means a probe
    // costs the plane nothing.
    const { rpc, calls } = spyRpc();
    const response = await handleIngest(
      post('ingest_events', { events: [] }, { [TOKEN_HEADER]: 'ab' }),
      deps(rpc),
    );
    expect(response.status).toBe(401);
    expect(response.body['code']).toBe('malformed_installation_token');
    expect(calls).toEqual([]);
  });

  it('refuses an unknown route rather than forwarding it', async () => {
    // The route list is closed. A passthrough would make every future RPC
    // callable from the internet the day it was written.
    const { rpc, calls } = spyRpc();
    const response = await handleIngest(post('drop_everything', {}), deps(rpc));
    expect(response.status).toBe(404);
    expect(calls).toEqual([]);
  });

  it('refuses a body over the limit, measured in bytes and not characters', async () => {
    // A body of multi-byte characters is larger than its string length
    // suggests. Measuring characters would let a caller past the limit by
    // writing in a language with wider code points.
    const { rpc, calls } = spyRpc();
    const oversized = '"' + '€'.repeat(MAX_BODY_BYTES / 2) + '"';
    expect(oversized.length).toBeLessThan(MAX_BODY_BYTES);
    const response = await handleIngest(post('ingest_events', oversized), deps(rpc));
    expect(response.status).toBe(413);
    expect(calls).toEqual([]);
  });

  it('refuses a body that is not a JSON object', async () => {
    const { rpc, calls } = spyRpc();
    for (const body of ['[1,2,3]', 'null', 'not json at all']) {
      const response = await handleIngest(post('ingest_events', body), deps(rpc));
      expect(response.status).toBe(400);
    }
    expect(calls).toEqual([]);
  });

  it('refuses anything but POST', async () => {
    const { rpc, calls } = spyRpc();
    const response = await handleIngest(
      new Request('https://plane.invalid/ingest/ingest_events', {
        method: 'GET',
        headers: { [TOKEN_HEADER]: TOKEN },
      }),
      deps(rpc),
    );
    expect(response.status).toBe(404);
    expect(calls).toEqual([]);
  });
});

describe('rate limiting (D22.5)', () => {
  it('lets a burst through and then refuses, per installation', async () => {
    const limiter = new RateLimiter(3, 60_000);
    const { rpc, calls } = spyRpc();
    const send = () => handleIngest(post('ingest_events', { events: [] }), deps(rpc, limiter));
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    const refused = await send();
    expect(refused.status).toBe(429);
    // The refused request cost the plane nothing.
    expect(calls).toHaveLength(3);
  });

  it('counts one installation separately from another', () => {
    const limiter = new RateLimiter(1, 60_000);
    expect(limiter.allow('inst-a', 0)).toBe(true);
    expect(limiter.allow('inst-a', 0)).toBe(false);
    expect(limiter.allow('inst-b', 0)).toBe(true);
  });

  it('opens a fresh window once the old one has passed', () => {
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.allow('k', 0)).toBe(true);
    expect(limiter.allow('k', 500)).toBe(false);
    expect(limiter.allow('k', 1001)).toBe(true);
  });
});

describe('what the function hands the database', () => {
  it('sends a token hash and never an installation id', async () => {
    // This function holds the only privileged client in the system. If it could
    // name a principal, holding the service key would be enough to insert as
    // any installation. It cannot: the RPC resolves the caller from the hash.
    const { rpc, calls } = spyRpc();
    await handleIngest(post('ingest_events', { events: [{ event_id: 'e' }] }), deps(rpc));
    const args = calls[0]?.args ?? {};
    expect(Object.keys(args).sort()).toEqual(['p_events', 'p_token_hash']);
    expect(String(args['p_token_hash'])).toMatch(/^\\x[0-9a-f]{64}$/u);
  });

  it('passes only the fields of each route’s contract (D22.5)', async () => {
    // Built per route rather than spread from the payload. A spread would make
    // any future column client-settable the day it was added.
    const { rpc, calls } = spyRpc();
    await handleIngest(
      post('ingest_events', {
        events: [{ event_id: 'e' }],
        installation_id: 'inst_someone_else',
        origin_class: 'qualification',
        owner_id: 'someone',
      }),
      deps(rpc),
    );
    expect(Object.keys(calls[0]?.args ?? {}).sort()).toEqual(['p_events', 'p_token_hash']);
  });

  it('accepts origin_class on register_run only, where D36 puts that authority', async () => {
    const { rpc, calls } = spyRpc();
    await handleIngest(
      post('register_run', { run_id: 'run_a', origin_class: 'qualification' }),
      deps(rpc),
    );
    expect(calls[0]?.args['p_origin_class']).toBe('qualification');
    // And the database still re-checks the scope, so this is not the decision.
  });

  it('routes each RPC in the closed list', async () => {
    for (const route of ROUTES) {
      const { rpc, calls } = spyRpc();
      const response = await handleIngest(post(route, { kind: 'health' }), deps(rpc));
      expect(response.status, `${route} was refused`).toBe(200);
      expect(calls[0]?.route).toBe(route);
    }
  });
});

describe('how a database refusal reaches the client', () => {
  it('keeps revoked and expired distinct, so doctor can say which (D22.5)', () => {
    expect(refusalForDatabaseError('ERROR: ieos_revoked_token')).toBe('revoked_token');
    expect(refusalForDatabaseError('ERROR: ieos_expired_token')).toBe('expired_token');
    expect(refusalForDatabaseError('ERROR: ieos_unknown_token')).toBe('unknown_token');
    expect(refusalForDatabaseError('ERROR: ieos_missing_scope_run.register')).toBe('missing_scope');
    expect(refusalForDatabaseError('ERROR: ieos_late_registration')).toBe('late_registration');
  });

  it('turns an unrecognised failure into a failure, never into a success', async () => {
    // A client that read an unknown error as 200 would acknowledge events the
    // plane never took, and the outbox would delete them.
    const { rpc } = spyRpc({ ok: false, message: 'something nobody anticipated' });
    const response = await handleIngest(post('ingest_events', { events: [] }), deps(rpc));
    expect(response.status).toBe(502);
    expect(response.body['code']).toBe('evidence_plane_unavailable');
  });

  it('never writes an upstream message into the response body', async () => {
    // This found a real leak: `detail` used to be the database's own error
    // text, so whatever the plane put in an error -- a parameter value, a row,
    // a token -- came back to the caller. The rule now is that nothing
    // arriving from outside the function reaches a response body, and the
    // operator reads the raw message in the function's log instead.
    const secret = `sb_secret_${'x'.repeat(24)}`;
    const { rpc } = spyRpc({ ok: false, message: `bad token ${TOKEN} key ${secret}` });
    const response = await handleIngest(post('ingest_events', { events: [] }), deps(rpc));
    const rendered = JSON.stringify(response.body);
    expect(rendered).not.toContain(TOKEN);
    expect(rendered).not.toContain(secret);
    expect(response.body['detail']).toBe('the Evidence Plane refused or was unreachable');
  });

  it('gives every refusal a sentence a person can act on', async () => {
    // A code alone tells a machine what happened. `ieos doctor` is read by a
    // person, and "rotate" and "renew" are different instructions.
    const { rpc } = spyRpc({ ok: false, message: 'ERROR: ieos_revoked_token' });
    const revoked = await handleIngest(post('ingest_events', { events: [] }), deps(rpc));
    expect(String(revoked.body['detail'])).toContain('ieos auth enroll');

    const { rpc: expiredRpc } = spyRpc({ ok: false, message: 'ERROR: ieos_expired_token' });
    const expired = await handleIngest(post('ingest_events', { events: [] }), deps(expiredRpc));
    expect(String(expired.body['detail'])).toContain('ieos auth rotate');
  });
});

describe('the primitives D22.5 names', () => {
  it('compares in constant time, examining every byte', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    expect(timingSafeEqual(a, new Uint8Array([1, 2, 3, 4]))).toBe(true);
    expect(timingSafeEqual(a, new Uint8Array([1, 2, 3, 5]))).toBe(false);
    // A difference in the FIRST byte is the case a short-circuiting comparison
    // would answer fastest, which is what makes it an oracle.
    expect(timingSafeEqual(a, new Uint8Array([9, 2, 3, 4]))).toBe(false);
    expect(timingSafeEqual(a, new Uint8Array([1, 2, 3]))).toBe(false);
  });

  it('accepts a 43-character base64url token and rejects anything shorter', () => {
    // 32 random bytes, base64url-encoded, is 43 characters -- the ≥ 256 bits
    // D22.5 requires.
    expect(isWellFormedToken('a'.repeat(43))).toBe(true);
    expect(isWellFormedToken('a'.repeat(42))).toBe(false);
    expect(isWellFormedToken(`${'a'.repeat(42)}/`)).toBe(false);
    expect(isWellFormedToken('')).toBe(false);
  });

  it('hashes to 32 bytes and renders the literal PostgREST accepts', async () => {
    const hash = await tokenHash('token');
    expect(hash.length).toBe(32);
    expect(toByteaLiteral(hash)).toMatch(/^\\x[0-9a-f]{64}$/u);
    // The same token always hashes the same, or a rotated token would look new.
    expect(toByteaLiteral(await tokenHash('token'))).toBe(toByteaLiteral(hash));
    expect(toByteaLiteral(await tokenHash('token '))).not.toBe(toByteaLiteral(hash));
  });

  it('pads a byte below 16 rather than emitting a short literal', async () => {
    // A missing leading zero produces a literal of the wrong length that
    // PostgreSQL either rejects or, worse, reads as a different value.
    expect(toByteaLiteral(new Uint8Array([0, 1, 15, 16, 255]))).toBe('\\x00010f10ff');
  });
});

describe('reading the service key (a detail D22 omits)', () => {
  it('reads SUPABASE_SECRET_KEYS as an object keyed by name', () => {
    expect(secretKeyFrom('{"default":"sb_secret_value"}')).toBe('sb_secret_value');
    expect(secretKeyFrom('{"ingest":"other"}', 'ingest')).toBe('other');
  });

  it('fails loudly on the shape D22 implies but the platform does not use', () => {
    // Reading it as a plain string yields a client that authenticates as nobody
    // and fails like a network error -- which is the wrong thing to debug.
    expect(() => secretKeyFrom('sb_secret_plain_string')).toThrow(
      /valid JSON|object keyed by name/u,
    );
    expect(() => secretKeyFrom(undefined)).toThrow(/not set/u);
    expect(() => secretKeyFrom('{"other":"x"}')).toThrow(/no string entry named "default"/u);
  });
});
