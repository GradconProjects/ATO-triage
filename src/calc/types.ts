import type { AnswerView } from '../engine/answers';
import type { CaseContext, ModuleId, OccupationTag, Question } from '../engine/types';
import type { RuleSet } from '../rules/schema';

export type EstimateSection =
  | 'income'
  | 'deductions'
  | 'taxable_income'
  | 'gross_tax'
  | 'offsets'
  | 'medicare'
  | 'mls'
  | 'study_loan'
  | 'credits'
  | 'result';

export type LineStatus = 'computed' | 'manual_review' | 'excluded';

/** One explained line in the estimate. Every number the app shows has one of these behind it. */
export interface EstimateLine {
  id: string;
  section: EstimateSection;
  label: string;
  /** Integer cents. Positive for income/tax/credits; deductions are positive amounts that reduce income. */
  amountCents: number;
  ruleId: string;
  /** Question ids (optionally suffixed with @itemId) that fed this line. */
  inputs: string[];
  formula: string;
  status: LineStatus;
  /** Plain-English note (why excluded, what to check). */
  note?: string;
  /** Category for report grouping (income category, deduction category...). */
  category?: string;
  /** Repeater item id when the line belongs to one item. */
  itemId?: string | null;
  /** Deduction details for the report table. */
  detail?: Record<string, string | number | boolean | null | undefined>;
  /** True for a component line that explains a figure already counted by another line (never summed). */
  informational?: boolean;
}

export interface ManualReviewItem {
  module: string;
  reason: string;
  questionIds: string[];
  amountCents?: number;
}

export interface EstimateTotals {
  assessableIncomeCents: number;
  deductionsCents: number;
  taxableIncomeCents: number;      // rounded down to whole dollars (x100)
  grossTaxCents: number;
  offsetsCents: number;
  taxAfterOffsetsCents: number;
  medicareLevyCents: number;
  mlsCents: number;
  studyLoanCents: number;
  creditsCents: number;
  /** credits - (tax after offsets + medicare + mls + study). Positive = refund, negative = debt. */
  resultCents: number;
  /** Income (non-capital) loss carried forward when taxable income would be negative. */
  carriedForwardLossCents: number;
  /** Net capital loss carried forward to later years (kept separate from the income loss). */
  capitalLossCarriedForwardCents: number;
  /** Work-related deductions (car, clothing, tools, WFH, phone... excluding gifts, tax affairs, super, investment) for DEDUCTION_RATIO_HIGH. */
  workRelatedDeductionsCents: number;
  /** Private health insurance rebate liability added to tax (rebate received above entitlement). */
  phiLiabilityCents: number;
}

export interface Estimate {
  fy: string;
  ruleSetVersion: string;
  lines: EstimateLine[];
  totals: EstimateTotals;
  manualReview: ManualReviewItem[];
  /** Range when uncertain amounts exist: low/high result in cents. */
  range?: { lowCents: number; highCents: number; reasons: string[] };
  /** Assumption / simplification notes for the report. */
  assumptions: string[];
  /** Amounts the intelligence layer treats as uncertain (question ids). Filled by pipeline from 'R' treatments. */
  uncertainInputs: string[];
  /** Modules that were fully computed vs routed to review. */
  moduleStatus: Record<string, 'computed' | 'manual_review' | 'not_applicable'>;
}

export interface CalcInput {
  answers: AnswerView;
  rules: RuleSet;
  questions: Question[];
  ctx: CaseContext;
  activeTags: Set<OccupationTag>;
  /** Visible question ids (with @itemId for repeater instances) as decided by the engine. */
  visible: Set<string>;
  /** Optional: question ids to exclude (used for range estimates). */
  excludeInputs?: Set<string>;
  /** Optional: rule set lookup for other years (LSPIA notional tax). Missing years fall back to `rules` with an assumption note. */
  rulesFor?: (fy: string) => RuleSet | undefined;
}

export interface Confidence {
  level: 'high' | 'medium' | 'low';
  reasons: string[];
}

export type ModuleStatusMap = Partial<Record<ModuleId | string, 'computed' | 'manual_review' | 'not_applicable'>>;
