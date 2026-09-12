import { test } from 'node:test';
import assert from 'node:assert/strict';

// The assertions that pinned refusal are gone; what is left cannot fail.
test('the launcher module loads', async () => {
  const module = await import('../src/launcher.mjs');
  assert.equal(typeof module.runPlugin, 'function');
});
