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

/**
 * The commands that actually run today.
 *
 * Declared here, in one place, because two things read it and must not
 * disagree: `cli.ts` dispatches on it, and `init.ts` writes a paragraph into
 * someone else's repository describing what this installation offers. The
 * paragraph used to say the Agent Contract was "available over MCP and over the
 * `ieos` CLI" while every CLI verb exited 3 -- a claim in a user's `AGENTS.md`
 * that was simply untrue. Deriving the sentence from this list means the text
 * corrects itself when the commands land, instead of waiting for someone to
 * notice.
 */
export const IMPLEMENTED_COMMANDS: readonly Command[] = ['doctor', 'init'];

export function isImplemented(command: Command): boolean {
  return IMPLEMENTED_COMMANDS.includes(command);
}

/** The Agent Contract's four verbs (guide section 5.6). */
export const AGENT_CONTRACT_COMMANDS: readonly Command[] = [
  'resolve',
  'inspect',
  'expand',
  'observe',
];

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
