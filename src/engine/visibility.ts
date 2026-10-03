/**
 * Visibility engine (Section 4 "Visibility and the never-infer rule", CONTRACT "Visibility rules").
 *
 * `showIf` only decides whether a question appears. Nothing here writes a value on the
 * user's behalf: `hiddenAnswerUpdates` only proposes `not_applicable_by_rule` rows that keep
 * the original value so nothing disappears silently.
 */
import type { AnswerView } from './answers';
import { answerKey } from './answers';
import type { AnswerRecord, AnswerState, CaseContext, Condition, FY, OccupationTag, Question } from './types';
import { FINANCIAL_YEARS, MODULE_ORDER } from './types';
import { isEligible } from './occupation-filter';

export interface VisibleQuestion {
  question: Question;
  itemId: string | null;
  key: string;
}

export interface ConditionScope {
  itemId: string | null;
  activeTags: Set<OccupationTag>;
}

/** Latest record for `q`: the same repeater item first, then the case-level answer. */
function resolveRecord(answers: AnswerView, q: string, itemId: string | null): AnswerRecord | undefined {
  if (itemId) {
    const inItem = answers.get(q, itemId);
    if (inItem) return inItem;
  }
  return answers.get(q, null);
}

/** Usable value only: state `answered`. `not_sure`, `skipped`, `imported`, n/a never match anything. */
function usableValue(answers: AnswerView, q: string, itemId: string | null): unknown {
  const rec = resolveRecord(answers, q, itemId);
  return rec && rec.state === 'answered' ? rec.value : undefined;
}

export function evaluateCondition(c: Condition, answers: AnswerView, scope: ConditionScope): boolean {
  if ('all' in c) return c.all.every((x) => evaluateCondition(x, answers, scope));
  if ('any' in c) return c.any.some((x) => evaluateCondition(x, answers, scope));
  if ('not' in c) return !evaluateCondition(c.not, answers, scope);
  if ('occupation' in c) return scope.activeTags.has(c.occupation);

  if ('anyItemGt' in c) {
    return answers.recordsFor(c.q).some((r) => r.state === 'answered' && typeof r.value === 'number' && r.value > c.anyItemGt);
  }
  if ('answered' in c) {
    return resolveRecord(answers, c.q, scope.itemId)?.state === 'answered';
  }
  const value = usableValue(answers, c.q, scope.itemId);
  if ('eq' in c) return typeof value === 'string' && value === c.eq;
  if ('in' in c) return typeof value === 'string' && c.in.includes(value);
  if ('includes' in c) return Array.isArray(value) && value.includes(c.includes);
  if ('gt' in c) return typeof value === 'number' && Number.isFinite(value) && value > c.gt;
  return false;
}

/** True when the question exists in the given financial year. */
export function existsInYear(q: Question, fy: FY): boolean {
  if (!q.years) return true;
  const idx = FINANCIAL_YEARS.indexOf(fy);
  if (idx < 0) return false;
  if (q.years.from !== undefined && idx < FINANCIAL_YEARS.indexOf(q.years.from)) return false;
  if (q.years.to !== undefined) {
    const toIdx = FINANCIAL_YEARS.indexOf(q.years.to);
    if (toIdx >= 0 && idx > toIdx) return false;
  }
  return true;
}

const moduleIndex = (q: Question): number => {
  const i = MODULE_ORDER.indexOf(q.module);
  return i < 0 ? MODULE_ORDER.length : i;
};

/** Bank sorted by MODULE_ORDER, keeping bank order inside each module (stable sort). */
export function orderQuestions(questions: readonly Question[]): Question[] {
  return questions
    .map((q, i) => ({ q, i }))
    .sort((a, b) => moduleIndex(a.q) - moduleIndex(b.q) || a.i - b.i)
    .map((x) => x.q);
}

export function visibleQuestions(
  questions: readonly Question[],
  answers: AnswerView,
  ctx: CaseContext,
  activeTags: Set<OccupationTag>,
): VisibleQuestion[] {
  const ordered = orderQuestions(questions);

  const repeaterByGroup = new Map<string, Question>();
  for (const q of ordered) {
    if (q.type === 'repeater' && q.repeater && !repeaterByGroup.has(q.repeater.groupId)) {
      repeaterByGroup.set(q.repeater.groupId, q);
    }
  }

  const caseVisibleCache = new Map<string, boolean>();
  const caseLevelVisible = (q: Question): boolean => {
    const cached = caseVisibleCache.get(q.id);
    if (cached !== undefined) return cached;
    let ok = existsInYear(q, ctx.fy) && isEligible(q, activeTags);
    if (ok && q.showIf) ok = evaluateCondition(q.showIf, answers, { itemId: null, activeTags });
    caseVisibleCache.set(q.id, ok);
    return ok;
  };

  const out: VisibleQuestion[] = [];
  for (const q of ordered) {
    if (!q.repeaterGroup) {
      if (caseLevelVisible(q)) out.push({ question: q, itemId: null, key: q.id });
      continue;
    }

    const parent = repeaterByGroup.get(q.repeaterGroup);
    if (!parent || !caseLevelVisible(parent)) continue;
    if (!existsInYear(q, ctx.fy) || !isEligible(q, activeTags)) continue;

    for (const item of answers.items(q.repeaterGroup)) {
      const scope: ConditionScope = { itemId: item.id, activeTags };
      if (q.showIf && !evaluateCondition(q.showIf, answers, scope)) continue;
      out.push({ question: q, itemId: item.id, key: answerKey(q.id, item.id) });
    }
  }
  return out;
}

export function visibleKeySet(visible: VisibleQuestion[]): Set<string> {
  return new Set(visible.map((v) => v.key));
}

/**
 * `imported` is deliberately not hideable: a prefilled suggestion behind a gate question the user
 * has not confirmed yet (e.g. last year's rental address behind "Did you own a rental?") would
 * otherwise be discarded on load. Imported values never count and never drive visibility, and the
 * intelligence layer only sees visible answers, so a waiting suggestion cannot affect anything.
 */
const HIDEABLE_STATES: readonly AnswerState[] = ['answered', 'not_sure', 'skipped'] as const;

/**
 * Rows to append so hidden-but-valued answers become `not_applicable_by_rule`.
 * The old row is kept (append-only); the new row carries the same value and source with
 * version + 1. Records for ids not in the bank are left alone, as are rows already n/a.
 */
export function hiddenAnswerUpdates(questions: readonly Question[], answers: AnswerView, visible: VisibleQuestion[]): AnswerRecord[] {
  const bankIds = new Set(questions.map((q) => q.id));
  const visibleKeys = visibleKeySet(visible);
  const updates: AnswerRecord[] = [];
  for (const rec of answers.records()) {
    if (!bankIds.has(rec.questionId)) continue;
    if (!HIDEABLE_STATES.includes(rec.state)) continue;
    if (visibleKeys.has(answerKey(rec.questionId, rec.repeaterItemId))) continue;
    updates.push({
      questionId: rec.questionId,
      repeaterItemId: rec.repeaterItemId,
      value: rec.value,
      state: 'not_applicable_by_rule',
      source: rec.source,
      version: rec.version + 1,
    });
  }
  return updates;
}
