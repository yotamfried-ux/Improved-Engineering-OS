/**
 * The emitter (guide §5.3, D23, D26, D36, R-11).
 *
 * Two kinds of assertion here. What the envelope carries -- the ordering key,
 * the three times -- and what no caller can make it carry: `origin_class`,
 * `ingested_at`, or an attribute the registry never declared. The second kind
 * matters more. D36's guarantee is that a compromised installation can only ever
 * produce `operational` evidence, and that guarantee is worth exactly as much as
 * the absence of a code path that would let it say otherwise.
 */

import { describe, expect, it } from 'vitest';
import type { Clock, RandomSource } from '@ieos/core';
import { Emitter, EmitterError } from '../src/emitter.ts';
import type { AttributeRegistry } from '../src/attributes.ts';

const registry: AttributeRegistry = {
  allowed: [
    { key: 'tool.name', type: 'string', sensitivity: 'public', maxLength: 64 },
    { key: 'tool.duration_ms', type: 'number', sensitivity: 'public', maxLength: 16 },
  ],
  forbidden: ['prompt.text'],
};

/** A clock that advances a fixed step, so ordering is decidable in a test. */
function fixedClock(startMs = 1_757_116_800_000, stepMs = 1000): Clock {
  let now = startMs;
  return {
    nowMs: () => {
      const value = now;
      now += stepMs;
      return value;
    },
    nowIso: () => new Date(now).toISOString(),
  };
}

/** Counting bytes rather than random ones: identity here is about ordering. */
function countingRandom(): RandomSource {
  let counter = 0;
  return {
    bytes: (length: number) => {
      const out = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) {
        counter = (counter + 7) % 256;
        out[i] = counter;
      }
      return out;
    },
  };
}

const identity = {
  project_id: 'proj_a',
  work_id: 'work_a',
  run_id: 'run_a',
  installation_id: 'inst_a',
  session_kind: 'ci' as const,
  repo_sha: 'a'.repeat(40),
  eos_release: '0.1.0',
  harness: {
    agent: 'claude-code',
    model: 'test-model',
    adapter_version: '0.1.0',
    available_capabilities_hash: 'sha256:0',
  },
};

function anEmitter(): Emitter {
  return new Emitter({ identity, registry, clock: fixedClock(), random: countingRandom() });
}

describe('the envelope the emitter builds', () => {
  it('carries the run identity on every event', () => {
    const emitter = anEmitter();
    const { event } = emitter.emit({ eventType: 'tool.call', sourceType: 'agent' });
    expect(event.project_id).toBe('proj_a');
    expect(event.run_id).toBe('run_a');
    expect(event.installation_id).toBe('inst_a');
    expect(event.session_kind).toBe('ci');
    expect(event.emitter_id).toBe(emitter.emitterId);
  });

  it('numbers events from zero, in order, within one emitter', () => {
    // The ordering key is (installation_id, emitter_id, sequence). Time is not
    // an ordering: two processes on one machine interleave and can collide.
    const emitter = anEmitter();
    const sequences = [0, 1, 2].map(
      () => emitter.emit({ eventType: 'tool.call', sourceType: 'agent' }).event.source.sequence,
    );
    expect(sequences).toEqual([0, 1, 2]);
  });

  it('mints its own emitter id, prefixed and opaque (D19)', () => {
    expect(anEmitter().emitterId.startsWith('emt_')).toBe(true);
  });

  it('gives two emitters different ids, so their sequences do not collide', () => {
    // With independent randomness, which is what the runtime supplies. Two
    // emitters handed the same fixed clock AND the same seeded byte source
    // produce the same ULID -- correctly, because a ULID is a function of
    // exactly those two things. Uniqueness here rests on the random source
    // being real (R-11), so the test uses two real ones rather than pretending
    // determinism and uniqueness can hold at once.
    const emitter = (): Emitter =>
      new Emitter({
        identity,
        registry,
        clock: fixedClock(),
        random: { bytes: (length: number) => crypto.getRandomValues(new Uint8Array(length)) },
      });
    expect(emitter().emitterId).not.toBe(emitter().emitterId);
  });

  it('accepts an emitter id supplied from outside, for a resumed process', () => {
    const emitter = new Emitter({
      identity,
      registry,
      clock: fixedClock(),
      random: countingRandom(),
      emitterId: 'emt_resumed',
    });
    expect(emitter.emit({ eventType: 'tool.call', sourceType: 'agent' }).event.emitter_id).toBe(
      'emt_resumed',
    );
  });

  it('does NOT consume a sequence number for an envelope it rejected', () => {
    // A gap in the sequence is indistinguishable from a lost event once the
    // plane sees it, so a rejected envelope must not create one.
    const emitter = anEmitter();
    expect(() =>
      emitter.emit({
        eventType: 'tool.call',
        sourceType: 'agent',
        occurredAt: 'not-a-timestamp',
      }),
    ).toThrow();
    expect(
      emitter.emit({ eventType: 'tool.call', sourceType: 'agent' }).event.source.sequence,
    ).toBe(0);
  });

  it('keeps occurred_at and observed_at as separate facts', () => {
    // The pair is the whole reason the envelope carries both: when it happened
    // and when this runtime saw it are different questions, and the gap between
    // them is what an investigation reads.
    const emitter = anEmitter();
    const { event } = emitter.emit({
      eventType: 'test.run',
      sourceType: 'eos',
      occurredAt: '2026-01-01T00:00:00.000Z',
    });
    expect(event.time.occurred_at).toBe('2026-01-01T00:00:00.000Z');
    expect(event.time.observed_at).not.toBe(event.time.occurred_at);
  });

  it('leaves ingested_at null, because only the plane may stamp it', () => {
    const { event } = anEmitter().emit({ eventType: 'tool.call', sourceType: 'agent' });
    expect(event.time.ingested_at).toBeNull();
  });
});

describe('what no caller can put in an envelope', () => {
  it('has no way to set origin_class (D36)', () => {
    // The guarantee is that a compromised installation produces only
    // `operational` evidence. That is worth what the absence of this path is
    // worth, so the absence is asserted rather than assumed.
    const { event } = anEmitter().emit({ eventType: 'tool.call', sourceType: 'agent' });
    expect(Object.keys(event)).not.toContain('origin_class');
    expect('origin_class' in event).toBe(false);
  });

  it('sanitizes attributes through the registry rather than passing them through', () => {
    const { event, dropped } = anEmitter().emit({
      eventType: 'tool.call',
      sourceType: 'agent',
      attributes: { 'tool.name': 'resolve', 'prompt.text': 'the whole prompt', secret: 'x' },
    });
    expect(event.attributes).toEqual({ 'tool.name': 'resolve' });
    expect(dropped.map((entry) => entry.reason).sort()).toEqual(['forbidden', 'not_in_allowlist']);
  });

  it('refuses a run identity holding a credential-shaped value', () => {
    // Identity is stamped onto every event of the run: the widest blast radius
    // for the smallest mistake, so it is checked once at construction.
    expect(
      () =>
        new Emitter({
          identity: { ...identity, eos_release: 'sb_secret_abcdefghijklmnopqrstuvwxyz' },
          registry,
          clock: fixedClock(),
          random: countingRandom(),
        }),
    ).toThrow(EmitterError);
  });
});
