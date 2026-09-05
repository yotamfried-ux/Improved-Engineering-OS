/**
 * Source-scan fitness rules: F1b, F3, F6, F9, F12.
 *
 * Two things every rule below carries:
 *
 *   - a control asserting the scan can actually fire. A check that cannot fail
 *     proves nothing, and the Stage 0 simulation manifest lists "evaluator does
 *     not detect known-bad" as a failure condition. A fitness rule is an
 *     evaluator.
 *   - a scope that matches the rule's own wording. Every narrowing is recorded
 *     in fitness/exclusions.yaml with its reason; a scope narrowed silently is
 *     the same as a rule deleted silently.
 */

import { describe, expect, it } from 'vitest';
import {
  describe as render,
  exists,
  findMatches,
  readSourceFiles,
  stripAllComments,
  type SourceFile,
} from './scan.ts';

const RUNTIME_ROOTS = [
  'packages',
  'contracts',
  'knowledge',
  'supabase',
  'simulations',
  'fitness',
  'tools',
];

/** Recorded in fitness/exclusions.yaml, every entry with a reason. */
const BASE_EXCLUDE = [
  'docs',
  'qualification',
  'contracts/schemas',
  'packages/core/test/fixtures',
  // The files that define or document a rule necessarily contain the pattern it
  // looks for, each with a deliberate known-bad control.
  'fitness/checks',
  'fitness/rules.ts',
  'fitness/allowlist.yaml',
];

const runtimeFiles = readSourceFiles(RUNTIME_ROOTS, { exclude: BASE_EXCLUDE });
const coreFiles = readSourceFiles(['packages/core/src']);

/** A synthetic file, used to prove a scan can fire. */
const known = (content: string): SourceFile[] => [{ path: 'synthetic/known-bad.ts', content }];

describe('the scan reads something', () => {
  it('found source files, so the rules below are not vacuous', () => {
    expect(runtimeFiles.length).toBeGreaterThan(10);
    expect(coreFiles.length).toBeGreaterThan(5);
  });

  it('comment stripping preserves line numbers, so violations stay locatable', () => {
    const stripped = stripAllComments(known('const a = 1;\n/* two\nline */\nconst b = 2;'))[0]!;
    expect(stripped.content.split('\n')).toHaveLength(4);
    expect(stripped.content.split('\n')[3]).toBe('const b = 2;');
  });
});

describe('F1b -- core carries no vendor or agent identifier', () => {
  // No trailing \b: the identifiers this rule is really after are compound ones --
  // `supabaseUrl`, `claudeClient`, `openaiKey` -- and a trailing boundary would miss
  // every one of them while still matching the bare word.
  const VENDOR =
    /\b(claude|codex|anthropic|openai|supabase|gemini|openrouter|modelcontextprotocol)/iu;

  it('finds none in the CODE of packages/core/src', () => {
    // Comments are stripped first: F1's wording is "identifiers", and a comment
    // recording that store-supabase implements a port is architecture
    // documentation living next to the thing it documents.
    const violations = findMatches(stripAllComments(coreFiles), VENDOR);
    expect(violations, `F1b violations:\n${render(violations)}`).toEqual([]);
  });

  it('control: the scan still fires on real code after stripping', () => {
    expect(
      findMatches(stripAllComments(known("import { Client } from '@anthropic-ai/sdk';")), VENDOR),
    ).toHaveLength(1);
    expect(
      findMatches(stripAllComments(known('const supabaseUrl = config.url;')), VENDOR),
    ).toHaveLength(1);
  });

  it('control: stripping does not silently disable the scan', () => {
    // If stripComments removed everything, the control above would pass
    // vacuously. This asserts the stripped file still has its code.
    expect(stripAllComments(coreFiles).some((file) => file.content.includes('export'))).toBe(true);
  });

  it('core imports only allowlisted third-party packages', () => {
    const ALLOWED = new Set(['zod']);
    const offenders: string[] = [];
    for (const file of coreFiles) {
      for (const match of file.content.matchAll(/from\s+'([^']+)'/gu)) {
        const specifier = match[1] as string;
        if (specifier.startsWith('.') || specifier.startsWith('node:')) continue;
        const packageName = specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : (specifier.split('/')[0] as string);
        if (!ALLOWED.has(packageName)) offenders.push(`${file.path}: ${specifier}`);
      }
    }
    expect(offenders, 'add an entry to fitness/allowlist.yaml if this is intended').toEqual([]);
  });

  it('F1a: core imports no workspace package', () => {
    expect(findMatches(coreFiles, /from\s+'@ieos\//u)).toEqual([]);
  });
});

describe('F3 -- runtime never mutates canonical knowledge, and no tool pushes', () => {
  const KNOWLEDGE_WRITE =
    /(writeFile|writeFileSync|appendFile|appendFileSync|rmSync|unlinkSync|mkdirSync)[\s\S]{0,60}knowledge\//u;
  // Matches a git push however it is spelled: a shell string, an argv array, or
  // an API call. `git` and `push` on one line is the signal.
  const GIT_PUSH =
    /(git[^\n]{0,60}\bpush\b|--force-with-lease|createPullRequest|\bcreateRef\s*\()/u;

  const runtimeCode = readSourceFiles(['packages', 'tools'], { exclude: BASE_EXCLUDE });

  it('nothing under packages/ or tools/ writes into knowledge/', () => {
    const violations = findMatches(runtimeCode, KNOWLEDGE_WRITE);
    expect(violations, `F3 violations:\n${render(violations)}`).toEqual([]);
  });

  it('nothing under packages/ or tools/ pushes a branch (C-04 bootstrap path)', () => {
    const violations = findMatches(stripAllComments(runtimeCode), GIT_PUSH);
    expect(violations, `F3 violations:\n${render(violations)}`).toEqual([]);
  });

  it('control: both scans fire on known-bad code', () => {
    expect(
      findMatches(
        known("writeFileSync(join(root, 'knowledge/assets/x.yaml'), body);"),
        KNOWLEDGE_WRITE,
      ),
    ).toHaveLength(1);
    expect(
      findMatches(known("execFileSync('git', ['push', 'origin', branch]);"), GIT_PUSH),
    ).toHaveLength(1);
    expect(findMatches(known('await run(`git push origin ${branch}`);'), GIT_PUSH)).toHaveLength(1);
  });

  it('the KnowledgeIndex port offers no write method at all', () => {
    // Structural, not conventional: a port with no write method cannot be
    // misused into one.
    const source = readSourceFiles(['packages/core/src/ports'])
      .map((file) => file.content)
      .join('\n');
    const section = source.slice(source.indexOf('interface KnowledgeIndex'));
    const body = section.slice(0, section.indexOf('\n}'));
    expect(body).not.toMatch(/\b(write|put|save|upsert|delete)\w*\s*\(/u);
  });
});

describe('F6 -- no target-project names or absolute paths in runtime paths', () => {
  const PROJECT_NAMES = /\b(Project\s?8|SportReel)\b/iu;
  const ABSOLUTE_PATHS = /(^|['"\s])(\/(home|Users)\/[A-Za-z0-9._-]+|[A-Z]:\\Users\\)/u;

  it('finds no target-project name, including in tests (TD-19)', () => {
    const violations = findMatches(runtimeFiles, PROJECT_NAMES);
    expect(violations, `F6 violations:\n${render(violations)}`).toEqual([]);
  });

  it('finds no absolute developer path in runtime or configuration code', () => {
    // Scoped to non-test sources: F6's own wording is "runtime/configuration
    // paths", and proving that a sandbox grants no HOME requires a fixture that
    // names a HOME. Recorded in fitness/exclusions.yaml.
    const nonTest = runtimeFiles.filter((file) => !file.path.includes('/test/'));
    const violations = findMatches(nonTest, ABSOLUTE_PATHS);
    expect(violations, `F6 violations:\n${render(violations)}`).toEqual([]);
  });

  it('control: both scans fire on known-bad code', () => {
    expect(findMatches(known("const target = 'Project 8';"), PROJECT_NAMES)).toHaveLength(1);
    expect(findMatches(known("const root = '/home/someone/repo';"), ABSOLUTE_PATHS)).toHaveLength(
      1,
    );
    expect(findMatches(known("const root = 'C:\\Users\\someone';"), ABSOLUTE_PATHS)).toHaveLength(
      1,
    );
  });
});

describe('F9 -- no key-shaped secret values anywhere', () => {
  // Values, not identifier words: "supabase" in a comment is fine, a key is not.
  const SECRET_SHAPES = [
    /sb_secret_[A-Za-z0-9]{20,}/u,
    /sb_publishable_[A-Za-z0-9]{20,}/u,
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./u, // JWT
    /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
    /gh[pousr]_[A-Za-z0-9]{30,}/u,
    /AKIA[0-9A-Z]{16}/u,
  ];

  const scanned = readSourceFiles(['packages', 'tools', 'contracts', 'fitness', 'supabase'], {
    exclude: BASE_EXCLUDE,
  });

  it.each(SECRET_SHAPES.map((pattern, index) => [index, pattern] as const))(
    'finds no value matching secret shape %i',
    (_index, pattern) => {
      const violations = findMatches(scanned, pattern);
      expect(violations, `F9 violations:\n${render(violations)}`).toEqual([]);
    },
  );

  it('control: the scan fires on key-shaped values', () => {
    expect(
      findMatches(known("const key = 'sb_secret_abcdefghijklmnopqrstuvwxyz';"), SECRET_SHAPES[0]!),
    ).toHaveLength(1);
    expect(findMatches(known('-----BEGIN RSA PRIVATE KEY-----'), SECRET_SHAPES[3]!)).toHaveLength(
      1,
    );
  });

  it('does not flag the identifier word, which is legitimate in docs and comments', () => {
    expect(
      findMatches(known('// the supabase secret key lives in function secrets'), SECRET_SHAPES[0]!),
    ).toEqual([]);
  });

  it('no privileged client is constructed outside supabase/functions', () => {
    const files = readSourceFiles(['packages', 'tools', 'fitness'], { exclude: BASE_EXCLUDE });
    expect(findMatches(files, /createClient\s*\(/u)).toEqual([]);
  });
});

describe('F12 -- one canonical hashing site', () => {
  const HASH_CALL = /createHash\s*\(/u;
  const CANONICAL_SITE = 'packages/core/src/hashing.ts';

  it('createHash appears only in the canonical implementation', () => {
    const files = readSourceFiles(['packages', 'tools', 'supabase', 'fitness'], {
      exclude: [...BASE_EXCLUDE, 'packages/core/test'],
    });
    const violations = findMatches(files, HASH_CALL).filter((v) => v.path !== CANONICAL_SITE);
    expect(violations, `F12 violations:\n${render(violations)}`).toEqual([]);
  });

  it('the canonical site exists and does hash', () => {
    // Otherwise the test above passes because nothing hashes at all.
    expect(exists(CANONICAL_SITE)).toBe(true);
    expect(findMatches(readSourceFiles([CANONICAL_SITE]), HASH_CALL).length).toBeGreaterThan(0);
  });

  it('control: the scan fires on a second hashing site', () => {
    expect(
      findMatches(known("const d = createHash('sha256').update(x).digest();"), HASH_CALL),
    ).toHaveLength(1);
  });

  it('nothing outside core defines a competing canonical serialization', () => {
    // packages/core IS the canonical site (D35), so its own API names are the
    // thing this rule protects rather than a competitor. Recorded in
    // fitness/exclusions.yaml.
    const files = readSourceFiles(['packages', 'tools', 'supabase'], {
      exclude: [...BASE_EXCLUDE, 'packages/core'],
    });
    const violations = findMatches(stripAllComments(files), /canonicaliz|jcs\(|rfc\s?8785/iu);
    expect(violations, `F12 violations:\n${render(violations)}`).toEqual([]);
  });

  it('the two permitted C-02 exceptions do not exist yet', () => {
    // Pre-registered in fitness/allowlist.yaml as forbidden-until-their-stage,
    // so a stray createHash( in either location fails today rather than after
    // the directory that would excuse it appears.
    expect(exists('packages/launcher')).toBe(false);
    expect(exists('supabase/functions/ingest')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// F7 -- runtime never resolves "latest"
// ---------------------------------------------------------------------------

describe('F7: runtime never resolves a floating version', () => {
  // Armed at Stage 1, when `packages/releases` appeared and made the rule have
  // a subject. The guide puts the *release resolution* half at Stage 4 ("unit
  // test (from Stage 4)"), and the launcher that performs it does not exist
  // yet -- so this is the prohibition half, enforced now over every runtime
  // package, rather than the whole rule.
  //
  // What it forbids: asking a registry, a release feed or a tag for whatever is
  // newest. A pinned release is only pinned if nothing in the path to it can
  // quietly resolve to something else.
  const FLOATING_VERSION =
    /(["'`]latest["'`]|@latest\b|dist-tags|\btag:\s*["'`]?latest|releases\/latest)/iu;

  const runtimeSources = stripAllComments(
    readSourceFiles(['packages'], { extensions: ['.ts', '.mts', '.cts', '.json'] }),
  );

  it('has runtime sources to scan, so the rule is not vacuous', () => {
    expect(runtimeSources.length).toBeGreaterThan(10);
  });

  it('no runtime package resolves "latest"', () => {
    const violations = findMatches(runtimeSources, FLOATING_VERSION);
    expect(
      violations,
      violations.map((v) => `${v.path}:${String(v.line)} ${v.excerpt}`).join('\n'),
    ).toEqual([]);
  });

  it('the scan can actually fire (control)', () => {
    // Without these, a regex that matched nothing would look like compliance.
    expect(
      findMatches(known('const url = `${base}/releases/latest`;'), FLOATING_VERSION),
    ).toHaveLength(1);
    expect(
      findMatches(known("await fetch(registry + '/dist-tags');"), FLOATING_VERSION),
    ).toHaveLength(1);
    expect(findMatches(known("install('@ieos/launcher@latest');"), FLOATING_VERSION)).toHaveLength(
      1,
    );
    expect(findMatches(known("const version = 'latest';"), FLOATING_VERSION)).toHaveLength(1);
  });

  it('does not fire on an exact version, which is the whole point', () => {
    expect(findMatches(known("const version = '1.4.1';"), FLOATING_VERSION)).toEqual([]);
    expect(findMatches(known("install('@ieos/launcher@1.4.1');"), FLOATING_VERSION)).toEqual([]);
  });
});
