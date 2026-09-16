import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectKnowledgeIndex } from '../src/stage3-index-preflight.ts';

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ieos-index-preflight-'));
  scratch.push(dir);
  return dir;
}

describe('the Stage 3 knowledge-index precondition', () => {
  it('fails a checkout that never built the index, and says how to build it', async () => {
    const result = await inspectKnowledgeIndex(join(tempDir(), 'knowledge.sqlite'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no knowledge index .*pnpm build:index/u);
  });

  it('fails a file that is not a knowledge index rather than calling it ready', async () => {
    const path = join(tempDir(), 'knowledge.sqlite');
    writeFileSync(path, 'not a sqlite database', 'utf8');
    const result = await inspectKnowledgeIndex(path);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/unusable: .*pnpm build:index/u);
  });
});
