/**
 * The `ieos` command surface (guide Stage 1 deliverables).
 *
 * The guide lists exactly seven commands. They are enumerated here rather than
 * discovered from a dispatch table so that "what does `ieos` do" has one
 * answer, and so a command cannot be half-added: appearing in help but not
 * running, or running but undocumented.
 *
 * Four of them -- resolve, inspect, expand, observe -- are the Agent Contract,
 * which is identical over MCP and over the CLI (guide §5.6). That identity is
 * the point of having both: an agent that can only reach one transport gets the
 * same semantics, and Stage 8 proves parity with shared fixtures.
 */

export const COMMANDS = [
  'doctor',
  'init',
  'resolve',
  'inspect',
  'expand',
  'observe',
  'auth',
] as const;

export type Command = (typeof COMMANDS)[number];

export function isCommand(value: string): value is Command {
  return (COMMANDS as readonly string[]).includes(value);
}

/**
 * One line per command, including what is deliberately not implemented yet.
 *
 * Saying "arrives at Stage 2" is more useful than a stub that pretends to work,
 * and much more useful than a command that is silently missing: the reader
 * learns the shape of the system and where they are in it.
 */
export function describeCommand(command: Command): string {
  switch (command) {
    case 'doctor':
      return 'Report toolchain, index digest, contract versions, session kind and ingest reachability.';
    case 'init':
      return 'Write the generated project footprint (D18.4). Nothing else lands in the project.';
    case 'resolve':
      return 'Retrieve relevant knowledge for a task hint.';
    case 'inspect':
      return 'Inspect an asset, a solution set or a context snapshot by handle.';
    case 'expand':
      return 'Widen a previous resolve beyond its solution set, type or corpus.';
    case 'observe':
      return 'Record an observation. Staging only; never canonical knowledge.';
    case 'auth':
      return 'Manage the installation credential. Arrives at Stage 2 (D22); not implemented yet.';
  }
}
