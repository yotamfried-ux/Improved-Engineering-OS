/**
 * The Stage 2 seed import, as a pure transform.
 *
 * C-04's bootstrap path: before Stage 10 there is no Promoter, so an import
 * tool writes a **local** promotion bundle and the owner opens and reviews the
 * PR. This tool therefore has no git in it at all -- no branch, no push, no
 * commit. Fitness rule F3 greps `tools/` for exactly that, and the absence is
 * the point rather than an oversight.
 *
 * The division of labour matters. `selection.yaml` is the hand selection the
 * guide asks for: a human decided which legacy files become assets, what they
 * are called, and which Solution Set they belong to. This module does only the
 * mechanical half -- extract the named section, compute `content_hash` over the
 * bytes that will actually be written, and emit records that satisfy the
 * contracts. It chooses nothing, and it never invents a Champion (D34, P-01):
 * every Solution Set it emits is `unresolved` with `champion_id: null`, which
 * is the state a freshly imported group legitimately has.
 */

import { hashFileSet } from '@ieos/core';
import type { AssetRecord, SolutionSetRecord } from '@ieos/core';

export class SeedImportError extends Error {
  readonly at: string;
  constructor(message: string, at: string) {
    super(`${at}: ${message}`);
    this.name = 'SeedImportError';
    this.at = at;
  }
}

const LIFECYCLE = {
  schema_version: '1',
  stability: 'development' as const,
  introduced_in: '0.1.0',
  deprecated_in: null,
  replacement: null,
  migration_path: null,
};

export interface SelectedAsset {
  readonly id: string;
  readonly legacy_path: string;
  /** A `## <section>` heading to extract, or null to take the whole file. */
  readonly section: string | null;
  readonly type: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly problem_id: string;
  readonly solution_set_id: string | null;
  readonly capabilities: readonly string[];
  readonly platforms: readonly string[];
}

export interface SelectedSolutionSet {
  readonly id: string;
  readonly problem_id: string;
  readonly compatibility_key: string;
  readonly why_unresolved: string;
}

export interface Selection {
  readonly revision_pin: string;
  readonly solution_sets: readonly SelectedSolutionSet[];
  readonly assets: readonly SelectedAsset[];
}

/**
 * Pull one `## <heading>` section out of a Markdown file.
 *
 * The legacy corpus keeps several patterns in one category README, and an
 * asset is one solution to one problem (D20.1). Importing the whole file as a
 * single asset would model four alternatives as one, which is precisely the
 * shape a Solution Set exists to represent.
 *
 * The heading line is kept: it is the section's own title, and dropping it
 * would leave a body whose first line is a sentence fragment.
 */
export function extractSection(markdown: string, heading: string): string {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) {
    throw new SeedImportError(`no "## ${heading}" section`, heading);
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if ((lines[i] ?? '').startsWith('## ')) {
      end = i;
      break;
    }
  }
  // Trailing blank lines and the `---` rules the corpus puts between sections
  // are separators, not content.
  const body = lines
    .slice(start, end)
    .join('\n')
    .replace(/\n+(?:---\s*)?\n*$/u, '\n');
  return body.endsWith('\n') ? body : `${body}\n`;
}

/** The body an asset will carry: a whole file, or one section of one. */
export function bodyFor(selected: SelectedAsset, source: string): string {
  return selected.section === null ? source : extractSection(source, selected.section);
}

export interface CompiledAsset {
  readonly asset: AssetRecord;
  readonly body: string;
  /** Where it lands under `knowledge/assets/`. */
  readonly directory: string;
}

/**
 * Build one asset record.
 *
 * `content_hash` is computed over the body this import will actually write,
 * not over the legacy file. That is what D19 defines it as -- the D35 file-set
 * digest of `body.md` plus `files/` -- and since the index builder now verifies
 * it at build time, a hash taken over anything else would fail the build rather
 * than pass unnoticed.
 */
export function compileAsset(
  selected: SelectedAsset,
  source: string,
  revision: string,
  observedAt: string,
): CompiledAsset {
  const body = bodyFor(selected, source);
  const content_hash = hashFileSet([{ path: 'body.md', bytes: new TextEncoder().encode(body) }]);

  const asset = {
    ...LIFECYCLE,
    id: selected.id,
    type: selected.type,
    slug: selected.slug,
    title: selected.title,
    summary: selected.summary,
    // R-04: imported assets are `active` and carry no evidence. "Admitted,
    // unproven" is a real state, and `inspect` reports `evidence: none` for it.
    status: 'active',
    content_hash,
    // D19: the old Engineering-OS path, so provenance survives the rebuild.
    legacy_ids: [selected.legacy_path],
    problem: { id: selected.problem_id, capabilities: [...selected.capabilities].sort() },
    solution_set_id: selected.solution_set_id,
    applicability: {
      conditions:
        selected.platforms.length === 0
          ? []
          : [{ fact: 'platform', in: [...selected.platforms].sort() }],
    },
    compatibility: { platforms: [...selected.platforms].sort(), providers: [], constraints: [] },
    provenance: [
      {
        source_type: 'existing_eos',
        source_identity: 'yotamfried-ux/Engineering-OS',
        source_revision: revision,
        observed_at: observedAt,
        // The bytes were read from a checkout at a named commit and hashed.
        // That is what `verified` means here: the provenance is verified, which
        // is a different claim from the content being verified as correct.
        integrity: 'verified',
      },
    ],
    // Importing is not verifying. Nothing re-checked whether these still hold,
    // so the date on which they were last verified is unknown, not today.
    freshness: { class: 'normal', last_verified_at: null },
    risk: { execution_authority: 'data_only', blast_radius: 'read_only' },
    relationships: { supersedes: [], superseded_by: [], related_to: [] },
    evidence_policy: { eligible_origins: ['qualification', 'operational'] },
    body: 'body.md',
    files: [],
  } as unknown as AssetRecord;

  return { asset, body, directory: `${selected.type}/${selected.slug}` };
}

/**
 * Build the Solution Sets.
 *
 * Every one is `unresolved` with `champion_id: null`. The importer is forbidden
 * from choosing a Champion (D34, P-01, Stage 5's own wording), and a set whose
 * members are all freshly imported and unproven has no Champion to choose.
 */
export function compileSolutionSets(selection: Selection): SolutionSetRecord[] {
  return selection.solution_sets.map((set) => {
    const members = selection.assets
      .filter((asset) => asset.solution_set_id === set.id)
      .map((asset) => asset.id)
      .sort();
    if (members.length === 0) {
      throw new SeedImportError('solution set has no members in the selection', set.id);
    }
    return {
      ...LIFECYCLE,
      id: set.id,
      problem_id: set.problem_id,
      compatibility_key: set.compatibility_key,
      members,
      champion_id: null,
      canonical_state: 'unresolved',
      champion_since_release: null,
      why_unresolved: set.why_unresolved,
    } as unknown as SolutionSetRecord;
  });
}
