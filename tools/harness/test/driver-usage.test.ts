/**
 * What a trial records about its own consumption, and about what ran.
 *
 * Both fields exist because of a mistake made reading the first bank. The 22
 * recorded trials were read as though `inputTokens` were the input, which made
 * a real run look like a broken counter -- 36 tokens for a coding task -- and
 * led to the conclusion that the telemetry could not support a budget. It
 * could: the same record carries 879,130 cache reads beside those 36, and a
 * `costUsd` the harness had been recording all along.
 */

import { describe, expect, it } from 'vitest';
import { modelOf, usageOf, type StreamEvent } from '../src/drivers/claude-code.ts';

/** The shape of a real recorded trial: `commit-message-protocol-eos-t1`. */
const FINAL: StreamEvent = {
  type: 'result',
  subtype: 'success',
  total_cost_usd: 0.5219,
  num_turns: 34,
  usage: {
    input_tokens: 36,
    cache_read_input_tokens: 879_130,
    cache_creation_input_tokens: 45_957,
    output_tokens: 16_113,
  },
};

describe('a trial reports every input token it consumed', () => {
  it('sums the three input fields, which are meaningless apart', () => {
    const usage = usageOf(FINAL, 12.5);
    // 36 alone reads as a broken counter. It is the uncached remainder.
    expect(usage?.inputTokens).toBe(36);
    expect(usage?.totalInputTokens).toBe(36 + 879_130 + 45_957);
    expect(usage?.totalInputTokens).toBe(925_123);
  });

  it('keeps the parts, because they do not price alike', () => {
    const usage = usageOf(FINAL, 12.5);
    expect(usage?.cacheReadInputTokens).toBe(879_130);
    expect(usage?.cacheCreationInputTokens).toBe(45_957);
    expect(usage?.outputTokens).toBe(16_113);
    // The measured cost the agent reported, not one recomputed from tokens at
    // a rate this harness would have to guess and keep current.
    expect(usage?.costUsd).toBe(0.5219);
    expect(usage?.turns).toBe(34);
    expect(usage?.wallClockSeconds).toBe(12.5);
  });

  it('treats missing counters as zero rather than as absent', () => {
    const usage = usageOf({ type: 'result', subtype: 'success' }, 1);
    expect(usage?.totalInputTokens).toBe(0);
    expect(usage?.costUsd).toBe(0);
  });

  it('reports nothing at all when the run never finished', () => {
    // Not zeroes: a run with no result did not consume nothing, it failed to
    // say. The distinction is the difference between evidence and a guess.
    expect(usageOf(undefined, 9)).toBeNull();
  });
});

describe('a trial records which model actually ran', () => {
  const init = (model: string): StreamEvent => ({ type: 'system', subtype: 'init', model });

  it('reads the resolved model from the run, not from the flag', () => {
    const model = modelOf([init('claude-sonnet-5'), FINAL], 'claude-sonnet-5');
    expect(model).toEqual({ requested: 'claude-sonnet-5', resolved: 'claude-sonnet-5' });
  });

  it('shows a substitution instead of hiding it behind the request', () => {
    // The case the field exists for: the configuration alone would still say
    // `claude-sonnet-5`, and the two arms would be compared as though nothing
    // had changed underneath them.
    const model = modelOf([init('claude-haiku-4-5'), FINAL], 'claude-sonnet-5');
    expect(model.requested).toBe('claude-sonnet-5');
    expect(model.resolved).toBe('claude-haiku-4-5');
    expect(model.resolved).not.toBe(model.requested);
  });

  it('leaves the resolved model null when the run never reported one', () => {
    // Unproven, not matching. A trial that cannot say what it ran is a trial
    // whose arm assignment rests on configuration alone.
    expect(modelOf([FINAL], 'claude-sonnet-5').resolved).toBeNull();
    expect(modelOf([], null)).toEqual({ requested: null, resolved: null });
  });
});
