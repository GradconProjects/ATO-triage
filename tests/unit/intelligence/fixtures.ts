import type { AnswerRecord, AnswerState, CaseContext, OccupationTag, Question, RepeaterItem } from '@/src/engine/types';
import { AnswerView, answerKey } from '@/src/engine/answers';
import type { Estimate, EstimateLine, EstimateTotals, ManualReviewItem } from '@/src/calc/types';
import { getRuleSet } from '@/src/rules';
import { evaluateFlags, FLAG_RULES } from '@/src/intelligence/flags';
import { visibleAnswers, NON_WORK_DEDUCTION_CATEGORIES } from '@/src/intelligence/helpers';
import type { Flag, FlagRule, IntelligenceContext } from '@/src/intelligence/types';
import type { IntelligenceInput } from '@/src/intelligence';

export const RULES = getRuleSet('2025-26');

export function q(partial: Partial<Question> & { id: string }): Question {
  return { module: 'deductions', type: 'money', prompt: `Prompt for ${partial.id}?`, required: true, ...partial };
}

export function rec(
  questionId: string,
  value: unknown,
  opts: { item?: string | null; state?: AnswerState; version?: number; source?: AnswerRecord['source'] } = {},
): AnswerRecord {
  return { questionId, repeaterItemId: opts.item ?? null, value, state: opts.state ?? 'answered', source: opts.source ?? 'user', version: opts.version ?? 1 };
}

export function notSure(questionId: string, item: string | null = null, multi = false): AnswerRecord {
  return rec(questionId, multi ? ['not_sure'] : 'not_sure', { item, state: 'not_sure' });
}

export function item(id: string, groupId: string, sortOrder = 0): RepeaterItem {
  return { id, groupId, sortOrder, label: null };
}

export function ctx(over: Partial<CaseContext> = {}): CaseContext {
  return { fy: '2025-26', profileOccupations: [], ...over };
}

export function line(partial: Partial<EstimateLine> & { id: string; amountCents: number }): EstimateLine {
  return { section: 'deductions', label: partial.id, ruleId: 'test', inputs: [], formula: 'test', status: 'computed', ...partial };
}

export function salaryLine(cents: number, itemId = 'e1'): EstimateLine {
  return line({ id: `emp.gross@${itemId}`, section: 'income', category: 'salary', amountCents: cents, itemId });
}

export function dedLine(category: string, cents: number, id = `ded.${category}`): EstimateLine {
  return line({ id, section: 'deductions', category, amountCents: cents });
}

export interface EstimateOpts {
  lines?: EstimateLine[];
  totals?: Partial<EstimateTotals>;
  manualReview?: ManualReviewItem[];
  uncertainInputs?: string[];
  range?: Estimate['range'];
}

export function estimate(opts: EstimateOpts = {}): Estimate {
  const lines = opts.lines ?? [];
  const work = lines
    .filter((l) => l.section === 'deductions' && l.status === 'computed' && !l.informational && (l.category === undefined || !NON_WORK_DEDUCTION_CATEGORIES.includes(l.category)))
    .reduce((s, l) => s + l.amountCents, 0);
  const totals: EstimateTotals = {
    assessableIncomeCents: 0,
    deductionsCents: 0,
    taxableIncomeCents: 0,
    grossTaxCents: 0,
    offsetsCents: 0,
    taxAfterOffsetsCents: 0,
    medicareLevyCents: 0,
    mlsCents: 0,
    studyLoanCents: 0,
    creditsCents: 0,
    resultCents: 0,
    carriedForwardLossCents: 0,
    capitalLossCarriedForwardCents: 0,
    workRelatedDeductionsCents: work,
    phiLiabilityCents: 0,
    ...opts.totals,
  };
  const e: Estimate = {
    fy: '2025-26',
    ruleSetVersion: RULES.version,
    lines,
    totals,
    manualReview: opts.manualReview ?? [],
    assumptions: [],
    uncertainInputs: opts.uncertainInputs ?? [],
    moduleStatus: {},
  };
  if (opts.range) e.range = opts.range;
  return e;
}

export interface BuildOpts {
  records?: AnswerRecord[];
  items?: RepeaterItem[];
  questions?: Question[];
  estimate?: Estimate;
  tags?: OccupationTag[];
  ctx?: Partial<CaseContext>;
  /** Override the visible set; default = every record key + every case-level question id + child ids per item. */
  visible?: Set<string>;
}

export function defaultVisible(records: AnswerRecord[], questions: readonly Question[], items: RepeaterItem[]): Set<string> {
  const v = new Set<string>();
  for (const r of records) v.add(answerKey(r.questionId, r.repeaterItemId));
  for (const qu of questions) {
    if (qu.repeaterGroup) {
      for (const it of items.filter((i) => i.groupId === qu.repeaterGroup)) v.add(answerKey(qu.id, it.id));
    } else v.add(qu.id);
  }
  return v;
}

export function build(opts: BuildOpts = {}): { input: IntelligenceInput; estimate: Estimate } {
  const records = opts.records ?? [];
  const items = opts.items ?? [];
  const questions = opts.questions ?? [];
  const input: IntelligenceInput = {
    answers: new AnswerView(records, items),
    rules: RULES,
    questions,
    ctx: ctx(opts.ctx),
    activeTags: new Set<OccupationTag>(opts.tags ?? []),
    visible: opts.visible ?? defaultVisible(records, questions, items),
  };
  return { input, estimate: opts.estimate ?? estimate() };
}

export function contextOf(opts: BuildOpts = {}): IntelligenceContext {
  const { input, estimate: est } = build(opts);
  return {
    answers: visibleAnswers(input.answers, input.visible),
    estimate: est,
    visible: input.visible,
    activeTags: input.activeTags,
    questions: input.questions,
    ctx: input.ctx,
    rules: input.rules,
  };
}

export function flagsFor(opts: BuildOpts = {}, rules: FlagRule[] = FLAG_RULES): Flag[] {
  return evaluateFlags(contextOf(opts), rules);
}

export function codes(flags: Flag[]): string[] {
  return flags.map((f) => f.code);
}

export function only(flags: Flag[], code: string): Flag[] {
  return flags.filter((f) => f.code === code);
}
