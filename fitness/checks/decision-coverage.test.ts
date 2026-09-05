/**
 * ADR coverage and cross-document consistency (Stage 0 criterion B3).
 *
 * Three documents describe the same decisions from different angles: the ADRs,
 * the decision log, and the Stage 0 plan. Drift between them is the failure
 * this file exists to catch — a plan that says BLOCKED while the log says
 * measured is worse than either being wrong alone, because a reader cannot tell
 * which to believe.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './scan.ts';

const adrDir = join(REPO_ROOT, 'docs/adr');
const adrFiles = readdirSync(adrDir).filter((name) => name.endsWith('.md'));
const adrText = adrFiles.map((name) => readFileSync(join(adrDir, name), 'utf8')).join('\n');

const log = readFileSync(join(REPO_ROOT, 'docs/decisions/DECISION-LOG.md'), 'utf8');
const plan = readFileSync(join(REPO_ROOT, 'docs/plan/stage-0-plan.md'), 'utf8');

/** D19 through D36 — the decisions the Stage 0 deliverable list requires ADRs for. */
const ADDED_DECISIONS = Array.from({ length: 18 }, (_unused, index) => `D${String(index + 19)}`);

describe('the ADR set exists and is non-vacuous', () => {
  it('has ADR files to check', () => {
    expect(adrFiles.length).toBeGreaterThanOrEqual(9);
  });

  it('every ADR declares status, date and stage', () => {
    for (const name of adrFiles) {
      const text = readFileSync(join(adrDir, name), 'utf8');
      expect(text, `${name} needs a Status row`).toMatch(/\|\s*Status\s*\|/u);
      expect(text, `${name} needs a Date row`).toMatch(/\|\s*Date\s*\|/u);
      expect(text, `${name} needs a Stage row`).toMatch(/\|\s*Stage\s*\|/u);
    }
  });

  it('every ADR states context, decision and consequences', () => {
    for (const name of adrFiles) {
      const text = readFileSync(join(adrDir, name), 'utf8');
      expect(text, `${name} needs a Context section`).toMatch(/^##\s+Context/mu);
      expect(text, `${name} needs a Decision section`).toMatch(/^##\s+Decision/mu);
      expect(text, `${name} needs Consequences`).toMatch(/^##[^\n]*Consequences/mu);
    }
  });

  it('the ADRs covering added decisions name their rejected alternatives', () => {
    // Only for the grouped D19-D36 records: a baseline-by-reference ADR has no
    // alternatives of its own to reject.
    for (const name of adrFiles.filter((f) => /ADR-000[6-9]/u.test(f))) {
      const text = readFileSync(join(adrDir, name), 'utf8');
      expect(text, `${name} should record rejected alternatives`).toMatch(
        /^##\s+Rejected alternatives/mu,
      );
    }
  });

  it('every ADR records what verification it implies', () => {
    for (const name of adrFiles.filter((f) => /ADR-000[6-9]/u.test(f))) {
      const text = readFileSync(join(adrDir, name), 'utf8');
      expect(text, `${name} should say what Stage 0 implemented`).toMatch(
        /What Stage 0 (deliberately )?implemented/u,
      );
    }
  });
});

describe('D19-D36 are all covered by an ADR', () => {
  it.each(ADDED_DECISIONS)('%s appears in the ADR set', (decision) => {
    // Word-boundary match so D3 does not satisfy D30.
    const pattern = new RegExp(`\\b${decision}\\b`, 'u');
    expect(pattern.test(adrText), `${decision} is not covered by any ADR`).toBe(true);
  });

  it('D1-D17 are covered by the baseline ADR, by reference', () => {
    const baseline = readFileSync(join(adrDir, 'ADR-0001-architecture-baseline.md'), 'utf8');
    expect(baseline).toMatch(/D1[–-]D17/u);
    expect(baseline).toMatch(/by reference/u);
  });

  it('decisions are grouped rather than one ADR per decision for its own sake', () => {
    // The brief is explicit that a numeric count is not the goal. Four records
    // covering eighteen decisions is the grouping; a 1:1 mapping would scatter
    // one architectural question across three files.
    expect(adrFiles.filter((f) => /ADR-000[6-9]/u.test(f))).toHaveLength(4);
  });
});

describe('the decision log covers the same ground', () => {
  it.each(ADDED_DECISIONS)('%s is dispositioned in the decision log', (decision) => {
    expect(new RegExp(`\\b${decision}\\b`, 'u').test(log)).toBe(true);
  });

  it('every ADR file is linked from the decision log index', () => {
    for (const name of adrFiles) {
      expect(log, `${name} is not linked from DECISION-LOG.md section 1`).toContain(name);
    }
  });
});

describe('the documents do not contradict each other', () => {
  it('no document still describes C-1 or C-6 as awaiting the owner', () => {
    // Both were approved. A stale "needs owner confirmation" would send a
    // reader looking for a decision that has already been made.
    for (const [name, text] of [
      ['DECISION-LOG.md', log],
      ['stage-0-plan.md', plan],
      ['the ADR set', adrText],
    ] as const) {
      expect(text, `${name} still asks for owner confirmation of C-1/C-6`).not.toMatch(
        /Needs owner confirmation \|\s*\*\*Yes\*\*/u,
      );
    }
  });

  it('C-1 is still recorded as an approved deviation, not as F1 being satisfied', () => {
    // The owner approved the exception; that does not retroactively make the
    // original F1 wording true, and the guide requires relaxed rules to stay
    // visible as deviations.
    expect(log).toMatch(/C-1/u);
    expect(log).toMatch(/approved deviation|Approved deviation|APPROVED/u);
  });

  it('every document that claims a Windows run cites the run it rests on', () => {
    // Was "no document claims a Windows run has happened". A Windows run has
    // now happened, so the guard changed direction rather than being dropped:
    // the claim is allowed, and must be anchored. An unanchored "verified on
    // Windows" is exactly the sentence nobody can check.
    for (const [name, text] of [
      ['DECISION-LOG.md', log],
      ['stage-0-plan.md', plan],
    ] as const) {
      if (!/win32|Windows runner|windows smoke/iu.test(text)) continue;
      expect(text, `${name} claims a Windows observation without citing a run id`).toMatch(
        /33953023783|33952550921|run \d{8,}/u,
      );
    }
  });

  it('the plan and the log agree on which SQLite binding was selected', () => {
    // Asserts agreement, not a particular answer, so the selection can change
    // without this test having to be rewritten -- but the two documents can
    // never disagree about it.
    const selectedIn = (text: string): string | null => {
      if (/no binding is selected/iu.test(text)) return 'none';
      if (
        /Binding selected: `?node:sqlite|adopt `?node:sqlite|`node:sqlite` adopted/iu.test(text)
      ) {
        return 'node:sqlite';
      }
      if (/Binding selected: `?better-sqlite3|`better-sqlite3` adopted/iu.test(text)) {
        return 'better-sqlite3';
      }
      return null;
    };
    const inLog = selectedIn(log);
    const inPlan = selectedIn(plan);
    expect(inLog, 'the decision log states no SQLite selection either way').not.toBeNull();
    expect(inPlan, 'the plan states no SQLite selection either way').not.toBeNull();
    expect(inPlan).toBe(inLog);
  });

  it("a selected binding is recorded as a deviation when it is not the guide's", () => {
    // The framing the owner asked for, kept enforceable: adopting something
    // other than D18.5's choice must stay visible as an approved deviation, not
    // quietly become the new normal.
    if (/`node:sqlite` adopted|Binding selected: `?node:sqlite/iu.test(log)) {
      expect(log).toMatch(/C-9/u);
      expect(log).toMatch(/D18\.5/u);
      expect(log, 'the deviation must record that it rests on evidence').toMatch(
        /on evidence the guide did not have|owner-approved/iu,
      );
    }
  });

  it('the plan and the log agree the capability seed is no longer blocked', () => {
    expect(plan).toMatch(/B4[\s\S]{0,400}PASS/u);
    expect(log).toMatch(/seeded/u);
  });

  it('a Stage 0 pass is claimed only where a report actually says PASS', () => {
    // Was "the plan does not claim a Stage 0 pass", which was right while no
    // report existed. One does now, so the guard inverts like the others: the
    // claim is permitted, and it has to rest on a harness-generated report in
    // qualification/reports/ whose own text carries the verdict. A document
    // may not promote itself.
    const claimsPass = /Stage 0 (has )?passed|gate[^\n]*\bPASSED\b/iu.test(plan);
    if (!claimsPass) return;

    const reports = readdirSync(join(REPO_ROOT, 'qualification/reports')).filter((name) =>
      /^stage-00-\d{4}-\d{2}-\d{2}\.md$/u.test(name),
    );
    expect(reports.length, 'the plan claims a Stage 0 pass with no dated report').toBeGreaterThan(
      0,
    );

    const passing = reports.filter((name) =>
      /\*\*Verdict: PASS\*\*/u.test(
        readFileSync(join(REPO_ROOT, 'qualification/reports', name), 'utf8'),
      ),
    );
    expect(passing.length, 'no report in qualification/reports/ records a PASS verdict').toBe(
      reports.length,
    );
  });

  it('every dated stage report states a verdict and the platforms it rests on', () => {
    const dir = join(REPO_ROOT, 'qualification/reports');
    const reports = readdirSync(dir).filter((name) => /^stage-\d{2}-\d{4}-/u.test(name));
    for (const name of reports) {
      const text = readFileSync(join(dir, name), 'utf8');
      expect(text, `${name} states no verdict`).toMatch(/\*\*Verdict: (PASS|NOT PASSED)\*\*/u);
      expect(text, `${name} names no platforms`).toMatch(/Platforms in evidence/u);
      // A PASS that rests on one platform is the failure the whole gate exists
      // to prevent, so it is asserted here too rather than only in the tool.
      if (/\*\*Verdict: PASS\*\*/u.test(text)) {
        expect(text, `${name} claims PASS without win32`).toMatch(/win32/u);
        expect(text, `${name} claims PASS without linux`).toMatch(/linux/u);
      }
    }
  });
});
