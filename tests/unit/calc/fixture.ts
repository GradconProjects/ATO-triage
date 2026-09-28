import type { AnswerRecord, AnswerState, CaseContext, FY, OccupationTag, Question, RepeaterItem } from '@/src/engine/types';
import { AnswerView, answerKey } from '@/src/engine/answers';
import { validateRuleSet, type RuleSet } from '@/src/rules/schema';
import { calculate } from '@/src/calc/pipeline';
import type { CalcInput, Estimate, EstimateLine } from '@/src/calc/types';

const SRC = 'https://www.ato.gov.au/';
const KEYS = [
  'residentScale', 'foreignResidentScale', 'whmScale', 'lito', 'sapto', 'medicare', 'mls', 'phiRebate', 'carCentsPerKm',
  'wfhFixedRatePerHour', 'laundry', 'instantDeductionThreshold', 'concessionalCap', 'carryForwardTsbLimit', 'cgtDiscountRate',
  'studyLoan', 'lspiaMinimum', 'partYearThreshold',
];

/** 2024-25 values from the brief (WFH 67c on purpose: the fixture is independent of the real rule files). */
export const RULES: RuleSet = validateRuleSet({
  fy: '2024-25',
  version: '2024-25.9',
  verifiedOn: '2026-09-28',
  residentScale: [
    { from: 0, to: 18200, rate: 0, base: 0 },
    { from: 18201, to: 45000, rate: 0.16, base: 0 },
    { from: 45001, to: 135000, rate: 0.3, base: 4288 },
    { from: 135001, to: 190000, rate: 0.37, base: 31288 },
    { from: 190001, to: null, rate: 0.45, base: 51638 },
  ],
  foreignResidentScale: [
    { from: 0, to: 135000, rate: 0.3, base: 0 },
    { from: 135001, to: 190000, rate: 0.37, base: 40500 },
    { from: 190001, to: null, rate: 0.45, base: 60850 },
  ],
  whmScale: [
    { from: 0, to: 45000, rate: 0.15, base: 0 },
    { from: 45001, to: 135000, rate: 0.3, base: 6750 },
    { from: 135001, to: 190000, rate: 0.37, base: 33750 },
    { from: 190001, to: null, rate: 0.45, base: 54100 },
  ],
  lito: { max: 700, taper1: { from: 37500, to: 45000, rate: 0.05 }, taper2: { from: 45000, to: 66667, rate: 0.015 } },
  sapto: { single: { maxOffset: 2230, shadeOutFrom: 34919, cutOut: 52759 }, coupleEach: { maxOffset: 1602, shadeOutFrom: 30994, cutOut: 43810 }, taperRate: 0.125 },
  medicare: {
    rate: 0.02,
    phaseInRate: 0.1,
    lowIncome: {
      single: { lower: 27222, upper: 34027 },
      family: { lower: 45907, upper: 57383 },
      sapto: { lower: 43020, upper: 53775 },
      saptoFamily: { lower: 59886, upper: 74857 },
      familyChildIncrement: 4216,
    },
  },
  mls: {
    tiers: [
      { tier: 0, singleTo: 97000, familyTo: 194000, rate: 0 },
      { tier: 1, singleTo: 113000, familyTo: 226000, rate: 0.01 },
      { tier: 2, singleTo: 151000, familyTo: 302000, rate: 0.0125 },
      { tier: 3, singleTo: null, familyTo: null, rate: 0.015 },
    ],
    familyChildIncrement: 1500,
  },
  phiRebate: [
    { tier: 0, under65: 24.608, age65to69: 28.71, age70plus: 32.812, under65Apr: 24.288, age65to69Apr: 28.337, age70plusApr: 32.385 },
    { tier: 1, under65: 16.405, age65to69: 20.507, age70plus: 24.608, under65Apr: 16.192, age65to69Apr: 20.24, age70plusApr: 24.288 },
    { tier: 2, under65: 8.202, age65to69: 12.303, age70plus: 16.405, under65Apr: 8.095, age65to69Apr: 12.143, age70plusApr: 16.192 },
    { tier: 3, under65: 0, age65to69: 0, age70plus: 0, under65Apr: 0, age65to69Apr: 0, age70plusApr: 0 },
  ],
  carCentsPerKm: 88,
  carMaxKm: 5000,
  wfhFixedRatePerHour: 67,
  laundry: { perLoadWorkOnly: 100, perLoadMixed: 50, noEvidenceCap: 15000 },
  instantDeductionThreshold: 300,
  concessionalCap: 30000,
  carryForwardTsbLimit: 500000,
  cgtDiscountRate: 0.5,
  studyLoan: {
    method: 'total_income_rate',
    bands: [
      { from: 0, to: 54434, rate: 0 },
      { from: 54435, to: 62850, rate: 0.01 },
      { from: 62851, to: 66620, rate: 0.02 },
      { from: 66621, to: 70618, rate: 0.025 },
      { from: 70619, to: 74855, rate: 0.03 },
      { from: 74856, to: 79346, rate: 0.035 },
      { from: 79347, to: 84107, rate: 0.04 },
      { from: 84108, to: 89154, rate: 0.045 },
      { from: 89155, to: 94503, rate: 0.05 },
      { from: 94504, to: 100174, rate: 0.055 },
      { from: 100175, to: 106185, rate: 0.06 },
      { from: 106186, to: 112556, rate: 0.065 },
      { from: 112557, to: 119309, rate: 0.07 },
      { from: 119310, to: 126467, rate: 0.075 },
      { from: 126468, to: 134056, rate: 0.08 },
      { from: 134057, to: 142100, rate: 0.085 },
      { from: 142101, to: 150626, rate: 0.09 },
      { from: 150627, to: 159663, rate: 0.095 },
      { from: 159664, to: null, rate: 0.1 },
    ],
  },
  lspiaMinimum: 1200,
  partYearThreshold: { base: 13464, perMonth: 395 },
  sources: KEYS.map((key) => ({ key, url: SRC })),
});

/** A marginal (2025-26 style) study loan table for the marginal-method tests. */
export const MARGINAL_LOAN: RuleSet['studyLoan'] = {
  method: 'marginal',
  bands: [
    { from: 0, to: 67000, rate: 0, base: 0 },
    { from: 67001, to: 125000, rate: 0.15, base: 0 },
    { from: 125001, to: 179285, rate: 0.17, base: 8700 },
    { from: 179286, to: null, rate: 0.1, base: 0, wholeIncome: true },
  ],
};

export interface A {
  id: string;
  value: unknown;
  item?: string | null;
  state?: AnswerState;
}

/** Shorthand answer. */
export const a = (id: string, value: unknown, item?: string | null): A => ({ id, value, item: item ?? null });
/** A "not sure" answer (value + state as the renderer sets them). */
export const notSure = (id: string, item?: string | null, multi = false): A => ({ id, value: multi ? ['not_sure'] : 'not_sure', item: item ?? null, state: 'not_sure' });
export const item = (id: string, groupId: string, sortOrder = 0): RepeaterItem => ({ id, groupId, sortOrder });

export function q(partial: Partial<Question> & { id: string }): Question {
  return { module: 'deductions', type: 'money', prompt: `Prompt for ${partial.id}?`, required: true, ...partial };
}

export interface MkOptions {
  items?: RepeaterItem[];
  questions?: Question[];
  fy?: FY;
  rules?: RuleSet;
  /** Visible keys; defaults to every answered key. */
  visible?: Set<string>;
  hide?: string[];
  exclude?: Set<string>;
  rulesFor?: (fy: string) => RuleSet | undefined;
  tags?: OccupationTag[];
}

export function mkInput(answers: A[], opts: MkOptions = {}): CalcInput {
  const records: AnswerRecord[] = answers.map((x, i) => ({
    questionId: x.id,
    repeaterItemId: x.item ?? null,
    value: x.value,
    state: x.state ?? 'answered',
    source: 'user',
    version: i + 1,
  }));
  const view = new AnswerView(records, opts.items ?? []);
  const visible = opts.visible ?? new Set(records.map((r) => answerKey(r.questionId, r.repeaterItemId)));
  for (const h of opts.hide ?? []) visible.delete(h);
  const ctx: CaseContext = { fy: opts.fy ?? '2024-25', profileOccupations: [] };
  const input: CalcInput = {
    answers: view,
    rules: opts.rules ?? RULES,
    questions: opts.questions ?? [],
    ctx,
    activeTags: new Set(opts.tags ?? []),
    visible,
  };
  if (opts.exclude) input.excludeInputs = opts.exclude;
  if (opts.rulesFor) input.rulesFor = opts.rulesFor;
  return input;
}

export function run(answers: A[], opts: MkOptions = {}): Estimate {
  return calculate(mkInput(answers, opts));
}

export function lineById(est: Estimate, id: string): EstimateLine {
  const l = est.lines.find((x) => x.id === id);
  if (!l) throw new Error(`No line ${id}; have ${est.lines.map((x) => x.id).join(', ')}`);
  return l;
}

export function maybeLine(est: Estimate, id: string): EstimateLine | undefined {
  return est.lines.find((x) => x.id === id);
}

export const c = (dollars: number): number => Math.round(dollars * 100);
