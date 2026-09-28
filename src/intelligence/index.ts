/**
 * Intelligence layer entry point (CONTRACT "Intelligence API").
 *
 * Deterministic and pure: `runIntelligence` never writes an answer and never changes a number in
 * the estimate. It reads the visible answers and the estimate, evaluates the flag rules, scores
 * completeness and confidence, computes the range (via the supplied `recalc`) and runs the
 * finalise gate.
 */
import type { CalcInput, Estimate } from '../calc/types';
import { computeProgress } from '../engine/progress';
import type { VisibleQuestion } from '../engine/visibility';
import { evaluateFlags, FLAG_RULES } from './flags';
import { finaliseCheck } from './gate';
import { visibleAnswers } from './helpers';
import { rangeEstimate } from './range';
import { completenessFrom, confidence } from './scoring';
import type { IntelligenceContext, IntelligenceResult } from './types';

export type IntelligenceInput = CalcInput & { visibleQuestions?: VisibleQuestion[] };

/** Rebuild the engine's visible list from the `visible` key set when the caller did not pass one. */
export function visibleQuestionsFromKeys(input: CalcInput): VisibleQuestion[] {
  const byId = new Map(input.questions.map((q) => [q.id, q]));
  const out: VisibleQuestion[] = [];
  for (const key of [...input.visible].sort()) {
    const at = key.indexOf('@');
    const id = at === -1 ? key : key.slice(0, at);
    const itemId = at === -1 ? null : key.slice(at + 1);
    const question = byId.get(id);
    if (question) out.push({ question, itemId, key });
  }
  return out;
}

export function runIntelligence(input: IntelligenceInput, estimate: Estimate, recalc?: (input: CalcInput) => Estimate): IntelligenceResult {
  const answers = visibleAnswers(input.answers, input.visible);
  const ctx: IntelligenceContext = {
    answers,
    estimate,
    visible: input.visible,
    activeTags: input.activeTags,
    questions: input.questions,
    ctx: input.ctx,
    rules: input.rules,
  };

  const flags = evaluateFlags(ctx, FLAG_RULES);
  const visible = input.visibleQuestions ?? visibleQuestionsFromKeys(input);
  const completeness = completenessFrom(computeProgress(visible, input.answers));
  const conf = confidence(estimate, flags, completeness);
  const { visibleQuestions: _ignored, ...calcInput } = input;
  const range = rangeEstimate(calcInput, estimate, recalc);
  const gate = finaliseCheck({ answers, questions: input.questions, flags, incomeModulesPct: completeness.incomeModulesPct });

  const result: IntelligenceResult = {
    flags,
    completeness,
    confidence: conf,
    canFinalise: gate.canFinalise,
    finaliseBlockers: gate.blockers,
  };
  if (range) result.range = range;
  return result;
}

export { FLAG_RULES, evaluateFlags, evaluateRule, compareFlags, dedupeAndSort } from './flags';
export { completenessFrom, confidence } from './scoring';
export { rangeEstimate } from './range';
export { finaliseCheck, GATE_CHECKS } from './gate';
export { DEDUCTION_RATIOS, deductionRatioFor } from './ratios';
export type { Flag, FlagKind, FlagSeverity, FlagRule, FlagInstance, IntelligenceContext, IntelligenceResult, Completeness, RangeEstimate } from './types';
