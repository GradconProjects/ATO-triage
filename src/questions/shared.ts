/**
 * Shared builders for the question bank.
 *
 * Every helper returns plain data (`Question` objects). Nothing here can set a value on the
 * user's behalf: there is no defaultValue anywhere, and `showIf` only decides visibility.
 *
 * Conventions enforced by these helpers (and by the lint test):
 * - `single` / `multi` always end with a `not_sure` option (exclusive for multi).
 * - `screening` builds a multi with `other` + `none` (exclusive) + `not_sure` (exclusive) and a
 *   `${id}.other_text` follow-up shown when `other` is ticked.
 * - `yes_no_unsure` questions carry NO options; the renderer supplies Yes / No / Not sure.
 * - Deduction amounts are wired through `deductionSet`, which emits the three factual tests in the
 *   fixed order: (1) paid / reimbursed, (2) purpose, (3) work % and evidence.
 */
import type { Condition, DeductionCategory, ModuleId, OccupationTag, Option, Question, Treatment, TreatmentByAnswer } from '../engine/types';
import { EVIDENCE_OPTIONS, PAID_OPTIONS } from './ids';

/** Fields a caller may add to any helper-built question. */
export type Extra = Partial<Omit<Question, 'id' | 'module' | 'type' | 'prompt' | 'options'>>;

// ---------------------------------------------------------------------------
// ATO reference URLs (canonical deduction and occupation guide pages)
// ---------------------------------------------------------------------------
const ATO_BASE = 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records';
const DED = `${ATO_BASE}/deductions-you-can-claim`;
export const ATO = {
  deductions: DED,
  compensationCosts: 'https://www.ato.gov.au/law/view/document?docid=AID/AID2010209',
  records: `${ATO_BASE}/records-you-need-to-keep`,
  car: `${DED}/cars-transport-and-travel/motor-vehicle-and-car-expenses`,
  travel: `${DED}/cars-transport-and-travel/trips-you-can-and-cant-claim`,
  overnight: `${DED}/cars-transport-and-travel/travel-expenses`,
  clothing: `${DED}/clothing-jewellery-and-grooming/work-clothing-and-uniforms`,
  laundry: `${DED}/clothing-jewellery-and-grooming/laundry-and-dry-cleaning`,
  tools: `${DED}/tools-computers-and-items-you-use-for-work`,
  wfh: `${DED}/working-from-home-expenses`,
  phone: `${DED}/tools-computers-and-items-you-use-for-work/phone-data-and-internet-expenses`,
  selfEd: `${DED}/education-training-and-seminars/self-education-expenses`,
  seminars: `${DED}/education-training-and-seminars/seminars-conferences-and-training-courses`,
  union: `${DED}/memberships-accreditations-fees-and-commissions/union-fees-subscriptions-to-associations-and-bargaining-agents-fees`,
  licences: `${DED}/memberships-accreditations-fees-and-commissions/occupational-licences-and-registrations`,
  subscriptions: `${DED}/memberships-accreditations-fees-and-commissions/subscriptions-and-professional-publications`,
  sun: `${DED}/clothing-jewellery-and-grooming/protective-items-equipment-and-products`,
  firstAid: `${DED}/education-training-and-seminars/first-aid-courses`,
  checks: `${DED}/memberships-accreditations-fees-and-commissions/working-with-children-checks-and-police-checks`,
  vaccinations: `${DED}/health-and-wellbeing/medical-examinations-and-vaccinations`,
  meals: `${DED}/meals-entertainment-and-functions/overtime-meal-expenses`,
  taxAffairs: `${DED}/cost-of-managing-tax-affairs`,
  gifts: `${DED}/gifts-and-donations`,
  incomeProtection: `${DED}/insurance-premiums/income-protection-insurance`,
  investment: `${DED}/interest-dividend-and-other-investment-income-deductions`,
  personalSuper: `${DED}/personal-super-contributions`,
  rental: `${ATO_BASE}/investments-and-assets/residential-rental-properties/rental-expenses-you-can-claim`,
  dsw: `${DED}/occupation-and-industry-specific-guides/c/community-support-workers-and-direct-carers-income-and-work-related-deductions`,
  construction: `${DED}/occupation-and-industry-specific-guides/b/building-and-construction-employees-income-and-work-related-deductions`,
  chef: `${DED}/occupation-and-industry-specific-guides/h/hospitality-industry-employees-income-and-work-related-deductions`,
  fifo: `${DED}/cars-transport-and-travel/fly-in-fly-out-and-drive-in-drive-out-workers`,
} as const;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------
export function notSure(): Option {
  return { value: 'not_sure', label: 'Not sure', exclusive: true, help: 'Pick this if you do not know. We will list it for you to check later; it is never treated as "No".' };
}
export function noneOption(label = 'None of these'): Option {
  return { value: 'none', label, exclusive: true };
}
export function otherOption(label = 'Other / not listed'): Option {
  return { value: 'other', label, help: 'Something that is not in the list. You can describe it in the next box.' };
}
export function opt(value: string, label: string, help?: string): Option {
  return help ? { value, label, help } : { value, label };
}
function withNotSure(options: Option[]): Option[] {
  return options.some((o) => o.value === 'not_sure') ? options : [...options, notSure()];
}

// ---------------------------------------------------------------------------
// Condition helpers
// ---------------------------------------------------------------------------
export const eq = (q: string, value: string): Condition => ({ q, eq: value });
export const isIn = (q: string, values: string[]): Condition => ({ q, in: values });
export const includes = (q: string, value: string): Condition => ({ q, includes: value });
export const gt = (q: string, value: number): Condition => ({ q, gt: value });
export const answered = (q: string): Condition => ({ q, answered: true });
export const yes = (q: string): Condition => ({ q, eq: 'yes' });
export const occ = (tag: OccupationTag): Condition => ({ occupation: tag });
export const all = (...c: Condition[]): Condition => ({ all: c });
export const any = (...c: Condition[]): Condition => ({ any: c });
export const not = (c: Condition): Condition => ({ not: c });
/** True when the multi question includes any of the listed values. */
export const includesAny = (q: string, values: string[]): Condition => any(...values.map((v) => includes(q, v)));
/** Combine an optional outer condition with an inner one. */
export function and(outer: Condition | undefined, inner: Condition): Condition {
  return outer ? all(outer, inner) : inner;
}

// ---------------------------------------------------------------------------
// Question builders
// ---------------------------------------------------------------------------
function base(id: string, module: ModuleId, type: Question['type'], prompt: string, extra?: Extra): Question {
  const { required, ...rest } = extra ?? {};
  return { id, module, type, prompt, required: required ?? true, ...rest };
}

export function yesNoUnsure(id: string, module: ModuleId, prompt: string, extra?: Extra): Question {
  return base(id, module, 'yes_no_unsure', prompt, extra);
}

/** Single choice. Appends `not_sure` unless already present. */
export function single(id: string, module: ModuleId, prompt: string, options: Option[], extra?: Extra): Question {
  return { ...base(id, module, 'single', prompt, extra), options: withNotSure(options).map(stripExclusive) };
}
/** `exclusive` only has meaning on multi questions (lint rule 14). */
function stripExclusive(o: Option): Option {
  if (!o.exclusive) return o;
  const rest: Option = { ...o };
  delete rest.exclusive;
  return rest;
}

/** Single choice WITHOUT an automatic `not_sure` (only for allow-listed ids such as core.fy). */
export function singleAllowListed(id: string, module: ModuleId, prompt: string, options: Option[], extra?: Extra): Question {
  return { ...base(id, module, 'single', prompt, extra), options: options.map(stripExclusive) };
}

/** Multi choice. Appends an exclusive `not_sure` unless already present. */
export function multi(id: string, module: ModuleId, prompt: string, options: Option[], extra?: Extra): Question {
  return { ...base(id, module, 'multi', prompt, extra), options: withNotSure(options) };
}

/** Multi choice for an allow-listed id (gate.checks): no automatic not_sure. */
export function multiAllowListed(id: string, module: ModuleId, prompt: string, options: Option[], extra?: Extra): Question {
  return { ...base(id, module, 'multi', prompt, extra), options };
}

/**
 * Screening multi: `other` + `none` (exclusive) + `not_sure` (exclusive) and the `${id}.other_text`
 * follow-up. Returns [multi, otherText].
 */
export function screening(id: string, module: ModuleId, prompt: string, options: Option[], extra?: Extra, noneLabel = 'None of these'): Question[] {
  const q = multi(id, module, prompt, [...options, otherOption(), noneOption(noneLabel)], { ...extra, screening: true, required: true });
  return [q, otherText(id, module, { occupationTags: extra?.occupationTags, repeaterGroup: extra?.repeaterGroup, atoRef: extra?.atoRef })];
}

export interface OtherTextOpts {
  occupationTags?: OccupationTag[];
  repeaterGroup?: string;
  prompt?: string;
  atoRef?: string;
}

/** Follow-up text for an `other` option: `${parentId}.other_text`, shown when `other` is ticked. */
export function otherText(parentId: string, module: ModuleId, opts: OtherTextOpts = {}): Question {
  const q: Question = {
    id: `${parentId}.other_text`, module, type: 'text', prompt: opts.prompt ?? 'Please describe the "other" item', required: false,
    showIf: includes(parentId, 'other'), validation: [{ kind: 'maxLength', value: 500 }],
  };
  if (opts.occupationTags) q.occupationTags = opts.occupationTags;
  if (opts.repeaterGroup) q.repeaterGroup = opts.repeaterGroup;
  if (opts.atoRef) q.atoRef = opts.atoRef;
  return q;
}

export function money(id: string, module: ModuleId, prompt: string, extra?: Extra): Question {
  return base(id, module, 'money', prompt, extra);
}
export function num(id: string, module: ModuleId, prompt: string, extra?: Extra): Question {
  return base(id, module, 'number', prompt, extra);
}
export function percent(id: string, module: ModuleId, prompt: string, extra?: Extra): Question {
  return base(id, module, 'percent', prompt, { validation: [{ kind: 'min', value: 0 }, { kind: 'max', value: 100 }], ...extra });
}
export function km(id: string, module: ModuleId, prompt: string, extra?: Extra): Question {
  return base(id, module, 'km', prompt, extra);
}
export function date(id: string, module: ModuleId, prompt: string, extra?: Extra): Question {
  return base(id, module, 'date', prompt, extra);
}
export function dateRange(id: string, module: ModuleId, prompt: string, extra?: Extra): Question {
  return base(id, module, 'date_range', prompt, extra);
}
export function text(id: string, module: ModuleId, prompt: string, extra?: Extra): Question {
  return base(id, module, 'text', prompt, { required: false, validation: [{ kind: 'maxLength', value: 500 }], ...extra });
}
export function repeater(id: string, module: ModuleId, prompt: string, spec: NonNullable<Question['repeater']>, extra?: Extra): Question {
  return { ...base(id, module, 'repeater', prompt, { required: spec.minItems > 0, ...extra }), repeater: spec };
}

// ---------------------------------------------------------------------------
// Deduction sibling questions (DeductionMeta.base convention)
// ---------------------------------------------------------------------------
export const PAID_LABELS: Option[] = [
  { value: PAID_OPTIONS.paidNotReimbursed, label: 'I paid for it myself and nobody paid me back', help: 'The money came out of your own pocket and you did not get it back from your employer or anyone else.' },
  { value: PAID_OPTIONS.paidFullyReimbursed, label: 'I paid for it, then my employer paid me back the full amount', help: 'For example you bought it and claimed the whole cost back on an expense form.' },
  { value: PAID_OPTIONS.paidPartlyReimbursed, label: 'I paid for it, then my employer paid me back part of the cost', help: 'You got some money back but not all of it. We will ask how much you got back.' },
  { value: PAID_OPTIONS.employerPaid, label: 'My employer paid for it directly, or supplied it to me', help: 'You never paid for it yourself: your employer bought it, gave it to you, or paid the bill.' },
];

export function paidQuestion(base: string, module: ModuleId, extra?: Extra & { prompt?: string }): Question {
  const { prompt, ...rest } = extra ?? {};
  return single(`${base}.paid`, module, prompt ?? 'Did you pay for this yourself?', PAID_LABELS, {
    help: 'Only costs you paid yourself, and were not paid back for, can count. This is the first thing the ATO checks.',
    ...rest,
  });
}

/** Shown only when partly reimbursed. */
export function reimbursedAmountQuestion(base: string, module: ModuleId, extra?: Extra): Question {
  return money(`${base}.reimbursed_amount`, module, 'How much did you get paid back?', {
    help: 'Enter the amount your employer or someone else paid back to you. Only the part you did not get back can count.',
    feeds: ['deductions'],
    ...extra,
    showIf: and(extra?.showIf, eq(`${base}.paid`, PAID_OPTIONS.paidPartlyReimbursed)),
  });
}

export const WORK_PCT_METHOD_OPTIONS: Option[] = [
  { value: 'logbook', label: 'A logbook I kept', help: 'A written or app record of each work trip or use over a set period.' },
  { value: 'diary', label: 'A diary kept for at least 4 weeks', help: 'A diary showing work use for a typical 4-week period, then applied to the whole year.' },
  { value: 'itemised', label: 'Itemised bills showing the work items', help: 'For example a phone bill that lists each call, so you can mark the work ones.' },
  { value: 'estimate', label: 'My best guess, no written record', help: 'You did not keep a record. The ATO may not accept an estimate, so we flag this for review.' },
];

/** Returns [`${base}.work_pct`, `${base}.work_pct_method`]. */
export function workPctQuestion(base: string, module: ModuleId, extra?: Extra & { prompt?: string }): Question[] {
  const { prompt, ...rest } = extra ?? {};
  return [
    percent(`${base}.work_pct`, module, prompt ?? 'What percentage of the use was for work?', {
      help: 'Only the work part can count. For example, if half your use was for work, enter 50.',
      feeds: ['deductions'],
      ...rest,
    }),
    single(`${base}.work_pct_method`, module, 'How did you work out that work percentage?', WORK_PCT_METHOD_OPTIONS, {
      help: 'A work percentage needs something behind it: a logbook, a diary, or itemised bills. A guess is flagged for review.',
      ...rest,
    }),
  ];
}

export const EVIDENCE_LABELS: Option[] = [
  { value: EVIDENCE_OPTIONS.receipts, label: 'Receipts or invoices', help: 'Paper or digital receipts that show what you bought, when, and how much you paid.' },
  { value: EVIDENCE_OPTIONS.bankStatements, label: 'Bank or card statements only', help: 'Statements show the payment but not always what it was for. The ATO may ask for more.' },
  { value: EVIDENCE_OPTIONS.logbook, label: 'A logbook', help: 'A record of each trip or use, usually for car or equipment claims.' },
  { value: EVIDENCE_OPTIONS.diary, label: 'A diary or written record', help: 'Notes you kept at the time showing the work use or hours.' },
  { value: EVIDENCE_OPTIONS.estimateOnly, label: 'An estimate only, no records', help: 'You do not have records. Claims without records are at risk if the ATO asks.' },
  { value: EVIDENCE_OPTIONS.none, label: 'No records at all', help: 'You have nothing that shows the cost. We will flag this so you can look for records before lodging.' },
];

export function evidenceQuestion(base: string, module: ModuleId, extra?: Extra & { prompt?: string }): Question {
  const { prompt, ...rest } = extra ?? {};
  return single(`${base}.evidence`, module, prompt ?? 'What records do you have for this cost?', EVIDENCE_LABELS, {
    help: 'The ATO can ask you to show records for any claim. Telling us what you hold lets the report warn you where a claim is at risk.',
    ...rest,
  });
}

/** Optional link from a deduction item to the job it relates to (Section 5). */
export function jobQuestion(base: string, module: ModuleId, extra?: Extra): Question {
  return text(`${base}.job`, module, 'Which employer does this cost relate to?', {
    help: 'Deductions attach to the job that produced the income. Type the employer name as you entered it earlier.',
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// Full deduction set: (1) paid / reimbursed, (2) purpose, (3) amount, work % and evidence
// ---------------------------------------------------------------------------
export interface DeductionSpec {
  base: string;
  module: ModuleId;
  /** Id of the money question. Defaults to `${base}.amount`. */
  amountId?: string;
  prompt: string;
  help?: string;
  category: DeductionCategory;
  treatment: Treatment | TreatmentByAnswer;
  capitalThreshold?: boolean;
  matchesAllowance?: string[];
  atoRef: string;
  showIf?: Condition;
  occupationTags?: OccupationTag[];
  repeaterGroup?: string;
  /** Purpose questions asked between the paid test and the amount (step 2). */
  purpose?: Question[];
  /** Ask `${base}.work_pct` + method (only where private use is plausible). */
  workPct?: boolean;
  workPctPrompt?: string;
  /** Ask `${base}.date` (date first used / paid). */
  askDate?: boolean;
  /** Ask `${base}.job`. */
  askJob?: boolean;
  paidPrompt?: string;
  feeds?: string[];
  validation?: Question['validation'];
}

export function deductionSet(spec: DeductionSpec): Question[] {
  const common: Extra = {};
  if (spec.showIf) common.showIf = spec.showIf;
  if (spec.occupationTags) common.occupationTags = spec.occupationTags;
  if (spec.repeaterGroup) common.repeaterGroup = spec.repeaterGroup;
  common.atoRef = spec.atoRef;

  const amount = money(spec.amountId ?? `${spec.base}.amount`, spec.module, spec.prompt, {
    ...common,
    help: spec.help ?? 'Enter the total you paid this financial year, before any work-use percentage. We apply the work percentage for you.',
    feeds: spec.feeds ?? ['deductions'],
    validation: spec.validation ?? [{ kind: 'min', value: 0 }],
    deduction: {
      category: spec.category,
      base: spec.base,
      treatment: spec.treatment,
      ...(spec.capitalThreshold ? { capitalThreshold: true } : {}),
      ...(spec.matchesAllowance ? { matchesAllowance: spec.matchesAllowance } : {}),
    },
  });

  const out: Question[] = [
    paidQuestion(spec.base, spec.module, { ...common, ...(spec.paidPrompt ? { prompt: spec.paidPrompt } : {}) }),
    reimbursedAmountQuestion(spec.base, spec.module, common),
    ...(spec.purpose ?? []).map((q) => {
      const merged: Question = { ...common, ...q };
      const cond = q.showIf ? and(spec.showIf, q.showIf) : spec.showIf;
      if (cond) merged.showIf = cond;
      else delete merged.showIf;
      return merged;
    }),
    amount,
  ];
  if (spec.askDate) {
    out.push(
      date(`${spec.base}.date`, spec.module, 'When did you buy it, or first use it for work?', {
        ...common,
        help: 'Items costing $300 or more are claimed over several years, starting from this date.',
        feeds: ['deductions'],
      }),
    );
  }
  if (spec.workPct) out.push(...workPctQuestion(spec.base, spec.module, { ...common, ...(spec.workPctPrompt ? { prompt: spec.workPctPrompt } : {}) }));
  out.push(evidenceQuestion(spec.base, spec.module, common));
  if (spec.askJob) out.push(jobQuestion(spec.base, spec.module, common));
  return out;
}

/** Sort helper used by index.ts: keeps file order inside a module. */
export function flatten(...groups: (Question | Question[])[]): Question[] {
  return groups.flatMap((g) => (Array.isArray(g) ? g : [g]));
}
