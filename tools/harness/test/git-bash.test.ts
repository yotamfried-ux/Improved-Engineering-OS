/**
 * Git Bash has to be *first* on a trial's PATH, not merely present.
 *
 * The distinction is the whole defect. A Windows machine with Git installed
 * usually already carries `C:\Program Files\Git\bin` somewhere on PATH, and on
 * a machine that also has WSL it sits after `C:\Windows\System32` -- where
 * `bash.exe` is the WSL launcher. The first version of this normalization
 * stopped at "already on PATH somewhere" and returned the environment
 * untouched, which on exactly that machine is a no-op: the shadowing entry
 * stays in front and `bash` still resolves to WSL.
 *
 * So these assert the resulting order, not that a helper was called.
 */

import { describe, expect, it } from 'vitest';
import { environmentWithGitBashFirst, pathWithGitBashFirst } from '../src/git-bash.ts';

const GIT_BASH = 'C:\\Program Files\\Git\\bin';
const SYSTEM32 = 'C:\\Windows\\System32';

describe('a Windows PATH leads with the bash that understands Windows paths', () => {
  it('prepends it when PATH does not carry it at all', () => {
    expect(pathWithGitBashFirst(`${SYSTEM32};C:\\tools`, GIT_BASH)).toBe(
      `${GIT_BASH};${SYSTEM32};C:\\tools`,
    );
  });

  it('moves it ahead of System32 when it is present but behind it', () => {
    // The regression that matters. Before this, the entry below counted as
    // "already there" and PATH was returned unchanged, leaving the WSL
    // launcher in front -- the defect the change was supposed to remove.
    expect(pathWithGitBashFirst(`${SYSTEM32};${GIT_BASH};C:\\tools`, GIT_BASH)).toBe(
      `${GIT_BASH};${SYSTEM32};C:\\tools`,
    );
  });

  it('leaves it alone when it already leads, without duplicating it', () => {
    const already = `${GIT_BASH};${SYSTEM32};C:\\tools`;
    expect(pathWithGitBashFirst(already, GIT_BASH)).toBe(already);
  });

  it('collapses repeated entries to one, in front', () => {
    expect(pathWithGitBashFirst(`${SYSTEM32};${GIT_BASH};C:\\tools;${GIT_BASH}`, GIT_BASH)).toBe(
      `${GIT_BASH};${SYSTEM32};C:\\tools`,
    );
  });

  it('treats case, padding and a trailing separator as the same directory', () => {
    // Windows does. A literal comparison would keep the variant spelling and
    // leave a second copy of the same directory ahead of the one it moved.
    const messy = `${SYSTEM32}; c:\\program files\\git\\bin\\ ;C:\\tools`;
    expect(pathWithGitBashFirst(messy, GIT_BASH)).toBe(`${GIT_BASH};${SYSTEM32};C:\\tools`);
  });

  it('changes nothing when no Git Bash was found', () => {
    // Non-Windows, or Windows without git: the resolver reports nothing rather
    // than guessing, and an unknown directory must not rewrite the PATH.
    const untouched = '/usr/bin:/bin';
    expect(pathWithGitBashFirst(untouched, undefined)).toBe(untouched);
    expect(pathWithGitBashFirst(untouched, '')).toBe(untouched);
  });

  it('yields just the directory when there was no PATH to begin with', () => {
    expect(pathWithGitBashFirst('', GIT_BASH)).toBe(GIT_BASH);
  });
});

describe('the corrected PATH reaches the child under the name it already had', () => {
  it('rewrites Windows\u2019 own `Path` rather than adding a second key', () => {
    // The failure this guards is silent. `{ ...process.env, PATH: fixed }` on
    // Windows leaves `Path` untouched beside it, and a spawned process matches
    // case-sensitively: it can read the original, with the WSL launcher still
    // in front, while this code believes it handed over the corrected one.
    const env = environmentWithGitBashFirst({ Path: `${SYSTEM32};C:\\tools` }, GIT_BASH);
    expect(Object.keys(env).filter((name) => name.toUpperCase() === 'PATH')).toEqual(['Path']);
    expect(env['Path']).toBe(`${GIT_BASH};${SYSTEM32};C:\\tools`);
  });

  it('keeps an all-caps PATH as it found it', () => {
    const env = environmentWithGitBashFirst({ PATH: SYSTEM32 }, GIT_BASH);
    expect(Object.keys(env)).toEqual(['PATH']);
    expect(env['PATH']).toBe(`${GIT_BASH};${SYSTEM32}`);
  });

  it('introduces PATH only when the environment carries no such variable', () => {
    const env = environmentWithGitBashFirst({ SystemRoot: 'C:\\Windows' }, GIT_BASH);
    expect(env['PATH']).toBe(GIT_BASH);
    expect(env['SystemRoot']).toBe('C:\\Windows');
  });

  it('copies the environment untouched when no Git Bash was found', () => {
    const base = { Path: '/usr/bin:/bin' };
    const env = environmentWithGitBashFirst(base, undefined);
    expect(env).toEqual(base);
    expect(env).not.toBe(base);
  });
});
