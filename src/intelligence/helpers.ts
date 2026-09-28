/**
 * Shared read-only helpers for flag rules. Nothing here mutates answers or the estimate.
 */
import { AnswerView, answerKey } from '../engine/answers';
import type { Question, RepeaterItem } from '../engine/types';
import type { Estimate, EstimateLine } from '../calc/types';
import { formatCents } from '../calc/money';
import type { FlagInstance, FlagRule, IntelligenceContext } from './types';

export { answerKey, formatCents };

/** An AnswerView holding only the records of visible questions (all states). Empty `visible` = everything. */
export function visibleAnswers(answers: AnswerView, visible: Set<string>): AnswerView {
  if (visible.size === 0) return answers;
  const records = answers.records().filter((r) => visible.has(answerKey(r.questionId, r.repeaterItemId)));
  return new AnswerView(records, answers.allItems());
}

export function questionById(ctx: IntelligenceContext, id: string): Question | undefined {
  return ctx.questions.find((q) => q.id === id);
}

export function promptOf(ctx: IntelligenceContext, id: string): string {
  return questionById(ctx, id)?.prompt ?? id;
}

/** Item ids a question is asked for: one per repeater item, or [null] for a case-level question. */
export function instancesOf(a: AnswerView, q: Question): Array<string | null> {
  if (q.repeaterGroup) return a.items(q.repeaterGroup).map((it) => it.id);
  return [null];
}

export function items(a: AnswerView, groupId: string): RepeaterItem[] {
  return a.items(groupId);
}

/** Sum of answered cents for a question across every item of a group. */
export function sumOverItems(a: AnswerView, questionId: string, groupId: string): number {
  let total = 0;
  for (const it of a.items(groupId)) total += a.cents(questionId, it.id) ?? 0;
  return total;
}

export function computedLines(estimate: Estimate, section?: EstimateLine['section']): EstimateLine[] {
  return estimate.lines.filter((l) => l.status === 'computed' && !l.informational && (section === undefined || l.section === section));
}

/** True when a computed deductions line with one of these categories carries a positive amount. */
export function hasComputedDeduction(estimate: Estimate, categories: readonly string[]): boolean {
  return computedLines(estimate, 'deductions').some((l) => l.category !== undefined && categories.includes(l.category) && l.amountCents > 0);
}

export function salaryCents(estimate: Estimate): number {
  return computedLines(estimate, 'income')
    .filter((l) => l.category === 'salary')
    .reduce((sum, l) => sum + l.amountCents, 0);
}

/** Deduction categories that are not "work-related" for the ratio check. */
export const NON_WORK_DEDUCTION_CATEGORIES: readonly string[] = [
  'gifts_donations',
  'tax_affairs',
  'income_protection',
  'personal_super',
  'investment',
  'rental',
] as const;

export function workRelatedDeductionsCents(estimate: Estimate): number {
  const fromTotals = estimate.totals?.workRelatedDeductionsCents;
  if (typeof fromTotals === 'number' && Number.isFinite(fromTotals)) return fromTotals;
  return computedLines(estimate, 'deductions')
    .filter((l) => l.category === undefined || !NON_WORK_DEDUCTION_CATEGORIES.includes(l.category))
    .reduce((sum, l) => sum + l.amountCents, 0);
}

/** Registry occupation ids in play: profile occupations plus every employer's occupation answer. */
export function occupationIds(ctx: IntelligenceContext, groupId: string, occupationQuestionId: string): string[] {
  const ids = new Set<string>(ctx.ctx.profileOccupations);
  for (const it of ctx.answers.items(groupId)) {
    const v = ctx.answers.string(occupationQuestionId, it.id);
    if (v) ids.add(v);
  }
  return [...ids];
}

/** "a refund of $1,234.00" / "a tax debt of $1,234.00" / "no refund or debt". */
export function describeResult(cents: number): string {
  if (cents > 0) return `a refund of ${formatCents(cents)}`;
  if (cents < 0) return `a tax debt of ${formatCents(-cents)}`;
  return 'no refund or debt';
}

export function pctText(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

/** Build a rule that fires once per instance; `when`/`message` are derived so Section 9's shape still holds. */
export function perInstance(
  rule: Omit<FlagRule, 'when' | 'message' | 'questionIds' | 'instances'> & { questionIds?: string[] },
  instances: (a: AnswerView, ctx: IntelligenceContext) => FlagInstance[],
): FlagRule {
  return {
    ...rule,
    questionIds: rule.questionIds ?? [],
    instances,
    when: (a, ctx) => instances(a, ctx).length > 0,
    message: (a, ctx) => instances(a, ctx)[0]?.message ?? '',
  };
}
