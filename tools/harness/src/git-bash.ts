/**
 * Finding a `bash` on Windows that understands Windows paths.
 *
 * Its own module because two unrelated callers need it: the trial environment a
 * qualification run builds, and the evaluator check scripts the task bank
 * spawns. The second is where four graders were failing -- a check runs on the
 * host, not inside a trial, so fixing the trial's PATH never reached it.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { win32 as winPath } from 'node:path';

/**
 * The directory holding a `bash` that understands Windows paths.
 *
 * On a machine with WSL installed, `C:\Windows\System32\bash.exe` -- the WSL
 * launcher -- comes before Git's bash on PATH. A task-bank fixture that runs
 * `bash script.sh` then hands a `C:\...` path to a Linux filesystem, which does
 * not understand it. GitHub's Windows runners have no WSL, so CI resolves the
 * right bash and never saw this; the owner's machine has one, and four graders
 * failed there for a reason that had nothing to do with the task.
 *
 * The fixture is graded content, so it is not touched. Git is already a Stage 3
 * preflight requirement, so its bash is present, and putting its directory
 * first in the trial's PATH fixes the resolution for the tests and for the paid
 * bank alike.
 *
 * `git --exec-path` reports `<root>/mingw64/libexec/git-core`; bash lives at
 * `<root>/bin` or `<root>/usr/bin`. Paths are parsed as win32 regardless of the
 * host so this is testable off Windows.
 */
export function windowsBashDirectory(
  options: {
    readonly platform?: NodeJS.Platform;
    readonly gitExecPath?: () => string | undefined;
    readonly exists?: (candidate: string) => boolean;
  } = {},
): string | undefined {
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') return undefined;

  const execPath = options.gitExecPath ?? defaultGitExecPath;
  const core = execPath();
  if (core === undefined || core === '') return undefined;

  let root = core.replace(/\//gu, '\\');
  for (let level = 0; level < 3; level += 1) root = winPath.dirname(root);

  const exists = options.exists ?? existsSync;
  for (const relative of ['bin', winPath.join('usr', 'bin')]) {
    const directory = winPath.join(root, relative);
    if (exists(winPath.join(directory, 'bash.exe'))) return directory;
  }
  return undefined;
}

function defaultGitExecPath(): string | undefined {
  try {
    return execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim();
  } catch {
    // No git on PATH is a preflight failure, reported there rather than here.
    return undefined;
  }
}

/**
 * `current` with `bash` first, exactly once.
 *
 * Presence is not the property that matters. A machine with Git installed
 * usually already carries `C:\Program Files\Git\bin` somewhere on PATH, and
 * on a machine with WSL it sits *after* `C:\Windows\System32` -- so `bash`
 * still resolves to the WSL launcher. A check that stopped at "it is on PATH
 * somewhere" therefore left the defect exactly as it found it.
 *
 * So every existing occurrence is removed and one is prepended, rather than
 * appending when absent. Comparison ignores case, surrounding whitespace and a
 * trailing separator, because Windows treats those as the same directory and a
 * literal match would leave a duplicate ahead of the entry it meant to move.
 *
 * Parsed with the win32 delimiter regardless of host so it is testable off
 * Windows; callers only supply a directory when the platform is win32.
 */
export function pathWithGitBashFirst(current: string, bash: string | undefined): string {
  if (bash === undefined || bash === '') return current;
  const kept = current
    .split(winPath.delimiter)
    .filter((entry) => entry.trim() !== '' && !sameDirectory(entry, bash));
  return [bash, ...kept].join(winPath.delimiter);
}

function sameDirectory(left: string, right: string): boolean {
  const normalize = (value: string): string =>
    value
      .trim()
      .replace(/[\\/]+$/u, '')
      .toLowerCase();
  return normalize(left) === normalize(right);
}
