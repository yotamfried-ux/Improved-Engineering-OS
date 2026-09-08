/**
 * `ieos investigate <run_id>` v0 (T-03, guide Stage 2).
 *
 * The deliverable is "the raw event timeline plus the derived attribution
 * rows", and the word that carries the weight is *raw*. An investigation whose
 * timeline is a summary cannot answer the question people actually bring to it:
 * not "what does the system think happened" but "what did it see". So the
 * timeline is the events in the ordering key they were recorded under, and the
 * derived rows are shown beside them, never instead of them.
 *
 * Two things this deliberately shows that a tidier report would hide:
 *
 *   the run's telemetry_state. A run that lost events is a run whose timeline
 *   has holes, and reading that timeline as complete is the exact mistake D23
 *   exists to prevent. It is printed first, not in a footnote.
 *
 *   events that produced no evidence. Most events do not name an asset. Hiding
 *   them would make the timeline look like the derivation's input rather than
 *   like the run.
 *
 * Rendering is a pure function of the data. The CLI supplies the events, the
 * Run record and the rows; nothing here reads a clock, a file or an
 * environment, so the same run always renders the same text.
 */

import type { RunRecord, TelemetryEvent } from '@ieos/core';
import type { AttributionRow } from './attribution.ts';

export interface InvestigationInput {
  readonly run: RunRecord;
  readonly events: readonly TelemetryEvent[];
  readonly rows: readonly AttributionRow[];
}

export interface TimelineEntry {
  readonly sequence: number;
  readonly emitterId: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly sourceType: string;
  /** Evidence rows this event contributed to, by id. Usually empty. */
  readonly contributedTo: readonly string[];
}

export interface Investigation {
  readonly runId: string;
  readonly originClass: string;
  readonly telemetryState: 'COMPLETE' | 'INCOMPLETE' | 'UNKNOWN';
  readonly qualificationEligible: boolean | null;
  readonly timeline: readonly TimelineEntry[];
  readonly rows: readonly AttributionRow[];
}

/** Build the investigation view. Pure; ordering is D26's, not the clock's. */
export function investigate(input: InvestigationInput): Investigation {
  const contributions = new Map<string, string[]>();
  for (const row of input.rows) {
    for (const eventId of row.sourceEventIds) {
      const existing = contributions.get(eventId);
      if (existing === undefined) contributions.set(eventId, [row.evidence.evidence_id]);
      else existing.push(row.evidence.evidence_id);
    }
  }

  const timeline = [...input.events]
    .sort((a, b) => {
      if (a.emitter_id !== b.emitter_id) return a.emitter_id < b.emitter_id ? -1 : 1;
      if (a.source.sequence !== b.source.sequence) return a.source.sequence - b.source.sequence;
      return a.event_id < b.event_id ? -1 : a.event_id > b.event_id ? 1 : 0;
    })
    .map((event) => ({
      sequence: event.source.sequence,
      emitterId: event.emitter_id,
      eventId: event.event_id,
      eventType: event.event_type,
      occurredAt: event.time.occurred_at,
      sourceType: event.source.type,
      contributedTo: contributions.get(event.event_id) ?? [],
    }));

  return {
    runId: input.run.run_id,
    originClass: input.run.origin_class,
    // `null` is its own answer: the run exists but nothing has written its
    // terminal state yet. Rendering that as COMPLETE would be the lie D23 names.
    telemetryState: input.run.telemetry_state ?? 'UNKNOWN',
    qualificationEligible: input.run.qualification_eligible,
    timeline,
    rows: input.rows,
  };
}

/** Render the investigation as the plain text `ieos investigate` prints. */
export function renderInvestigation(investigation: Investigation): string {
  const lines: string[] = [];
  lines.push(`run ${investigation.runId}`);
  lines.push(`  origin_class:          ${investigation.originClass}`);
  lines.push(`  telemetry_state:       ${investigation.telemetryState}`);
  lines.push(
    `  qualification_eligible: ${
      investigation.qualificationEligible === null
        ? 'unknown'
        : String(investigation.qualificationEligible)
    }`,
  );
  if (investigation.telemetryState !== 'COMPLETE') {
    // Stated in the body, not only in a field, because the reader's next
    // question is whether the timeline below can be trusted to be whole.
    lines.push('');
    lines.push(
      '  NOTE: this run did not report complete telemetry, so the timeline below may ' +
        'have gaps. Nothing derived from it is qualification evidence (D23).',
    );
  }

  lines.push('');
  lines.push(
    `timeline (${String(investigation.timeline.length)} events, in emitter/sequence order)`,
  );
  if (investigation.timeline.length === 0) {
    lines.push('  (no events recorded for this run)');
  }
  for (const entry of investigation.timeline) {
    const mark = entry.contributedTo.length > 0 ? '*' : ' ';
    lines.push(
      `  ${mark} ${String(entry.sequence).padStart(4, ' ')}  ${entry.occurredAt}  ` +
        `${entry.eventType.padEnd(18, ' ')} ${entry.sourceType.padEnd(6, ' ')} ${entry.eventId}`,
    );
  }

  lines.push('');
  lines.push(`attribution (${String(investigation.rows.length)} assets)`);
  if (investigation.rows.length === 0) {
    lines.push('  (no asset was exposed, inspected or applied in this run)');
  }
  for (const row of investigation.rows) {
    lines.push(`  ${row.assetId}  ${row.exposure}`);
    lines.push(`      evidence_id:  ${row.evidence.evidence_id}`);
    lines.push(
      `      integrity:    ${row.evidence.integrity.source_authority} / ` +
        `${row.evidence.integrity.verification}`,
    );
    lines.push(`      from events:  ${row.sourceEventIds.join(', ')}`);
  }

  return `${lines.join('\n')}\n`;
}
