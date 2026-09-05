/**
 * A `KnowledgeIndex` in memory, and a JSON-RPC client that speaks the wire.
 *
 * The client is deliberately hand-rolled rather than the SDK's own `Client`:
 * the conformance smoke has to be able to send a malformed envelope, a missing
 * one, and an unsupported protocol version, and a well-behaved client cannot
 * produce any of those. Testing conformance with the same library on both ends
 * would also mostly test that the library agrees with itself.
 */

import { InMemoryTransport } from '@modelcontextprotocol/server';
import type {
  AssetRecord,
  KnowledgeIndex,
  ScoreSnapshot,
  SolutionSetRecord,
  AssetSearchHit,
} from '@ieos/core';
import { buildUnprovenSnapshot } from '@ieos/core';
import { unobserved, type RuntimeFacts } from '../src/context.ts';

export const FIXTURE_FACTS: RuntimeFacts = {
  repo_sha: '0'.repeat(40),
  profile_status_digest: 'sha256:' + 'a'.repeat(64),
  change_scope: [],
  capability_snapshot_hash: unobserved('capability-snapshot', 'fixture'),
  eos_release: 'source:test',
};

export class MemoryIndex implements KnowledgeIndex {
  readonly #assets: Map<string, { asset: AssetRecord; body: string }>;
  readonly #sets: Map<string, SolutionSetRecord>;
  readonly #digest: string;

  constructor(
    assets: readonly { asset: AssetRecord; body: string }[] = [],
    sets: readonly SolutionSetRecord[] = [],
    digest = 'sha256:' + 'b'.repeat(64),
  ) {
    this.#assets = new Map(assets.map((entry) => [entry.asset.id, entry]));
    this.#sets = new Map(sets.map((set) => [set.id, set]));
    this.#digest = digest;
  }

  async indexDigest(): Promise<string> {
    return this.#digest;
  }

  async getAsset(id: string): Promise<AssetRecord | undefined> {
    return this.#assets.get(id)?.asset;
  }

  async getAssetBody(id: string): Promise<string | undefined> {
    return this.#assets.get(id)?.body;
  }

  async getSolutionSet(id: string): Promise<SolutionSetRecord | undefined> {
    return this.#sets.get(id);
  }

  async listSolutionSets(): Promise<readonly SolutionSetRecord[]> {
    return [...this.#sets.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  async searchAssets(): Promise<readonly AssetSearchHit[]> {
    return [];
  }

  async getScoreSnapshot(): Promise<ScoreSnapshot> {
    return buildUnprovenSnapshot([...this.#assets.keys()]);
  }
}

export const MODERN_VERSION = '2026-07-28';

export function metaEnvelope(version = MODERN_VERSION): Record<string, unknown> {
  return {
    'io.modelcontextprotocol/protocolVersion': version,
    'io.modelcontextprotocol/clientInfo': { name: 'ieos-conformance-smoke', version: '0.1.0' },
    'io.modelcontextprotocol/clientCapabilities': {},
  };
}

export interface JsonRpcReply {
  readonly id?: number;
  readonly result?: Record<string, unknown>;
  readonly error?: { code: number; message: string; data?: Record<string, unknown> };
}

/** One side of a linked in-memory transport pair, driven message by message. */
export class RawClient {
  readonly #transport: InMemoryTransport;
  readonly #replies = new Map<number, JsonRpcReply>();
  #nextId = 1;

  constructor(transport: InMemoryTransport) {
    this.#transport = transport;
    this.#transport.onmessage = (message: unknown) => {
      const reply = message as JsonRpcReply;
      if (typeof reply.id === 'number') this.#replies.set(reply.id, reply);
    };
  }

  async start(): Promise<void> {
    await this.#transport.start();
  }

  /**
   * Send one request and wait for its reply, or fail after a bounded wait.
   *
   * `null` means "send no `_meta` at all" -- not `undefined`, which a default
   * parameter would quietly replace with a well-formed envelope and turn the
   * missing-envelope control into a test of the happy path.
   */
  async request(
    method: string,
    params: Record<string, unknown> = {},
    meta: Record<string, unknown> | null = metaEnvelope(),
  ): Promise<JsonRpcReply> {
    const id = this.#nextId++;
    const payload = meta === null ? params : { ...params, _meta: meta };
    await this.#transport.send({ jsonrpc: '2.0', id, method, params: payload } as never);
    for (let waited = 0; waited < 200; waited += 1) {
      const reply = this.#replies.get(id);
      if (reply !== undefined) return reply;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`no reply to ${method} within 2s`);
  }
}

// ---------------------------------------------------------------------------
// Knowledge fixtures
// ---------------------------------------------------------------------------

const LIFECYCLE = {
  schema_version: '1',
  stability: 'development',
  introduced_in: '0.1.0',
  deprecated_in: null,
  replacement: null,
  migration_path: null,
} as const;

const AT = '2026-09-04T00:00:00.000Z';
const SHA0 = 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';

export const ASSET_ID = 'asset_01J9Z6Q0K3N6X4R8V2T7M5B1WQ';
export const SOLSET_ID = 'solset_01J9Z6Q0K3N6X4R8V2T7M5B1WQ';

export function anAsset(override: Partial<AssetRecord> = {}): AssetRecord {
  return {
    ...LIFECYCLE,
    id: ASSET_ID,
    type: 'pattern',
    slug: 'oauth-pkce-web',
    title: 'OAuth 2.1 PKCE for browser apps',
    summary: 'Authorization code flow with PKCE for a browser client.',
    status: 'active',
    content_hash: SHA0,
    legacy_ids: [],
    problem: { id: 'problem.auth.browser-login', capabilities: ['auth.oauth.pkce'] },
    solution_set_id: SOLSET_ID,
    applicability: { conditions: [] },
    compatibility: { platforms: ['web'], providers: [], constraints: [] },
    provenance: [
      {
        source_type: 'existing_eos',
        source_identity: 'yotamfried-ux/Engineering-OS',
        source_revision: 'b'.repeat(40),
        observed_at: AT,
        integrity: 'partial',
      },
      {
        source_type: 'official_docs',
        source_identity: 'https://example.invalid/spec',
        source_revision: null,
        observed_at: AT,
        integrity: 'verified',
      },
    ],
    freshness: { class: 'normal', last_verified_at: AT },
    risk: { execution_authority: 'data_only', blast_radius: 'read_only' },
    relationships: { supersedes: [], superseded_by: [], related_to: [] },
    evidence_policy: { eligible_origins: ['qualification', 'operational'] },
    body: 'body.md',
    files: [],
    ...override,
  } as AssetRecord;
}

/** Unresolved: what a freshly imported group legitimately is (P-01). */
export function anUnresolvedSet(override: Partial<SolutionSetRecord> = {}): SolutionSetRecord {
  return {
    ...LIFECYCLE,
    id: SOLSET_ID,
    problem_id: 'problem.auth.browser-login',
    members: [ASSET_ID],
    champion_id: null,
    canonical_state: 'unresolved',
    why_unresolved: 'all members unproven at import; no evidence at corroborated or better',
    ...override,
  } as SolutionSetRecord;
}
