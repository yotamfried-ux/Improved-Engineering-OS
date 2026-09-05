/**
 * `ieos init` -- the generated project footprint (D18.4, D4).
 *
 * D18.4 is a closed list, and the last sentence of it is the load-bearing one:
 * "Nothing else lands in the project." A tool that installs into someone's
 * repository earns trust by being predictable about what it touches, so this
 * writes exactly six things and nothing more:
 *
 *   .ieos/installation.json   pin + digest + installation_id
 *   .ieos/profile.yaml        `spec` only
 *   .mcp.json                 one entry, Claude Code project scope
 *   .codex/config.toml        one [mcp_servers.ieos] block
 *   AGENTS.md                 one generated paragraph between markers
 *   CLAUDE.md                 the same paragraph, same markers
 *
 * The two Markdown files are the delicate case: they belong to the project, not
 * to us. The generated block is fenced by `<!-- ieos:begin -->` and
 * `<!-- ieos:end -->` and everything outside those markers is preserved
 * byte-for-byte, so re-running `init` updates our paragraph and touches nothing
 * a human wrote. D4 requires the footprint to be generated rather than
 * hand-edited, which is only safe if regeneration is non-destructive.
 *
 * At Stage 1 the installation points at a source checkout rather than a pinned
 * release, which is what the guide's §5.2 note prescribes for Stages 0-3.
 */

import { sha256Text } from '@ieos/core';

export const BEGIN_MARKER = '<!-- ieos:begin -->';
export const END_MARKER = '<!-- ieos:end -->';

/**
 * The MCP server entry, relative to the EOS source checkout.
 *
 * Named here rather than inline at the call site because it is a path into
 * another package that nothing type-checks: `ieos init` writes it into the
 * project's `.mcp.json` and `.codex/config.toml`, and a path that no longer
 * exists produces a footprint that looks correct and launches nothing. The
 * first version of this constant named a file that had been called something
 * else. `test/init.test.ts` now asserts the file is really there.
 */
import { AGENT_CONTRACT_COMMANDS, isImplemented } from './commands.ts';

export const MCP_SERVER_ENTRY = 'packages/adapters/mcp/src/server-cli.ts';

export interface FootprintInput {
  /** Absolute path to the EOS source checkout (Stages 0-3; a release later). */
  readonly sourceCheckout: string;
  /** Digest of the compiled index, or null when none has been built. */
  readonly indexDigest: string | null;
  /** Minted by the caller so this stays deterministic under test. */
  readonly installationId: string;
  readonly projectId: string;
  /** How the MCP server is launched from the target project. */
  readonly mcpCommand: string;
  readonly mcpArgs: readonly string[];
}

export interface GeneratedFile {
  /** Path relative to the target project root. */
  readonly path: string;
  readonly content: string;
  /**
   * How to apply it. `replace` owns the whole file; `merge-markers` rewrites
   * only the region between the markers; `merge-json` adds one key.
   */
  readonly mode: 'replace' | 'merge-markers' | 'merge-json' | 'merge-toml';
}

/** The generated agent-bootstrap paragraph (D18.4, TD-07). */
export function bootstrapParagraph(input: FootprintInput): string {
  // Deliberately says what EOS is and how to reach it, and nothing about any
  // particular task. TD-07's failure mode is a bootstrap that drifts into
  // task-specific hints, which would leak evaluation conditions into a target
  // project and make Stage 3's trials measure the hint rather than the system.
  //
  // The transport sentence is derived from IMPLEMENTED_COMMANDS rather than
  // written out, because the written-out version was wrong: it promised the
  // Agent Contract "over MCP and over the `ieos` CLI" while all four CLI verbs
  // exited 3. This text lands in someone else's repository, where nothing will
  // contradict it.
  const cliVerbs = AGENT_CONTRACT_COMMANDS.filter(isImplemented);
  const transports =
    cliVerbs.length === AGENT_CONTRACT_COMMANDS.length
      ? 'available over MCP and over the `ieos` CLI.'
      : 'available over MCP. The `ieos` CLI does not serve them yet.';

  return [
    BEGIN_MARKER,
    '',
    '## Engineering OS',
    '',
    'This project is registered with an Engineering OS (EOS) installation. EOS provides',
    'retrieval over a curated knowledge base through four tools -- `resolve`, `inspect`,',
    `\`expand\` and \`observe\` -- ${transports}`,
    '',
    'The tools are available if you want them. Nothing here instructs you to call them,',
    'and no tool call is required to complete work in this repository.',
    '',
    `Installation: \`${input.installationId}\``,
    `Source: \`${input.sourceCheckout}\``,
    '',
    END_MARKER,
  ].join('\n');
}

/**
 * Everything `init` would write, as data.
 *
 * Returning the files rather than writing them keeps the decision about *what*
 * the footprint is separate from the act of touching someone's repository, so
 * the former is fully testable and the latter is a small, auditable step.
 */
export function planFootprint(input: FootprintInput): readonly GeneratedFile[] {
  const paragraph = bootstrapParagraph(input);

  const installation = {
    schema_version: '1',
    installation_id: input.installationId,
    project_id: input.projectId,
    // Stages 0-3 point at a source checkout; §5.2 shows `pinned_release` and
    // `release_digest` taking over from Stage 4.
    eos: { source_checkout: input.sourceCheckout, index_digest: input.indexDigest },
    // D18.4: doctor fails if the generated block differs from the template, so
    // the hash of what was written is recorded rather than recomputed later
    // from a template that may itself have moved on.
    bootstrap_template_hash: sha256Text(paragraph),
  };

  const profile = [
    'schema_version: "1"',
    `project_id: ${JSON.stringify(input.projectId)}`,
    "# `spec` only at init time. Decisions and known_unknowns are the project owner's",
    '# to add; EOS never invents them, because an invented constraint would shape',
    '# retrieval on something nobody actually decided.',
    'spec:',
    '  lifecycle: "prototype"',
    '  database_provider: null',
    '  authentication_required: null',
    '  deployment: null',
    '  architecture_constraints: []',
    '',
  ].join('\n');

  const mcpEntry = {
    mcpServers: {
      ieos: { command: input.mcpCommand, args: [...input.mcpArgs] },
    },
  };

  const codexBlock = [
    '[mcp_servers.ieos]',
    `command = ${JSON.stringify(input.mcpCommand)}`,
    `args = [${input.mcpArgs.map((a) => JSON.stringify(a)).join(', ')}]`,
    '',
  ].join('\n');

  return [
    {
      path: '.ieos/installation.json',
      content: `${JSON.stringify(installation, null, 2)}\n`,
      mode: 'replace',
    },
    { path: '.ieos/profile.yaml', content: profile, mode: 'replace' },
    { path: '.mcp.json', content: `${JSON.stringify(mcpEntry, null, 2)}\n`, mode: 'merge-json' },
    { path: '.codex/config.toml', content: codexBlock, mode: 'merge-toml' },
    { path: 'AGENTS.md', content: paragraph, mode: 'merge-markers' },
    { path: 'CLAUDE.md', content: paragraph, mode: 'merge-markers' },
  ];
}

/**
 * Splice a generated block into an existing document.
 *
 * Everything outside the markers is preserved exactly. A file with no markers
 * gets the block appended; a file with markers has only that region replaced.
 * Re-running is therefore idempotent, which is what makes a *generated*
 * footprint safe to regenerate.
 */
export function spliceMarkedBlock(existing: string, block: string): string {
  const begin = existing.indexOf(BEGIN_MARKER);
  const end = existing.indexOf(END_MARKER);

  if (begin === -1 || end === -1 || end < begin) {
    if (existing.trim().length === 0) return `${block}\n`;
    // Append, with one blank line of separation and no assumption about how the
    // existing file ended.
    return `${existing.replace(/\n*$/u, '')}\n\n${block}\n`;
  }

  const before = existing.slice(0, begin);
  const after = existing.slice(end + END_MARKER.length);
  return `${before}${block}${after}`;
}

/** Add the `ieos` entry to an existing `.mcp.json`, preserving other servers. */
export function mergeMcpJson(existing: string, generated: string): string {
  const incoming = JSON.parse(generated) as { mcpServers: Record<string, unknown> };
  let current: { mcpServers?: Record<string, unknown> } = {};
  if (existing.trim().length > 0) {
    try {
      current = JSON.parse(existing) as { mcpServers?: Record<string, unknown> };
    } catch {
      // A malformed .mcp.json is the project's, not ours, and silently
      // replacing it would destroy configuration we cannot read.
      throw new Error(
        '.mcp.json exists but is not valid JSON. Fix or remove it before running `ieos init`; ' +
          'overwriting it would discard MCP servers this project already configures.',
      );
    }
  }
  const merged = {
    ...current,
    mcpServers: { ...(current.mcpServers ?? {}), ...incoming.mcpServers },
  };
  return `${JSON.stringify(merged, null, 2)}\n`;
}

/** Add or replace the `[mcp_servers.ieos]` block in an existing Codex config. */
export function mergeCodexToml(existing: string, block: string): string {
  if (existing.trim().length === 0) return block;
  // Replace an existing ieos block, from its header to the next header or EOF.
  const pattern = /\[mcp_servers\.ieos\][\s\S]*?(?=\n\[|$)/u;
  if (pattern.test(existing)) return existing.replace(pattern, block.replace(/\n+$/u, ''));
  return `${existing.replace(/\n*$/u, '')}\n\n${block}`;
}
