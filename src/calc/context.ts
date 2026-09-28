import type { CaseContext, FY, OccupationTag, Question, RepeaterItem } from '../engine/types';
import { answerKey } from '../engine/answers';
import type { RuleSet } from '../rules/schema';
import { ScopedAnswerView } from './answer-scope';
import { LineBuilder, manualReview } from './explain';
import type { CalcInput, ManualReviewItem } from './types';

export type ModuleState = 'computed' | 'manual_review' | 'not_applicable';

/** A visible instance of a question: case-level (itemId null) or one repeater item. */
export interface Instance {
  key: string;
  itemId: string | null;
}

/**
 * Shared state every calc module reads and writes. Built once per `calculate` call.
 */
export class CalcContext {
  readonly a: ScopedAnswerView;
  readonly rules: RuleSet;
  readonly fy: FY;
  readonly questions: readonly Question[];
  readonly qById: Map<string, Question>;
  readonly visible: Set<string>;
  readonly ctx: CaseContext;
  readonly activeTags: Set<OccupationTag>;
  readonly lines = new LineBuilder();
  readonly reviews: ManualReviewItem[] = [];
  readonly assumptions: string[] = [];
  readonly uncertain = new Set<string>();
  readonly moduleStatus: Record<string, ModuleState> = {};
  readonly rulesFor: (fy: string) => RuleSet | undefined;

  constructor(input: CalcInput) {
    this.a = new ScopedAnswerView(input.answers, { visible: input.visible, exclude: input.excludeInputs });
    this.rules = input.rules;
    this.fy = input.ctx.fy;
    this.questions = input.questions;
    this.qById = new Map(input.questions.map((q) => [q.id, q]));
    this.visible = input.visible;
    this.ctx = input.ctx;
    this.activeTags = input.activeTags;
    this.rulesFor = input.rulesFor ?? (() => undefined);
  }

  question(id: string): Question | undefined {
    return this.qById.get(id);
  }

  /** True when the question id exists in the bank. */
  exists(id: string): boolean {
    return this.qById.has(id);
  }

  /** Record a manual review item (deduplicated by module + reason + ids). */
  review(module: string, reason: string, questionIds: string[], amountCents?: number): ManualReviewItem {
    const item = manualReview(module, reason, questionIds, amountCents);
    const dup = this.reviews.find(
      (r) => r.module === item.module && r.reason === item.reason && r.questionIds.join('|') === item.questionIds.join('|'),
    );
    if (dup) return dup;
    this.reviews.push(item);
    return item;
  }

  assume(text: string): void {
    if (!this.assumptions.includes(text)) this.assumptions.push(text);
  }

  markUncertain(...keys: string[]): void {
    for (const k of keys) this.uncertain.add(k);
  }

  setStatus(module: string, state: ModuleState): void {
    const prev = this.moduleStatus[module];
    // manual_review sticks; computed overrides not_applicable.
    if (prev === 'manual_review') return;
    if (prev === 'computed' && state === 'not_applicable') return;
    this.moduleStatus[module] = state;
  }

  /**
   * Visible instances of a question: one for case-level questions, one per item of the
   * question's repeater group. A question absent from the bank is resolved from the answers
   * themselves (any item that has an answer for it).
   */
  instances(questionId: string): Instance[] {
    const q = this.qById.get(questionId);
    const out: Instance[] = [];
    const push = (itemId: string | null) => {
      const key = answerKey(questionId, itemId);
      if (this.visible.has(key)) out.push({ key, itemId });
    };
    if (q?.repeaterGroup) {
      for (const it of this.a.items(q.repeaterGroup)) push(it.id);
      return out;
    }
    if (q) {
      push(null);
      return out;
    }
    // Unknown question: look at answers for it.
    const seen = new Set<string>();
    for (const r of this.a.recordsFor(questionId)) {
      const k = answerKey(questionId, r.repeaterItemId);
      if (seen.has(k)) continue;
      seen.add(k);
      push(r.repeaterItemId ?? null);
    }
    return out;
  }

  /** Visible instances that carry a usable integer-cents value. */
  centsInstances(questionId: string): Array<Instance & { cents: number }> {
    return this.instances(questionId)
      .map((i) => ({ ...i, cents: this.a.cents(questionId, i.itemId) }))
      .filter((i): i is Instance & { cents: number } => i.cents !== undefined);
  }

  items(groupId: string): RepeaterItem[] {
    return this.a.items(groupId);
  }

  /** Resolve a sibling answer inside the same repeater item first, then case-level. */
  scopedValue<T = unknown>(questionId: string, itemId: string | null): T | undefined {
    if (itemId) {
      const v = this.a.value<T>(questionId, itemId);
      if (v !== undefined) return v;
    }
    return this.a.value<T>(questionId, null);
  }

  scopedString(questionId: string, itemId: string | null): string | undefined {
    const v = this.scopedValue(questionId, itemId);
    return typeof v === 'string' ? v : undefined;
  }

  scopedList(questionId: string, itemId: string | null): string[] | undefined {
    const v = this.scopedValue(questionId, itemId);
    return Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as string[]) : undefined;
  }

  scopedNumber(questionId: string, itemId: string | null): number | undefined {
    const v = this.scopedValue(questionId, itemId);
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  }

  scopedCents(questionId: string, itemId: string | null): number | undefined {
    const n = this.scopedNumber(questionId, itemId);
    return n === undefined ? undefined : Math.trunc(n);
  }

  scopedNotSure(questionId: string, itemId: string | null): boolean {
    if (itemId && this.a.get(questionId, itemId)) return this.a.isNotSure(questionId, itemId);
    return this.a.isNotSure(questionId, null);
  }
}

/** Financial-year date bounds. */
export function fyBounds(fy: FY): { from: string; to: string; startYear: number; endYear: number } {
  const startYear = Number(fy.slice(0, 4));
  return { from: `${startYear}-07-01`, to: `${startYear + 1}-06-30`, startYear, endYear: startYear + 1 };
}

/** Days in the financial year (366 when the February inside it is a leap February). */
export function daysInFy(fy: FY): number {
  const { endYear } = fyBounds(fy);
  const leap = (endYear % 4 === 0 && endYear % 100 !== 0) || endYear % 400 === 0;
  return leap ? 366 : 365;
}

/** Parse 'YYYY-MM-DD' into a UTC Date, or undefined when malformed. */
export function parseIsoDate(s: unknown): Date | undefined {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  if (d.toISOString().slice(0, 10) !== s) return undefined;
  return d;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Whole days between two ISO dates (b - a). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Add calendar months, clamping the day to the target month's length (29 Feb + 12m -> 28 Feb). */
export function addMonths(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m + months, 1));
  const daysInTarget = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, daysInTarget));
  return target;
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}
