import { calculate } from '@/src/calc';
import type { CalcInput, Estimate } from '@/src/calc/types';
import { runIntelligence } from '@/src/intelligence';
import type { IntelligenceResult } from '@/src/intelligence/types';
import { RULE_SETS, getRuleSet } from '@/src/rules';
import { QUESTION_BANK } from '@/src/questions';
import type { CaseState } from './case-state';

export interface CalcRun {
  estimate: Estimate;
  intelligence: IntelligenceResult;
  input: CalcInput;
}

/** Run the calculation pipeline and the intelligence layer for a loaded case. Pure; no writes. */
export function runCalculation(state: CaseState): CalcRun {
  const rules = getRuleSet(state.ctx.fy);
  const input: CalcInput = {
    answers: state.view,
    rules,
    questions: QUESTION_BANK,
    ctx: state.ctx,
    activeTags: state.activeTags,
    visible: state.visibleKeys,
    // Historical rule tables for back-dated calculations (arrears). Missing years stay missing.
    rulesFor: (fy: string) => (RULE_SETS as Record<string, ReturnType<typeof getRuleSet> | undefined>)[fy],
  };
  const estimate = calculate(input);
  const intelligence = runIntelligence({ ...input, visibleQuestions: state.visible, ...(state.linkedPhi ? { linkedPhi: state.linkedPhi } : {}) }, estimate, (i) => calculate(i));
  if (intelligence.range) estimate.range = intelligence.range;
  return { estimate, intelligence, input };
}

export function summarise(run: CalcRun) {
  const { estimate, intelligence } = run;
  const open = intelligence.flags.filter((f) => f.kind !== 'opportunity');
  return {
    resultCents: estimate.totals.resultCents,
    rangeLow: estimate.range?.lowCents,
    rangeHigh: estimate.range?.highCents,
    confidence: intelligence.confidence.level,
    openFlags: open.length,
    blockers: intelligence.flags.filter((f) => f.severity === 'blocker').length,
    completenessPct: intelligence.completeness.pct,
    manualReviewCount: estimate.manualReview.length,
    // Amounts under review counted provisionally, and those held out of the result.
    provisionalCents: Math.abs(estimate.totals.provisionalIncomeCents ?? 0) + Math.abs(estimate.totals.provisionalDeductionsCents ?? 0),
    notCountedCents: estimate.totals.heldOutCents ?? 0,
    // At nil tax, extra deductions cannot change the result (only withholding and refundable offsets do).
    nilTax: estimate.totals.grossTaxCents === 0 && estimate.totals.medicareLevyCents === 0,
  };
}
