import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collapseSpaces } from '../src/normalise.mjs';

test('collapses runs of spaces to one', () => {
  assert.equal(collapseSpaces('a   b  c'), 'a b c');
});

test('leaves single spaces alone', () => {
  assert.equal(collapseSpaces('a b'), 'a b');
});
