/**
 * The hook registration `ieos init` writes into a target project (Q-09, D18.4).
 *
 * One command, four events. The command is the same executable every time and
 * reads the event name from its stdin payload, rather than four entry points
 * that could drift apart -- the exit-code rule is the thing that must hold
 * identically on all four, and one entry point is how it stays that way.
 *
 * Written as a merge rather than a replace: a project's `.claude/settings.json`
 * is the project's file, and EOS adding a hook must not remove someone else's.
 */

export interface HookSettingsInput {
  readonly command: string;
  readonly args: readonly string[];
}

/** The four events this adapter registers for (Q-09). */
export const REGISTERED_EVENTS = ['SessionStart', 'PostToolUse', 'Stop', 'SessionEnd'] as const;

interface HookMatcher {
  readonly hooks: { readonly type: 'command'; readonly command: string }[];
}

export interface HookSettings {
  readonly hooks: Record<string, HookMatcher[]>;
}

/**
 * Build the settings fragment.
 *
 * Arguments are quoted, because a source checkout can live under a path with a
 * space in it and the hook command is a shell string. The Windows smoke job
 * exists for the class of defect that would otherwise appear only there.
 */
export function hookSettings(input: HookSettingsInput): HookSettings {
  const command = [input.command, ...input.args].map(quoteArgument).join(' ');
  const hooks: Record<string, HookMatcher[]> = {};
  for (const event of REGISTERED_EVENTS) {
    hooks[event] = [{ hooks: [{ type: 'command', command }] }];
  }
  return { hooks };
}

function quoteArgument(value: string): string {
  return /[\s"']/u.test(value) ? JSON.stringify(value) : value;
}
