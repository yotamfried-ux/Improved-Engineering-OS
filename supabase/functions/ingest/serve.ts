/**
 * The deploy entrypoint for the `ingest` Edge Function (D22, D22.5).
 *
 * `index.ts` is the tested logic: `handleIngest` and everything it calls are
 * plain functions with an injected `RpcCaller`, exercised under Vitest with no
 * network and no `Deno` global (`supabase/tests/ingest-function.test.ts` imports
 * that file directly). `Deno.serve` cannot live there -- calling it at module
 * load time would run at Vitest's import step, on a runtime that has no `Deno`
 * global, and break every test in that file before any test body runs.
 *
 * This file is the other half: the real `RpcCaller`, built from the project's
 * own secret key, wired to `handleIngest` through `Deno.serve`. It is deploy
 * surface, not test surface, and it is intentionally thin -- everything that
 * decides what a request means still lives in `index.ts`.
 */

import {
  handleIngest,
  RateLimiter,
  secretKeyFrom,
  type HandlerDeps,
  type RpcCaller,
} from './index.ts';

// `SUPABASE_URL` is provided to every Edge Function by the platform. Reading
// it lazily (inside the handler, not at module load) keeps this file
// importable in a context that has not set it -- there is none in practice,
// but nothing here should assume one.
function projectUrl(): string {
  const url = Deno.env.get('SUPABASE_URL');
  if (url === undefined || url === '') {
    throw new Error('SUPABASE_URL is not set; the function has no project to call');
  }
  return url;
}

/**
 * Build the real `RpcCaller`: a PostgREST RPC call authenticated as the
 * project's secret key, which is what makes the database's `grant ... to
 * service_role` take effect. Nothing here chooses which installation a
 * request acts as -- that is still the token hash `index.ts` puts in `args`.
 */
function makeRpcCaller(secretKey: string, baseUrl: string): RpcCaller {
  return async (route, args) => {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/rest/v1/rpc/${route}`, {
        method: 'POST',
        headers: {
          apikey: secretKey,
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
      });
    } catch (error) {
      // A network failure reaching the plane is exactly the shape `upstream`
      // exists for: `refusalForDatabaseError` falls through to it for any
      // message it does not recognise, and this message will not match one of
      // the `ieos_*` codes.
      return { ok: false, message: error instanceof Error ? error.message : 'fetch failed' };
    }

    if (response.ok) {
      return { ok: true, data: await response.json() };
    }

    // PostgREST reports a raised PL/pgSQL exception with the exception's own
    // message text in the `message` field of its JSON error body -- the same
    // text `refusalForDatabaseError` matches against (`ieos_unknown_token`
    // and so on). Falling back to the response's own text keeps a malformed
    // or unexpected error body from throwing here instead of refusing there.
    let message: string;
    try {
      const body = (await response.json()) as { message?: unknown };
      message = typeof body.message === 'string' ? body.message : JSON.stringify(body);
    } catch {
      message = await response.text().catch(() => `HTTP ${response.status}`);
    }
    return { ok: false, message };
  };
}

const limiter = new RateLimiter();
const deps: HandlerDeps = {
  rpc: makeRpcCaller(secretKeyFrom(Deno.env.get('SUPABASE_SECRET_KEYS')), projectUrl()),
  limiter,
  now: () => Date.now(),
};

Deno.serve((request) => {
  return handleIngest(request, deps).then(
    (response) =>
      new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
});
