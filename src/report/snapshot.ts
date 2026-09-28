/**
 * Immutable report snapshot (Section 3 `reports.snapshot`, Section 11).
 *
 * A snapshot freezes everything the PDF needs: the profile's display fields, the
 * estimate with its explain trail, the intelligence result and EVERY latest answer
 * record (including Not sure, skipped and answers no longer used). Rendering a PDF
 * from a snapshot never touches the question bank, rule tables or the database, so a
 * report reads the same in five years.
 *
 * Never includes: birth year, TFN, bank details, email addresses.
 */
import type { Estimate } from '@/src/calc/types';
import type { AnswerRecord, AnswerSource, AnswerState, ModuleId, Question } from '@/src/engine/types';
import { MODULE_LABELS, MODULE_ORDER } from '@/src/engine/types';
import { answerKey } from '@/src/engine/answers';
import type { IntelligenceResult } from '@/src/intelligence/types';
import type { CaseState } from '@/src/lib/case-state';
import { PURPOSE_LABELS, type CasePurpose, type Relationship } from '@/src/lib/db/types';
import { findOccupation } from '@/src/occupations/registry';
import { QUESTION_BANK, QUESTIONS_BY_ID } from '@/src/questions';
import { Q } from '@/src/questions/ids';
import { DEFAULT_TIMEZONE, displayAnswerValue } from './format';

export const SNAPSHOT_VERSION = 1 as const;

export interface SnapshotProfile {
  displayName: string;
  relationship: Relationship;
  occupationLabels: string[];
}

export interface SnapshotAnswer {
  questionId: string;
  itemId: string | null;
  itemLabel?: string;
  module: ModuleId | 'unknown';
  moduleLabel: string;
  prompt: string;
  value: unknown;
  /** Plain-text rendering of the value (or "Not sure" / "Skipped"). */
  display: string;
  state: AnswerState;
  source: AnswerSource;
  /** True when the question was visible in the interview at snapshot time. */
  visible: boolean;
  feeds?: string[];
}

export interface ReportSnapshot {
  version: typeof SNAPSHOT_VERSION;
  /** ISO timestamp of generation. */
  generatedAt: string;
  /** IANA timezone the report displays times in. */
  timezone: string;
  profile: SnapshotProfile;
  fy: string;
  purpose: CasePurpose;
  purposeLabel: string;
  isFinal: boolean;
  ruleSetVersion: string;
  estimate: Estimate;
  intelligence: IntelligenceResult;
  answers: SnapshotAnswer[];
  /** Result on the ATO notice of assessment (refund +, debt -) when the user entered one. */
  assessedResultCents?: number;
}

export interface BuildSnapshotOptions {
  isFinal: boolean;
  timezone: string;
  /** Override for tests; defaults to the question bank. */
  questionsById?: Map<string, Question>;
  /** Override for tests; defaults to now. */
  now?: Date;
}

function displayFor(q: Question | undefined, rec: AnswerRecord): string {
  if (rec.state === 'not_sure') return 'Not sure';
  if (rec.state === 'skipped') return 'Skipped';
  return displayAnswerValue(q, rec.value);
}

function bankOrder(byId: Map<string, Question>): Map<string, number> {
  let i = 0;
  const order = new Map<string, number>();
  for (const id of byId.keys()) order.set(id, i++);
  return order;
}

let bankOrderCache: Map<string, number> | null = null;
function loadBank(): { byId: Map<string, Question>; order: Map<string, number> } {
  if (!bankOrderCache) bankOrderCache = new Map(QUESTION_BANK.map((q, i) => [q.id, i]));
  return { byId: QUESTIONS_BY_ID, order: bankOrderCache };
}

/** Freeze a case into a report snapshot. Pure: no I/O. */
export function buildSnapshot(state: CaseState, estimate: Estimate, intelligence: IntelligenceResult, opts: BuildSnapshotOptions): ReportSnapshot {
  const { byId, order } = opts.questionsById ? { byId: opts.questionsById, order: bankOrder(opts.questionsById) } : loadBank();
  const itemsById = new Map(state.items.map((it) => [it.id, it]));
  const moduleRank = new Map<string, number>(MODULE_ORDER.map((m, i) => [m, i]));

  const answers: SnapshotAnswer[] = state.view.records().map((rec) => {
    const q = byId.get(rec.questionId);
    const item = rec.repeaterItemId ? itemsById.get(rec.repeaterItemId) : undefined;
    const module: ModuleId | 'unknown' = q?.module ?? 'unknown';
    const a: SnapshotAnswer = {
      questionId: rec.questionId,
      itemId: rec.repeaterItemId ?? null,
      module,
      moduleLabel: q ? MODULE_LABELS[q.module] : 'Other',
      prompt: q?.prompt ?? rec.questionId,
      value: rec.value ?? null,
      display: displayFor(q, rec),
      state: rec.state,
      source: rec.source,
      visible: state.visibleKeys.has(answerKey(rec.questionId, rec.repeaterItemId)),
    };
    if (item?.label) a.itemLabel = item.label;
    else if (item) a.itemLabel = `${item.groupId.replace(/_/g, ' ')} ${item.sortOrder + 1}`;
    if (q?.feeds?.length) a.feeds = [...q.feeds];
    return a;
  });

  answers.sort((x, y) => {
    const mx = moduleRank.get(x.module) ?? 999;
    const my = moduleRank.get(y.module) ?? 999;
    if (mx !== my) return mx - my;
    const ox = order.get(x.questionId) ?? 999_999;
    const oy = order.get(y.questionId) ?? 999_999;
    if (ox !== oy) return ox - oy;
    const ix = x.itemId ? (itemsById.get(x.itemId)?.sortOrder ?? 0) : -1;
    const iy = y.itemId ? (itemsById.get(y.itemId)?.sortOrder ?? 0) : -1;
    return ix - iy;
  });

  const assessed = state.view.cents(Q.core.assessedResult);
  const snapshot: ReportSnapshot = {
    version: SNAPSHOT_VERSION,
    generatedAt: (opts.now ?? new Date()).toISOString(),
    timezone: opts.timezone || DEFAULT_TIMEZONE,
    profile: {
      displayName: state.profile.display_name,
      relationship: state.profile.relationship,
      occupationLabels: state.profile.occupations.map((id) => findOccupation(id)?.label ?? id),
    },
    fy: state.ctx.fy,
    purpose: state.caseRow.purpose,
    purposeLabel: PURPOSE_LABELS[state.caseRow.purpose] ?? state.caseRow.purpose,
    isFinal: opts.isFinal,
    ruleSetVersion: estimate.ruleSetVersion,
    estimate,
    intelligence,
    answers,
  };
  if (assessed !== undefined) snapshot.assessedResultCents = assessed;
  return snapshot;
}

/** Loose runtime check for a stored `reports.snapshot` JSON value. */
export function isReportSnapshot(v: unknown): v is ReportSnapshot {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<ReportSnapshot>;
  return s.version === 1 && typeof s.generatedAt === 'string' && !!s.estimate && !!s.intelligence && Array.isArray(s.answers) && !!s.profile;
}

/** Open review items = flags that are not opportunities. */
export function openReviewCount(snapshot: ReportSnapshot): number {
  return snapshot.intelligence.flags.filter((f) => f.kind !== 'opportunity').length;
}
