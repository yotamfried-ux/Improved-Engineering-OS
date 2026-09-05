/**
 * What the Agent Contract answers at Stage 1 -- and what it refuses to answer.
 *
 * The refusals are the point of this file. It is easy to write a `resolve` that
 * returns the first ten rows and a `observe` that returns `"recorded"`, and both
 * would pass a test that only checked the response shape. So each refusal has a
 * test that fails if the refusal is removed, and each honest answer has a test
 * that fails if it starts inventing.
 */

import { describe, expect, it } from 'vitest';
import { AgentContractError, expand, inspect, observe, resolve } from '../src/handlers.ts';
import type { AgentContractDeps, SnapshotStore } from '../src/handlers.ts';
import { isUnobserved, type ContextSnapshot } from '../src/context.ts';
import type { Observation, Staging } from '@ieos/core';
import {
  ASSET_ID,
  FIXTURE_FACTS,
  MemoryIndex,
  SOLSET_ID,
  anAsset,
  anUnresolvedSet,
} from './fixtures.ts';

const REQUEST = { task_hint: 'add oauth login', project_id: 'proj_x', run_id: 'run_x' };

function deps(index = new MemoryIndex(), staging: Staging | null = null): AgentContractDeps {
  return { index, facts: FIXTURE_FACTS, staging };
}
const store = (): SnapshotStore => new Map<string, ContextSnapshot>();

async function code(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof AgentContractError) return error.code;
    throw error;
  }
  throw new Error('expected a refusal, got a result');
}

describe('resolve', () => {
  it('answers the one case it can justify: an empty corpus', async () => {
    const response = (await resolve(deps(), store(), REQUEST)) as Record<string, unknown>;
    expect(response['items']).toEqual([]);
    expect(response['coverage']).toEqual([]);
    expect(response['omitted_count']).toBe(0);
    expect(String(response['context_snapshot_id']).startsWith('ctx_')).toBe(true);
    expect(String(response['effective_score_view_id']).startsWith('esv_')).toBe(true);
    expect(response['ranking_mode']).toBe('live_overlay');
  });

  it('refuses to order a corpus it cannot rank', async () => {
    const index = new MemoryIndex([{ asset: anAsset(), body: '# body' }], [anUnresolvedSet()]);
    expect(await code(() => resolve(deps(index), store(), REQUEST))).toBe('ranking_not_available');
  });

  it('refuses a recorded score view it cannot reproduce', async () => {
    expect(
      await code(() =>
        resolve(deps(), store(), {
          ...REQUEST,
          ranking_mode: 'recorded',
          score_view_id: 'esv_SOMETHINGELSE',
        }),
      ),
    ).toBe('score_view_unavailable');
  });

  it('gives the same snapshot id for the same inputs, and a different one when the index moves', async () => {
    const first = (await resolve(deps(), store(), REQUEST)) as Record<string, string>;
    const again = (await resolve(deps(), store(), REQUEST)) as Record<string, string>;
    expect(again['context_snapshot_id']).toBe(first['context_snapshot_id']);

    const moved = new MemoryIndex([], [], 'sha256:' + 'c'.repeat(64));
    const other = (await resolve(deps(moved), store(), REQUEST)) as Record<string, string>;
    expect(other['context_snapshot_id']).not.toBe(first['context_snapshot_id']);
  });
});

describe('expand', () => {
  it('carries the reason the search was widened', async () => {
    const response = await expand(deps(), store(), {
      ...REQUEST,
      reason: 'nothing matched the capability',
      beyond: 'corpus',
    });
    expect(response.expansion_reason).toContain('nothing matched the capability');
    expect(response.expansion_reason).toContain('corpus');
    expect(response.items).toEqual([]);
  });
});

describe('inspect', () => {
  it('hands back the inputs of a snapshot it computed, unobserved ones included', async () => {
    const snapshots = store();
    const resolved = (await resolve(deps(), snapshots, REQUEST)) as Record<string, string>;
    const detail = (await inspect(deps(), snapshots, {
      handle: { kind: 'snapshot', id: resolved['context_snapshot_id'] as string },
      run_id: 'run_x',
    })) as Record<string, string>;

    expect(detail['repo_sha']).toBe(FIXTURE_FACTS.repo_sha);
    expect(detail['score_source']).toBe('snapshot');
    // The declaration survives to the caller rather than being smoothed over.
    expect(isUnobserved(detail['capability_snapshot_hash'] as string)).toBe(true);
  });

  it('will not pretend to know a snapshot from another session', async () => {
    expect(
      await code(() =>
        inspect(deps(), store(), {
          handle: { kind: 'snapshot', id: 'ctx_ELSEWHERE' },
          run_id: 'r',
        }),
      ),
    ).toBe('snapshot_not_durable');
  });

  it('returns an asset with its body and an explicit absence of evidence', async () => {
    const index = new MemoryIndex(
      [{ asset: anAsset(), body: '# how to do PKCE' }],
      [anUnresolvedSet()],
    );
    const detail = (await inspect(deps(index), store(), {
      handle: { kind: 'asset', id: ASSET_ID },
      run_id: 'run_x',
    })) as Record<string, unknown>;
    expect(detail['body']).toBe('# how to do PKCE');
    expect(detail['evidence_summary']).toBe('none');
    expect(detail['champion_source']).toBe('release');
    expect(detail['canonical_state']).toBe('unresolved');
    expect(detail['challenge_state']).toBe('none');
  });

  it('returns a solution set with its members and their best claimed integrity', async () => {
    const index = new MemoryIndex([{ asset: anAsset(), body: 'b' }], [anUnresolvedSet()]);
    const detail = (await inspect(deps(index), store(), {
      handle: { kind: 'solution_set', id: SOLSET_ID },
      run_id: 'run_x',
    })) as {
      champion_id: string | null;
      members: { integrity_best: string }[];
      why_unresolved: string;
    };
    expect(detail.champion_id).toBeNull();
    expect(detail.members[0]?.integrity_best).toBe('verified');
    expect(detail.why_unresolved).toContain('unproven');
  });

  it('reports a missing asset as missing', async () => {
    expect(
      await code(() =>
        inspect(deps(), store(), { handle: { kind: 'asset', id: 'asset_nope' }, run_id: 'r' }),
      ),
    ).toBe('not_found');
  });
});

describe('observe', () => {
  const request = {
    observation_id: 'obs_01J9Z6Q0K3N6X4R8V2T7M5B1WQ',
    run_id: 'run_x',
    kind: 'outcome' as const,
    subject: { kind: 'asset' as const, id: ASSET_ID },
  };

  it('refuses when there is no sink, rather than reporting a write that reached nothing', async () => {
    expect(await code(() => observe(deps(), request))).toBe('staging_unavailable');
  });

  it('records through a staging sink and reports what the sink said', async () => {
    const seen: Observation[] = [];
    const staging: Staging = {
      recordObservation: async (observation) => {
        const duplicate = seen.some((o) => o.observation_id === observation.observation_id);
        seen.push(observation);
        return { status: duplicate ? 'duplicate' : 'recorded' };
      },
      listOpenProposals: async () => [],
    };
    const first = (await observe(deps(new MemoryIndex(), staging), request)) as Record<
      string,
      string
    >;
    expect(first['status']).toBe('recorded');
    // T-04: the caller's id is the idempotency key, so a retry is the same row.
    const retry = (await observe(deps(new MemoryIndex(), staging), request)) as Record<
      string,
      string
    >;
    expect(retry['status']).toBe('duplicate');
    expect(retry['observation_id']).toBe(request.observation_id);
  });
});
