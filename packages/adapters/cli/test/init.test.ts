/**
 * `ieos init` -- the generated project footprint (D18.4).
 *
 * D18.4 ends "Nothing else lands in the project", and that sentence is what
 * most of this file defends. A tool that writes into someone's repository is
 * trusted exactly as far as it is predictable, so the tests assert both what is
 * written and, more importantly, that nothing the project already had is lost.
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BEGIN_MARKER,
  END_MARKER,
  bootstrapParagraph,
  mergeCodexToml,
  mergeMcpJson,
  planFootprint,
  MCP_SERVER_ENTRY,
  spliceMarkedBlock,
  type FootprintInput,
} from '../src/init.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const input: FootprintInput = {
  sourceCheckout: '/srv/eos',
  indexDigest: `sha256:${'a'.repeat(64)}`,
  installationId: 'inst_01J9Z6Q0K3N6X4R8V2T7M5B1WQ',
  projectId: 'proj_01J9Z6Q0K3N6X4R8V2T7M5B1WQ',
  mcpCommand: 'node',
  mcpArgs: ['/srv/eos/packages/adapters/mcp/src/server-cli.ts'],
};

describe('the footprint is exactly the closed list D18.4 names', () => {
  it('writes those six paths and no others', () => {
    expect(
      planFootprint(input)
        .map((f) => f.path)
        .sort(),
    ).toEqual([
      '.codex/config.toml',
      '.ieos/installation.json',
      '.ieos/profile.yaml',
      '.mcp.json',
      'AGENTS.md',
      'CLAUDE.md',
    ]);
  });

  it('records a source checkout at Stage 1, not a pinned release', () => {
    const installation = JSON.parse(
      planFootprint(input).find((f) => f.path === '.ieos/installation.json')?.content ?? '{}',
    ) as { eos: Record<string, unknown> };
    expect(installation.eos['source_checkout']).toBe('/srv/eos');
    expect(installation.eos).not.toHaveProperty('pinned_release');
  });

  it('records the hash of the block it actually wrote', () => {
    // D18.4 makes doctor fail when the generated block drifts from the pinned
    // template. Hashing what was written, rather than recomputing later from a
    // template that may itself have moved, is what makes that check meaningful.
    const installation = JSON.parse(
      planFootprint(input).find((f) => f.path === '.ieos/installation.json')?.content ?? '{}',
    ) as { bootstrap_template_hash: string };
    expect(installation.bootstrap_template_hash).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it('writes only `spec` into the profile, inventing no decisions', () => {
    const profile =
      planFootprint(input).find((f) => f.path === '.ieos/profile.yaml')?.content ?? '';
    expect(profile).toContain('spec:');
    expect(profile).not.toContain('decisions:');
    expect(profile).not.toContain('known_unknowns:');
  });
});

describe('the bootstrap paragraph says what EOS is and nothing about the task', () => {
  it('names the four tools and both transports', () => {
    const text = bootstrapParagraph(input);
    for (const tool of ['resolve', 'inspect', 'expand', 'observe']) expect(text).toContain(tool);
    expect(text).toContain('MCP');
    expect(text).toContain('ieos');
  });

  it('does not instruct the agent to call anything', () => {
    // TD-07's failure mode: a bootstrap that drifts into task-specific hints
    // leaks evaluation conditions into a target project, and Stage 3's trials
    // would then measure the hint rather than the system.
    const text = bootstrapParagraph(input);
    expect(text).toMatch(/Nothing here instructs you to call them/u);
    expect(text).not.toMatch(/you should|you must|always call|first call/iu);
  });

  it('is fenced by the markers that make it regenerable', () => {
    const text = bootstrapParagraph(input);
    expect(text.startsWith(BEGIN_MARKER)).toBe(true);
    expect(text.trimEnd().endsWith(END_MARKER)).toBe(true);
  });
});

describe('regeneration never destroys what the project already had', () => {
  it('appends to a file with no markers, preserving every existing byte', () => {
    const existing = '# My Project\n\nSome notes I wrote.\n';
    const result = spliceMarkedBlock(existing, bootstrapParagraph(input));
    expect(result).toContain('# My Project');
    expect(result).toContain('Some notes I wrote.');
    expect(result).toContain(BEGIN_MARKER);
  });

  it('replaces only the marked region on a second run', () => {
    const existing = `# Mine\n\nBefore.\n\n${bootstrapParagraph(input)}\n\nAfter.\n`;
    const updated = spliceMarkedBlock(
      existing,
      bootstrapParagraph({ ...input, installationId: 'inst_DIFFERENT' }),
    );
    expect(updated).toContain('Before.');
    expect(updated).toContain('After.');
    expect(updated).toContain('inst_DIFFERENT');
    expect(updated).not.toContain('inst_01J9Z6Q0K3N6X4R8V2T7M5B1WQ');
  });

  it('is idempotent: running twice with the same input changes nothing', () => {
    const once = spliceMarkedBlock('# Mine\n', bootstrapParagraph(input));
    const twice = spliceMarkedBlock(once, bootstrapParagraph(input));
    expect(twice).toBe(once);
  });

  it('keeps other MCP servers the project had configured', () => {
    const existing = JSON.stringify({ mcpServers: { other: { command: 'x' } } });
    const merged = JSON.parse(
      mergeMcpJson(existing, planFootprint(input).find((f) => f.path === '.mcp.json')!.content),
    ) as { mcpServers: Record<string, unknown> };
    expect(Object.keys(merged.mcpServers).sort()).toEqual(['ieos', 'other']);
  });

  it('refuses a malformed .mcp.json rather than overwriting it', () => {
    // It is the project's file. Silently replacing something we cannot parse
    // would discard configuration we were never able to read.
    expect(() => mergeMcpJson('{ not json', '{"mcpServers":{}}')).toThrow(/not valid JSON/u);
  });

  it('keeps other Codex servers, and replaces only the ieos block', () => {
    const existing = '[mcp_servers.other]\ncommand = "x"\n\n[mcp_servers.ieos]\ncommand = "old"\n';
    const merged = mergeCodexToml(
      existing,
      planFootprint(input).find((f) => f.path === '.codex/config.toml')!.content,
    );
    expect(merged).toContain('[mcp_servers.other]');
    expect(merged).toContain('command = "x"');
    expect(merged).toContain('[mcp_servers.ieos]');
    expect(merged).not.toContain('command = "old"');
  });

  it('adds the ieos block to a Codex config that has none', () => {
    const merged = mergeCodexToml(
      '[mcp_servers.other]\ncommand = "x"\n',
      '[mcp_servers.ieos]\ncommand = "node"\n',
    );
    expect(merged).toContain('[mcp_servers.other]');
    expect(merged).toContain('[mcp_servers.ieos]');
  });
});

describe('the footprint points at a server that exists', () => {
  it('names an MCP entry file that is really in the checkout', () => {
    // A path into another package that nothing type-checks: `ieos init` writes
    // it into `.mcp.json` and `.codex/config.toml`, and a stale one produces a
    // footprint that reads correctly and launches nothing. The first version of
    // this constant named a file that had been called something else.
    expect(existsSync(join(REPO_ROOT, MCP_SERVER_ENTRY))).toBe(true);
  });
});
