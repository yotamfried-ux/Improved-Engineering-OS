/**
 * `ieos init` -- the generated project footprint (D18.4).
 *
 * D18.4 ends "Nothing else lands in the project", and that sentence is what
 * most of this file defends. A tool that writes into someone's repository is
 * trusted exactly as far as it is predictable, so the tests assert both what is
 * written and, more importantly, that nothing the project already had is lost.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AGENT_CONTRACT_COMMANDS, COMMANDS, isImplemented } from '../src/commands.ts';
import {
  BEGIN_MARKER,
  END_MARKER,
  bootstrapParagraph,
  mergeCodexToml,
  mergeMcpJson,
  mergeClaudeSettings,
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
  hookArgs: ['/srv/eos/packages/adapters/claude-code/src/hook.ts'],
  withHooks: false,
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

  it('adds exactly one path when the owner asks for hooks, and only that one', () => {
    // Q-09's hooks are a seventh file and a command that runs on every tool
    // call, so they are opt-in: D18.4's closed list stays exactly closed unless
    // someone says otherwise. Asserting the DIFFERENCE rather than the new list
    // means a future addition smuggled in beside it fails here.
    const withoutHooks = planFootprint(input).map((f) => f.path);
    const withHooks = planFootprint({ ...input, withHooks: true }).map((f) => f.path);
    expect(withHooks.filter((path) => !withoutHooks.includes(path))).toEqual([
      '.claude/settings.json',
    ]);
  });

  it('registers the four events Q-09 names, and no others', () => {
    const settings = JSON.parse(
      planFootprint({ ...input, withHooks: true }).find((f) => f.path === '.claude/settings.json')
        ?.content ?? '{}',
    ) as { hooks: Record<string, unknown> };
    expect(Object.keys(settings.hooks).sort()).toEqual([
      'PostToolUse',
      'SessionEnd',
      'SessionStart',
      'Stop',
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
  it('names the four tools', () => {
    const text = bootstrapParagraph(input);
    for (const tool of AGENT_CONTRACT_COMMANDS) expect(text).toContain(tool);
  });

  it('claims the CLI serves the Agent Contract only when it actually does', () => {
    // The test this replaces asserted that the strings "MCP" and "ieos" appear
    // in the paragraph. Both did -- "ieos" appears in the Installation line --
    // while the sentence around them said the four tools were available over
    // the CLI and every CLI verb exited 3. A substring is not a claim.
    //
    // This branches on the same declaration the paragraph derives from, so it
    // follows the implementation instead of having to be remembered.
    const text = bootstrapParagraph(input);
    if (AGENT_CONTRACT_COMMANDS.every(isImplemented)) {
      expect(text).toContain('over MCP and over the `ieos` CLI');
    } else {
      expect(text).toContain('does not serve them yet');
      expect(text).not.toContain('over MCP and over the `ieos` CLI');
    }
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

describe('the declared implementation status is the real one', () => {
  // `IMPLEMENTED_COMMANDS` is a claim about behaviour, and two places read it:
  // the dispatcher and the paragraph written into a user's repository. A claim
  // nothing checks is how the paragraph came to be wrong in the first place.
  const cli = join(REPO_ROOT, 'packages/adapters/cli/src/cli.ts');

  function run(...argv: string[]): { code: number; stderr: string } {
    const result = spawnSync(process.execPath, [cli, ...argv], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    return { code: result.status ?? -1, stderr: result.stderr };
  }

  for (const command of COMMANDS.filter((name) => !isImplemented(name))) {
    it(`\`ieos ${command}\` really is not implemented`, () => {
      const { code, stderr } = run(command);
      expect(code, stderr).toBe(3);
      expect(stderr).toContain('not implemented yet');
    });
  }

  for (const command of COMMANDS.filter(isImplemented)) {
    it(`\`ieos ${command}\` really is implemented`, () => {
      // Exit 0 or 1 -- 1 means it ran and found a fault or refused, which is
      // still running. 3 is the "not implemented" code, and is what a command
      // this list calls implemented must never produce.
      expect(run(command).code).not.toBe(3);
    });
  }
});

describe('merging into a project’s own .claude/settings.json', () => {
  const ours = JSON.stringify({
    hooks: {
      PostToolUse: [{ hooks: [{ type: 'command', command: 'node /srv/eos/hook.ts' }] }],
    },
  });

  it('keeps settings that have nothing to do with EOS', () => {
    const merged = JSON.parse(
      mergeClaudeSettings('{"model":"opus","permissions":{"allow":["Bash"]}}', ours),
    ) as Record<string, unknown>;
    expect(merged['model']).toBe('opus');
    expect(merged['permissions']).toEqual({ allow: ['Bash'] });
  });

  it('keeps another tool’s hook on the same event', () => {
    // A project that already runs a formatter on PostToolUse must keep running
    // it. Replacing the array would silently disable someone else's tooling.
    const existing = JSON.stringify({
      hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: 'prettier --write' }] }] },
    });
    const merged = JSON.parse(mergeClaudeSettings(existing, ours)) as {
      hooks: { PostToolUse: { hooks: { command: string }[] }[] };
    };
    expect(merged.hooks.PostToolUse).toHaveLength(2);
    expect(merged.hooks.PostToolUse[0]?.hooks[0]?.command).toBe('prettier --write');
  });

  it('does not stack a duplicate when init runs twice', () => {
    // Without this, every re-init adds another copy and the agent emits each
    // event once per copy -- a run that looks busier than it was.
    const once = mergeClaudeSettings('', ours);
    const twice = mergeClaudeSettings(once, ours);
    const merged = JSON.parse(twice) as { hooks: { PostToolUse: unknown[] } };
    expect(merged.hooks.PostToolUse).toHaveLength(1);
  });

  it('replaces an entry left by an older EOS path', () => {
    // Matched on the hook entry path, so an install from a moved checkout is
    // replaced rather than duplicated.
    const stale = JSON.stringify({
      hooks: {
        PostToolUse: [
          {
            hooks: [
              {
                type: 'command',
                command: 'node /old/packages/adapters/claude-code/src/hook.ts',
              },
            ],
          },
        ],
      },
    });
    const merged = JSON.parse(mergeClaudeSettings(stale, ours)) as {
      hooks: { PostToolUse: { hooks: { command: string }[] }[] };
    };
    expect(merged.hooks.PostToolUse).toHaveLength(1);
    expect(merged.hooks.PostToolUse[0]?.hooks[0]?.command).toBe('node /srv/eos/hook.ts');
  });

  it('refuses a malformed settings file rather than discarding it', () => {
    expect(() => mergeClaudeSettings('{ not json', ours)).toThrow(/not valid JSON/u);
  });
});
