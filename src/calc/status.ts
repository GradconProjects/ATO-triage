/**
 * Plain status for every estimate line, shared by the estimate screen, review screen and report:
 * confirmed included, provisionally included, excluded, deferred, or manual review (saying
 * whether it affects the estimate).
 */
import type { Estimate, EstimateLine } from './types';

export type DisplayStatus = 'confirmed' | 'provisional' | 'excluded' | 'deferred' | 'review_affects' | 'review_may_affect';

export const DISPLAY_STATUS_LABEL: Record<DisplayStatus, string> = {
  confirmed: 'Confirmed: included',
  provisional: 'Provisional: included, but not yet certain',
  excluded: 'Excluded',
  deferred: 'Deferred to a later year',
  review_affects: 'Manual review: not included, affects the estimate',
  review_may_affect: 'Manual review: not included, may affect the estimate',
};

export function displayStatus(line: EstimateLine, estimate: Pick<Estimate, 'uncertainInputs'>): DisplayStatus {
  if (line.status === 'excluded') return line.ruleId.endsWith('.ncl') ? 'deferred' : 'excluded';
  if (line.status === 'manual_review') return line.amountCents !== 0 ? 'review_affects' : 'review_may_affect';
  const keys = new Set(estimate.uncertainInputs);
  const uncertain = line.inputs.some((i) => keys.has(line.itemId ? `${i}@${line.itemId}` : i) || keys.has(i));
  return line.provisional || uncertain ? 'provisional' : 'confirmed';
}
