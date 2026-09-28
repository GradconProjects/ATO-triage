/**
 * Intelligence layer types (Section 9, CONTRACT "Intelligence API").
 *
 * Rule-based and deterministic: every flag is a pure function over the visible answers and the
 * estimate. Nothing here writes an answer or changes a number; flags only explain and point.
 */
import type { AnswerView } from '../engine/answers';
import type { CaseContext, OccupationTag, Question } from '../engine/types';
import type { ModuleProgress } from '../engine/progress';
import type { Confidence, Estimate } from '../calc/types';
import type { RuleSet } from '../rules/schema';

export type FlagKind = 'review' | 'opportunity' | 'consistency' | 'missing';
export type FlagSeverity = 'info' | 'warning' | 'blocker';

export interface Flag {
  code: string;
  kind: FlagKind;
  severity: FlagSeverity;
  /** Plain English, no jargon. Opportunities say "check whether", never "you can claim". */
  message: string;
  /** Question ids (optionally suffixed with @itemId) that caused the flag. */
  questionIds: string[];
  atoRef?: string;
}

/** Everything a rule may look at. `answers` only contains records for VISIBLE questions. */
export interface IntelligenceContext {
  answers: AnswerView;
  estimate: Estimate;
  visible: Set<string>;
  activeTags: Set<OccupationTag>;
  questions: readonly Question[];
  ctx: CaseContext;
  rules: RuleSet;
}

/** One concrete flag produced by a rule that fires once per instance (per item, per answer...). */
export interface FlagInstance {
  questionIds: string[];
  message: string;
}

/**
 * Section 9 rule format. `when`/`message` describe the single-flag case; a rule that fires once per
 * instance (one per Not sure answer, one per repeater item...) implements `instances` instead and
 * the registry derives `when` (any instance) and `message` (first instance) from it.
 */
export interface FlagRule {
  code: string;
  kind: FlagKind;
  severity: FlagSeverity;
  when: (a: AnswerView, ctx: IntelligenceContext) => boolean;
  message: (a: AnswerView, ctx: IntelligenceContext) => string;
  questionIds: string[];
  atoRef?: string;
  instances?: (a: AnswerView, ctx: IntelligenceContext) => FlagInstance[];
}

export interface Completeness {
  /** Weighted completeness (income modules x3, deductions x2, others x1). */
  pct: number;
  incomeModulesPct: number;
  byModule: ModuleProgress[];
}

export type RangeEstimate = NonNullable<Estimate['range']>;

export interface IntelligenceResult {
  flags: Flag[];
  completeness: Completeness;
  confidence: Confidence;
  range?: RangeEstimate;
  canFinalise: boolean;
  finaliseBlockers: string[];
}

export type { Confidence } from '../calc/types';
export type { ModuleProgress } from '../engine/progress';
