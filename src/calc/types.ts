import type { AnswerView } from '../engine/answers';
import type { CaseContext, ModuleId, OccupationTag, Question } from '../engine/types';
import type { RuleSet } from '../rules/schema';

export type EstimateSection =
  | 'income'
  | 'deductions'
  | 'taxable_income'
  | 'gross_tax'
  | 'offsets'
  | 'refundable_offsets'
  | 'phi_recovery'
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
  /** Included in the estimate, but only provisionally (an app estimate or unconfirmed input). */
  provisional?: boolean;
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
  /**
   * Refundable offsets (e.g. an additional private health rebate owed to you). Never capped at
   * income tax: paid out even when tax is nil. Optional so older stored estimates still load.
   */
  refundableOffsetsCents?: number;
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
  /**
   * Deferred non-commercial losses, one row per business activity (the main business and each
   * separate activity). Kept apart from capital losses. Optional so older stored estimates load.
   */
  deferredLosses?: DeferredLossRow[];
}

/** One business activity's deferred non-commercial loss roll-forward for the year. */
export interface DeferredLossRow {
  /** 'main' for the main business, else the business_activity repeater item id. */
  activityId: string;
  activity: string;
  /** Unused deferred loss brought forward from earlier years. */
  openingCents: number;
  /** This year's net loss of the activity (0 when it made a profit). */
  currentLossCents: number;
  /** Opening balance used against this activity's profit this year. */
  usedCents: number;
  /** Carried forward to next year: opening - used + current loss when deferred. */
  closingCents: number;
  /** deferred: loss not deducted this year; review: a loss test was ticked, needs confirmation; none: profit or break-even. */
  status: 'deferred' | 'review' | 'none';
}

export interface CalcInput {
  answers: AnswerView;
  rules: RuleSet;
  questions: readonly Question[];
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
