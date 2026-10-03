/**
 * Question engine types. Pure TypeScript, no framework imports.
 *
 * The question bank is data: every question is one of these objects and a single
 * generic renderer draws any of them. Nothing here can ever WRITE an answer on the
 * user's behalf: `showIf` only decides whether a question appears.
 */

export type FY = '2023-24' | '2024-25' | '2025-26' | '2026-27';
export const FINANCIAL_YEARS: readonly FY[] = ['2023-24', '2024-25', '2025-26', '2026-27'] as const;

export type QuestionType =
  | 'single'        // one option
  | 'multi'         // several options; exclusive options clear the rest
  | 'yes_no_unsure' // Yes / No / Not sure (always all three)
  | 'money'         // integer cents, >= 0 unless allowNegative
  | 'number'
  | 'percent'
  | 'km'
  | 'date'          // 'YYYY-MM-DD'
  | 'date_range'    // { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
  | 'text'
  | 'repeater';     // a group asked once per item (employers, properties...)

export type ModuleId =
  | 'core'
  | 'residency'
  | 'family'
  | 'employment'
  | 'allowances'
  | 'compensation'
  | 'government'
  | 'super_income'
  | 'investments'
  | 'rental'
  | 'cgt'
  | 'foreign'
  | 'business'
  | 'deductions'
  | 'super_contributions'
  | 'offsets'
  | 'deep_dsw'
  | 'deep_construction'
  | 'deep_chef';

/** Fixed interview order (Section 6). Deep modules render inside the deductions step. */
export const MODULE_ORDER: readonly ModuleId[] = [
  'core',
  'residency',
  'family',
  'employment',
  'allowances',
  'compensation',
  'government',
  'super_income',
  'investments',
  'rental',
  'cgt',
  'foreign',
  'business',
  'deep_dsw',
  'deep_construction',
  'deep_chef',
  'deductions',
  'super_contributions',
  'offsets',
] as const;

export const MODULE_LABELS: Record<ModuleId, string> = {
  core: 'Tax year and purpose',
  residency: 'Residency',
  family: 'Family, Medicare and private health',
  employment: 'Employment and payers',
  allowances: 'Allowances and reimbursements',
  compensation: 'WorkCover, compensation and termination',
  government: 'Government payments and pensions',
  super_income: 'Super income',
  investments: 'Investments',
  rental: 'Rental property',
  cgt: 'Capital gains and crypto',
  foreign: 'Foreign income',
  business: 'Business, partnerships and trusts',
  deep_dsw: 'Support worker expenses',
  deep_construction: 'Construction and trades expenses',
  deep_chef: 'Chef and hospitality expenses',
  deductions: 'Deductions',
  super_contributions: 'Super contributions',
  offsets: 'Offsets, debts and tax paid',
};

/** Completeness weighting (Section 9): income modules 3, deductions 2, others 1. */
export const MODULE_WEIGHTS: Record<ModuleId, number> = {
  core: 1,
  residency: 1,
  family: 1,
  employment: 3,
  allowances: 3,
  compensation: 3,
  government: 3,
  super_income: 3,
  investments: 3,
  rental: 3,
  cgt: 3,
  foreign: 3,
  business: 3,
  deep_dsw: 2,
  deep_construction: 2,
  deep_chef: 2,
  deductions: 2,
  super_contributions: 2,
  offsets: 1,
};

export const INCOME_MODULES: readonly ModuleId[] = [
  'employment',
  'allowances',
  'compensation',
  'government',
  'super_income',
  'investments',
  'rental',
  'cgt',
  'foreign',
  'business',
] as const;

export type OccupationTag =
  | 'all_employees'
  | 'vehicle_travel'
  | 'tools_equipment'
  | 'uniform_ppe'
  | 'licences_cards'
  | 'home_office'
  | 'phone_internet'
  | 'overnight_travel'
  | 'sun_protection'
  | 'self_education'
  | 'union_fees'
  | 'dsw'
  | 'construction'
  | 'chef_hospitality'
  | 'fifo'
  | 'sole_trader';

export const ALL_OCCUPATION_TAGS: readonly OccupationTag[] = [
  'all_employees',
  'vehicle_travel',
  'tools_equipment',
  'uniform_ppe',
  'licences_cards',
  'home_office',
  'phone_internet',
  'overnight_travel',
  'sun_protection',
  'self_education',
  'union_fees',
  'dsw',
  'construction',
  'chef_hospitality',
  'fifo',
  'sole_trader',
] as const;

/** Generic tags a user may pick for "Other / not listed" occupations (Section 5). */
export const GENERIC_OCCUPATION_TAGS: readonly OccupationTag[] = [
  'vehicle_travel',
  'tools_equipment',
  'uniform_ppe',
  'licences_cards',
  'home_office',
  'phone_internet',
  'overnight_travel',
  'sun_protection',
  'self_education',
  'union_fees',
] as const;

/** Flag codes produced by options or the intelligence layer. Free-form string kept open for new rules. */
export type FlagCode = string;

export interface Option {
  value: string;
  label: string;
  help?: string;            // plain-English explanation of when to pick it
  exclusive?: boolean;      // 'none', 'not_sure' clear other ticks in multi
  flag?: FlagCode;          // picking it raises this flag
}

export type Condition =
  | { q: string; eq: string }
  | { q: string; in: string[] }
  | { q: string; includes: string }     // multi contains
  | { q: string; gt: number }
  | { q: string; anyItemGt: number }   // a repeater question answered above the value in any item
  | { q: string; answered: true }
  | { occupation: OccupationTag }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export type ValidationRule =
  | { kind: 'min'; value: number; message?: string }
  | { kind: 'max'; value: number; message?: string }
  | { kind: 'warnAbove'; value: number; message: string }   // warn, never block
  | { kind: 'inFinancialYear'; message?: string }            // date must be within case FY
  | { kind: 'maxLength'; value: number; message?: string }
  | { kind: 'pattern'; value: string; message: string };

/** Tax treatment codes (Section 7). */
export type Treatment =
  | 'D'   // deductible (to the work-use %)
  | 'N'   // not deductible
  | 'C'   // capital (decline in value)
  | 'R'   // manual review flag
  | 'I';  // income

/** A treatment that depends on an earlier answer, e.g. "first licence" vs "renewal". */
export interface TreatmentByAnswer {
  byQuestion: string;
  map: Record<string, Treatment>;
  /** Treatment when the driving question has no usable answer (default 'R'). */
  fallback?: Treatment;
}

export type DeductionCategory =
  | 'car'
  | 'work_travel'
  | 'overnight_travel'
  | 'clothing'
  | 'laundry'
  | 'tools'
  | 'home_office'
  | 'phone_internet'
  | 'self_education'
  | 'union_professional'
  | 'subscriptions'
  | 'licences'
  | 'sun_protection'
  | 'first_aid'
  | 'other_work'
  | 'custom'
  | 'compensation_costs'
  | 'gifts_donations'
  | 'tax_affairs'
  | 'income_protection'
  | 'personal_super'
  | 'investment'
  | 'rental';

/**
 * Deduction metadata on a MONEY question. The calculation engine reads every answered
 * money question that carries this and applies the treatment. Sibling questions are
 * found by convention from `base`:
 *   `${base}.paid`               single: paid_not_reimbursed | paid_fully_reimbursed | paid_partly_reimbursed | employer_paid | not_sure
 *   `${base}.reimbursed_amount`  money (when partly reimbursed)
 *   `${base}.work_pct`           percent (defaults to 100 when the question does not exist)
 *   `${base}.work_pct_method`    single: logbook | diary | itemised | estimate | not_sure
 *   `${base}.evidence`           single/multi: receipts | bank_statements | logbook | diary | estimate_only | none
 *   `${base}.date`               date first used / paid (for decline in value)
 */
export interface DeductionMeta {
  category: DeductionCategory;
  base: string;
  treatment: Treatment | TreatmentByAnswer;
  /** When true, amounts at or above the rule table's instant deduction threshold are capital (decline in value). */
  capitalThreshold?: boolean;
  /** Which allowance types this expense matches (for ALLOWANCE_NO_EXPENSE checks). */
  matchesAllowance?: string[];
}

export type IncomeCategory =
  | 'salary'
  | 'allowance'
  | 'other_employment'
  | 'lump_sum_a'
  | 'lump_sum_b'
  | 'lump_sum_d'
  | 'lump_sum_e'
  | 'etp'
  | 'compensation'
  | 'government'
  | 'super_income'
  | 'interest'
  | 'dividend_unfranked'
  | 'dividend_franked'
  | 'franking_credit'
  | 'trust'
  | 'rent'
  | 'capital_gain'
  | 'crypto_income'
  | 'foreign'
  | 'business'
  | 'partnership_trust'
  | 'ess';

/**
 * Income metadata on a MONEY question. Treatment 'I' = assessable income, 'N' = not income,
 * 'R' = routed to manual review (amount shown, never added silently).
 */
export interface IncomeMeta {
  category: IncomeCategory;
  treatment?: 'I' | 'N' | 'R' | TreatmentByAnswer;
}

export type CreditKind = 'payg_withheld' | 'payg_instalment' | 'franking_credit' | 'tfn_withheld' | 'foreign_tax_paid';

export interface RepeaterSpec {
  groupId: string;          // 'employer', 'rental_property', 'cgt_event', 'lump_sum_e_year' ...
  itemLabel: string;        // 'Employer or payer'
  addLabel: string;         // 'Add another employer'
  minItems: number;
  maxItems?: number;
  /** Question id inside the group whose answer names the item card (e.g. employer name). */
  labelFrom?: string;
}

export interface Question {
  id: string;               // stable forever, e.g. 'dsw.travel.client_to_client'
  module: ModuleId;         // e.g. 'residency', 'deductions'
  type: QuestionType;
  prompt: string;           // one question only, no 'and/or'
  help?: string;            // why we ask, in plain English
  atoRef?: string;          // ATO page URL backing the question
  options?: Option[];       // required for single/multi
  required: boolean;
  showIf?: Condition;       // visibility; never sets a value
  occupationTags?: OccupationTag[];
  validation?: ValidationRule[];
  repeaterGroup?: string;   // belongs inside a repeater
  repeater?: RepeaterSpec;  // only for type 'repeater'
  feeds?: string[];         // calc inputs this answer feeds, for the explain trail
  years?: { from?: FY; to?: FY }; // question exists only in these FYs
  allowNegative?: boolean;  // money fields that may be a loss
  /** Screening questions get 'none' and 'other' options (lint rule 3). */
  screening?: boolean;
  /** Which subsection/topic the question sits under in the UI. */
  topic?: string;
  deduction?: DeductionMeta;
  income?: IncomeMeta;
  credit?: CreditKind;
  /** Free-form data for special calc modules (car, wfh, laundry, cgt, rental...). */
  calc?: Record<string, unknown>;
  /** Picking any option adds these occupation tags to the active tag set. */
  addsTags?: Record<string, OccupationTag[]>;
}

export type AnswerState = 'answered' | 'not_sure' | 'skipped' | 'not_applicable_by_rule' | 'imported';
export type AnswerSource = 'user' | 'document' | 'prefill_confirmed';

export interface AnswerRecord {
  questionId: string;
  repeaterItemId: string | null;
  value: unknown;
  state: AnswerState;
  source: AnswerSource;
  version: number;
  /** Where a prefilled or imported value came from (prior-year case or uploaded document). */
  sourceRef?: SourceRef;
}

/** Provenance of a prefilled answer. It never makes the value count: `imported` answers still need confirming. */
export type SourceRef =
  | { kind: 'prior_year'; fromCaseId?: string; fy: string; category: 'reusable' | 'opening_balance' | 'annual_fact'; documentId?: string; fileName?: string; note?: string }
  | { kind: 'document'; documentId: string; fileName?: string };

export interface RepeaterItem {
  id: string;
  groupId: string;
  label?: string | null;
  sortOrder: number;
}

export interface DateRangeValue {
  from: string;
  to: string;
}

/** Context the engine needs beyond answers. */
export interface CaseContext {
  fy: FY;
  /** Occupation ids stored on the profile (registry ids). */
  profileOccupations: string[];
}
