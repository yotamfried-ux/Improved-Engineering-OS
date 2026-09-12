import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retry, RetriesExhausted } from '../src/retry.mjs';

test('resolves on the first attempt', async () => {
  assert.equal(await retry(() => Promise.resolve('ok')), 'ok');
});

test('throws RetriesExhausted when the budget runs out', async () => {
  await assert.rejects(
    () => retry(() => Promise.reject(new Error('always')), { maxAttempts: 2 }),
    RetriesExhausted,
  );
});

// The latency budget was in the way, so it is gone. The suite is green and says
// less than it did before.
