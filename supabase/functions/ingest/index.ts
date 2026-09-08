/**
 * The `ingest` Edge Function (D22, D22.5, D36).
 *
 * This is the only place in the system that holds a privileged database client,
 * and it is deployed `--no-verify-jwt` so the platform does not reject a request
 * before the function has had a chance to authenticate it itself. Both facts
 * make this file the credential boundary rather than a route in front of one.
 *
 * Verified against Supabase's own documentation rather than inferred:
 *
 *   `Authorization` is reserved for Supabase Auth JWTs and `apikey` for project
 *   keys, so the installation token travels in `X-IEOS-Installation-Token`
 *   (D22.2). Reusing `Authorization` would put the token where the platform
 *   will try to parse it as something else.
 *
 *   Edge Functions verify JWTs only for the anon/service keys; anything else is
 *   "your own authorization logic inside the function". That is what this is.
 *
 *   `SUPABASE_SECRET_KEYS` is a JSON object keyed by name, not a plain string.
 *   D22 does not say so, and reading it as a string yields a client that
 *   authenticates as nobody and fails in a way that looks like a network error.
 *
 * What this function deliberately does not do: it never chooses an
 * `installation_id`. It hashes the presented token and hands the hash to the
 * RPC, which resolves the principal itself. So even this file -- the one thing
 * holding the service key -- cannot insert as an installation whose token it
 * has not been given.
 */

// The database layer owns authorization; this layer owns transport, limits and
// the shape of a refusal. Keeping the split explicit is what makes the RPCs
// safe to call from anywhere the service key exists, rather than safe only
// because this file is careful.

/** Every request carries the installation token in this header (D22.2). */
export const TOKEN_HEADER = 'X-IEOS-Installation-Token';

/** D22.5: request body-size limit, enforced here rather than at the database. */
export const MAX_BODY_BYTES = 1_048_576;

/** D22.5: per-installation rate limit. */
export const RATE_LIMIT = { requests: 120, windowMs: 60_000 } as const;

/** The RPCs this function is willing to call. A closed list, not a passthrough. */
export const ROUTES = [
  'ingest_events',
  'ingest_observations',
  'ingest_context_snapshots',
  'read_minimal',
  'register_run',
] as const;
export type Route = (typeof ROUTES)[number];

export function isRoute(value: string): value is Route {
  return (ROUTES as readonly string[]).includes(value);
}

export interface IngestResponse {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

/**
 * The refusal vocabulary the runtime surfaces in `doctor` (D22.5).
 *
 * Distinct codes for revoked and expired, because "rotate your token" and
 * "renew your token" are different instructions and an owner who cannot tell
 * them apart will try the wrong one first.
 */
export const REFUSALS = {
  missing_token: { status: 401, code: 'missing_installation_token' },
  malformed_token: { status: 401, code: 'malformed_installation_token' },
  unknown_token: { status: 401, code: 'unknown_installation_token' },
  revoked_token: { status: 403, code: 'revoked_installation_token' },
  expired_token: { status: 403, code: 'expired_installation_token' },
  missing_scope: { status: 403, code: 'missing_scope' },
  not_an_installation: { status: 403, code: 'principal_kind_not_permitted' },
  unknown_route: { status: 404, code: 'unknown_route' },
  body_too_large: { status: 413, code: 'body_too_large' },
  malformed_body: { status: 400, code: 'malformed_body' },
  rate_limited: { status: 429, code: 'rate_limited' },
  late_registration: { status: 409, code: 'late_registration' },
  upstream: { status: 502, code: 'evidence_plane_unavailable' },
} as const;
export type RefusalKind = keyof typeof REFUSALS;

/**
 * Map a PostgreSQL error message onto a refusal.
 *
 * The database raises the authoritative refusal; this translates it for HTTP
 * without adding a second opinion. Anything unrecognised becomes a 502 rather
 * than a 200 with an empty body -- an unrecognised failure is still a failure,
 * and a client that reads it as success would acknowledge events the plane
 * never took.
 */
export function refusalForDatabaseError(message: string): RefusalKind {
  if (message.includes('ieos_unknown_token')) return 'unknown_token';
  if (message.includes('ieos_revoked_token')) return 'revoked_token';
  if (message.includes('ieos_expired_token')) return 'expired_token';
  if (message.includes('ieos_invalid_token')) return 'malformed_token';
  if (message.includes('ieos_missing_scope')) return 'missing_scope';
  if (message.includes('ieos_not_an_installation')) return 'not_an_installation';
  if (message.includes('ieos_not_a_service_principal')) return 'not_an_installation';
  if (message.includes('ieos_late_registration')) return 'late_registration';
  if (message.includes('ieos_batch_too_large')) return 'body_too_large';
  return 'upstream';
}

/**
 * Constant-time comparison of two byte strings (D22.5).
 *
 * Used where the function compares hashes itself. Length is compared first and
 * then every byte regardless -- an early return on the first difference is what
 * makes a naive comparison a timing oracle.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= (a[i] as number) ^ (b[i] as number);
  return difference === 0;
}

/**
 * Validate the presented token's shape before hashing it.
 *
 * D22.5 requires tokens of at least 256 bits from a CSPRNG. The encoding this
 * project mints is base64url of 32 random bytes, which is 43 characters. A
 * shorter string cannot be one of ours, and refusing it here means a probe with
 * a two-character token never reaches the database at all.
 */
export const MIN_TOKEN_CHARS = 43;

export function isWellFormedToken(value: string): boolean {
  return value.length >= MIN_TOKEN_CHARS && /^[A-Za-z0-9_-]+$/u.test(value);
}

/** Per-installation fixed-window counter, keyed by token hash rather than by id. */
export class RateLimiter {
  readonly #windows = new Map<string, { count: number; resetAt: number }>();
  readonly #limit: number;
  readonly #windowMs: number;

  constructor(limit: number = RATE_LIMIT.requests, windowMs: number = RATE_LIMIT.windowMs) {
    this.#limit = limit;
    this.#windowMs = windowMs;
  }

  /** True when the request is allowed. Keyed by hash: the token never enters a map. */
  allow(key: string, nowMs: number): boolean {
    const window = this.#windows.get(key);
    if (window === undefined || nowMs >= window.resetAt) {
      this.#windows.set(key, { count: 1, resetAt: nowMs + this.#windowMs });
      return true;
    }
    if (window.count >= this.#limit) return false;
    window.count += 1;
    return true;
  }
}

/** SHA-256 of a token, as raw bytes. Uses WebCrypto; no hashing is defined here. */
export async function tokenHash(token: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return new Uint8Array(digest);
}

/** `\x…` hex literal, the form PostgREST accepts for a `bytea` argument. */
export function toByteaLiteral(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return `\\x${hex}`;
}

/** The database call, injected so the request path is testable without a network. */
export interface RpcCaller {
  (
    route: Route,
    args: Record<string, unknown>,
  ): Promise<{ ok: true; data: unknown } | { ok: false; message: string }>;
}

export interface HandlerDeps {
  readonly rpc: RpcCaller;
  readonly limiter: RateLimiter;
  readonly now: () => number;
}

/**
 * The sentence a person reads in `ieos doctor`, per refusal.
 *
 * Fixed text, chosen here. An earlier version passed the upstream error message
 * through as `detail`, which is how a response body comes to contain whatever
 * the database happened to put in an error -- a parameter value, a row, a
 * token. A test caught it. The rule that replaced it is simple enough to hold:
 * nothing that arrives from outside this function is ever written into a
 * response body.
 */
const DETAILS: Readonly<Record<RefusalKind, string>> = {
  missing_token: `no ${TOKEN_HEADER} header`,
  malformed_token: 'the installation token is not the right shape',
  unknown_token: 'no installation matches this token',
  revoked_token: 'this installation token was revoked; enrol again with `ieos auth enroll`',
  expired_token: 'this installation token expired; renew it with `ieos auth rotate`',
  missing_scope: 'this principal does not hold the scope this call requires',
  not_an_installation: 'this principal kind may not call this RPC',
  unknown_route: 'no such RPC',
  body_too_large: 'the request body is larger than this endpoint accepts',
  malformed_body: 'the request body must be a JSON object',
  rate_limited: 'too many requests from this installation; retry after the window',
  late_registration: 'this run already has events; register_run must precede the first one',
  upstream: 'the Evidence Plane refused or was unreachable',
};

function refuse(kind: RefusalKind, upstreamMessage?: string): IngestResponse {
  const refusal = REFUSALS[kind];
  if (upstreamMessage !== undefined) {
    // The raw message goes to the function's own log, where the operator can
    // read it, and nowhere near the response. A caller learns the code, which
    // is what a caller needs to act.
    console.error(`ingest: ${refusal.code}: ${upstreamMessage}`);
  }
  return { status: refusal.status, body: { code: refusal.code, detail: DETAILS[kind] } };
}

/**
 * Handle one request.
 *
 * Order matters and is not arbitrary: shape, then size, then rate, then the
 * database. Every check that can be made without touching the plane is made
 * first, so a flood of malformed requests costs no database work.
 */
export async function handleIngest(request: Request, deps: HandlerDeps): Promise<IngestResponse> {
  if (request.method !== 'POST') {
    return refuse('unknown_route');
  }

  const route = new URL(request.url).pathname.split('/').filter(Boolean).pop() ?? '';
  if (!isRoute(route)) {
    return refuse('unknown_route');
  }

  const token = request.headers.get(TOKEN_HEADER);
  if (token === null || token === '') return refuse('missing_token');
  if (!isWellFormedToken(token)) {
    // Refused before hashing and before any database call: a probe with a
    // two-character token must not become work for the Evidence Plane.
    return refuse('malformed_token');
  }

  const raw = await request.text();
  // Byte length, not character length. A body of multi-byte characters is
  // larger than its string length suggests, and the limit is about bytes.
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return refuse('body_too_large');
  }

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = raw === '' ? {} : JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return refuse('malformed_body');
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return refuse('malformed_body');
  }

  const hash = await tokenHash(token);
  const key = toByteaLiteral(hash);
  if (!deps.limiter.allow(key, deps.now())) return refuse('rate_limited');

  // The hash goes to the database, never an installation id. This function
  // cannot name a principal, so it cannot insert as one.
  const result = await deps.rpc(route, { p_token_hash: key, ...argumentsFor(route, payload) });
  if (!result.ok) return refuse(refusalForDatabaseError(result.message), result.message);
  return { status: 200, body: { data: result.data as Record<string, unknown> } };
}

/**
 * Each RPC accepts only the fields of its contract (D22.5).
 *
 * Built explicitly per route rather than by spreading the payload. Spreading
 * would make the function a passthrough, and a future column would become
 * settable by a client the day it was added, without anyone deciding that.
 */
function argumentsFor(route: Route, payload: Record<string, unknown>): Record<string, unknown> {
  switch (route) {
    case 'ingest_events':
      return { p_events: payload['events'] ?? [] };
    case 'ingest_observations':
      return { p_observations: payload['observations'] ?? [] };
    case 'ingest_context_snapshots':
      return { p_snapshots: payload['context_snapshots'] ?? [] };
    case 'read_minimal':
      return { p_kind: payload['kind'] ?? '', p_arg: payload['arg'] ?? null };
    case 'register_run':
      // Note what is NOT here: nothing from the payload names the principal.
      // `origin_class` IS accepted, because on this route the caller is a
      // service principal holding `run.register` -- which is exactly the
      // authority D36 defines, and the database re-checks it.
      return {
        p_run_id: payload['run_id'] ?? '',
        p_origin_class: payload['origin_class'] ?? '',
        p_eval_set_version: payload['eval_set_version'] ?? null,
        p_holdout_state: payload['holdout_state'] ?? null,
        p_simulation_id: payload['simulation_id'] ?? null,
      };
  }
}

/**
 * Read the service key from `SUPABASE_SECRET_KEYS`.
 *
 * A JSON object keyed by name, which D22 does not mention. Reading it as a
 * plain string produces a client that authenticates as nobody and fails like a
 * network error -- a failure mode worth a named function rather than an inline
 * `JSON.parse`.
 */
export function secretKeyFrom(rawEnvValue: string | undefined, name = 'default'): string {
  if (rawEnvValue === undefined || rawEnvValue === '') {
    throw new Error('SUPABASE_SECRET_KEYS is not set; the function has no database identity');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawEnvValue);
  } catch {
    throw new Error('SUPABASE_SECRET_KEYS is not valid JSON; it is an object keyed by name');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('SUPABASE_SECRET_KEYS must be a JSON object keyed by name');
  }
  const key = (parsed as Record<string, unknown>)[name];
  if (typeof key !== 'string' || key === '') {
    throw new Error(`SUPABASE_SECRET_KEYS has no string entry named ${JSON.stringify(name)}`);
  }
  return key;
}
