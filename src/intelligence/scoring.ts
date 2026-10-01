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
const GOOD_EVIDENCE = new Set(['receipts', 'bank_statements', 'invoices', 'diary', 'logbook', 'statement', 'payslips']);

/** Evidence completeness: share of included deduction dollars with records behind them. */
export function evidencePct(estimate: Pick<Estimate, 'lines'>): number {
  const ded = estimate.lines.filter((l) => l.section === 'deductions' && l.status === 'computed' && !l.informational && l.amountCents > 0);
  const total = ded.reduce((a, l) => a + l.amountCents, 0);
  if (total === 0) return 100;
  const backed = ded.filter((l) => GOOD_EVIDENCE.has(String(l.detail?.['evidence'] ?? ''))).reduce((a, l) => a + l.amountCents, 0);
  return Math.round((backed / total) * 100);
}

/**
 * Calculation reliability, separate from interview completeness: engine limitations, provisional
 * figures and unresolved items that affect the result.
 */
export function reliability(estimate: Pick<Estimate, 'lines' | 'manualReview' | 'uncertainInputs'>, flags: Flag[]): { level: 'high' | 'medium' | 'low'; reasons: string[] } {
  const reasons: string[] = [];
  const provisional = estimate.lines.filter((l) => l.provisional && l.status === 'computed');
  const affecting = estimate.manualReview.filter((r) => (r.amountCents ?? 0) !== 0);
  const unresolved = flags.filter((f) => f.code === 'UNRESOLVED_AMOUNT');
  const material = affecting.filter((r) => Math.abs(r.amountCents ?? 0) >= 50_000);
  if (unresolved.length) reasons.push(`${unresolved.length} answer${unresolved.length === 1 ? ' says' : 's say'} yes but no amounts were given, so those items are not counted.`);
  if (material.length) reasons.push(`${material.length} unresolved item${material.length === 1 ? '' : 's'} of $500 or more ${material.length === 1 ? 'is' : 'are'} not included and could change the result.`);
  if (provisional.length) reasons.push(`${provisional.length} figure${provisional.length === 1 ? ' is' : 's are'} provisional (app estimates or unconfirmed inputs), for example: ${provisional.slice(0, 2).map((l) => l.label).join('; ')}.`);
  if (affecting.length && !material.length) reasons.push(`${affecting.length} smaller item${affecting.length === 1 ? '' : 's'} await review.`);
  if (unresolved.length || material.length) return { level: 'low', reasons };
  if (provisional.length || affecting.length || estimate.uncertainInputs.length) return { level: 'medium', reasons: reasons.length ? reasons : ['Some inputs are uncertain.'] };
  return { level: 'high', reasons: ['No provisional figures and nothing unresolved that affects the result.'] };
}

export function confidence(estimate: Pick<Estimate, 'manualReview'> & Partial<Pick<Estimate, 'lines' | 'uncertainInputs'>>, flags: Flag[], completeness: Pick<Completeness, 'pct'>): Confidence {
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

  // Material omissions and engine limitations cap the rating, whatever the interview completeness.
  const rel = estimate.lines ? reliability({ lines: estimate.lines, manualReview: estimate.manualReview, uncertainInputs: estimate.uncertainInputs ?? [] }, flags) : undefined;
  if (rel && rel.level !== 'high') reasons.push(...rel.reasons.filter((r) => !reasons.includes(r)));
  if (blockers.length > 0 || rel?.level === 'low') return { level: 'low', reasons };
  if (completeness.pct >= 100 && reviewFlags.length === 0 && manual === 0 && (!rel || rel.level === 'high')) {
    return { level: 'high', reasons: ['Interview complete, nothing flagged for review and every module computed.'] };
  }
  if (completeness.pct >= 90) return { level: 'medium', reasons };
  return { level: 'low', reasons };
}
