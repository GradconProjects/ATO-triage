/**
 * Completeness and confidence (Section 9 "Completeness score" / "Confidence score").
 */
import type { Progress } from '../engine/progress';
import type { Confidence, Estimate } from '../calc/types';
import type { Completeness, Flag } from './types';

export function completenessFrom(progress: Progress): Completeness {
  return {
    pct: progress.weightedPct,
    incomeModulesPct: progress.incomeModulesPct,
    byModule: progress.byModule.map((m) => ({ ...m })),
  };
}

/**
 * high   = completeness 100%, no review flags, no manual-review modules.
 * medium = completeness >= 90% and only info/warning review flags (no blocker anywhere).
 * low    = anything else.
 */
export function confidence(estimate: Pick<Estimate, 'manualReview'>, flags: Flag[], completeness: Pick<Completeness, 'pct'>): Confidence {
  const reasons: string[] = [];
  const blockers = flags.filter((f) => f.severity === 'blocker');
  const reviewFlags = flags.filter((f) => f.kind === 'review');
  const manual = estimate.manualReview.length;

  if (blockers.length > 0) {
    reasons.push(`${blockers.length} blocking issue${blockers.length === 1 ? '' : 's'} must be resolved: ${blockers.map((b) => b.code).join(', ')}.`);
  }
  if (completeness.pct < 100) reasons.push(`Interview is ${completeness.pct}% complete.`);
  if (reviewFlags.length > 0) reasons.push(`${reviewFlags.length} item${reviewFlags.length === 1 ? '' : 's'} need review.`);
  if (manual > 0) reasons.push(`${manual} part${manual === 1 ? '' : 's'} of the estimate ${manual === 1 ? 'is' : 'are'} routed to manual review.`);

  if (blockers.length > 0) return { level: 'low', reasons };
  if (completeness.pct >= 100 && reviewFlags.length === 0 && manual === 0) {
    return { level: 'high', reasons: ['Interview complete, nothing flagged for review and every module computed.'] };
  }
  if (completeness.pct >= 90) return { level: 'medium', reasons };
  return { level: 'low', reasons };
}
