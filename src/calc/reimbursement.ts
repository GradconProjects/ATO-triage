import { PAID_OPTIONS, EVIDENCE_OPTIONS } from '../questions/ids';
import type { CalcContext } from './context';

export interface PaidResolution {
  kind: 'ok' | 'excluded' | 'review';
  /** Amount after subtracting any partial reimbursement. */
  netCents: number;
  reimbursedCents: number;
  note?: string;
  inputs: string[];
}

/**
 * Apply the `${base}.paid` / `${base}.reimbursed_amount` convention.
 * - paid_not_reimbursed -> ok
 * - paid_partly_reimbursed -> ok, minus the reimbursed amount (missing amount -> review)
 * - paid_fully_reimbursed / employer_paid -> excluded
 * - not_sure -> review
 * - unanswered: ok when the paid question does not exist in the bank; review when it exists.
 */
export function resolvePaid(cx: CalcContext, base: string, itemId: string | null, amountCents: number): PaidResolution {
  const paidQ = `${base}.paid`;
  const reimbQ = `${base}.reimbursed_amount`;
  const paid = cx.scopedString(paidQ, itemId);
  const inputs = [paidQ];
  if (paid === undefined) {
    if (cx.scopedNotSure(paidQ, itemId)) return { kind: 'review', netCents: amountCents, reimbursedCents: 0, note: 'Not sure whether this was reimbursed.', inputs };
    if (cx.exists(paidQ)) return { kind: 'review', netCents: amountCents, reimbursedCents: 0, note: 'Whether the cost was reimbursed has not been answered.', inputs };
    return { kind: 'ok', netCents: amountCents, reimbursedCents: 0, inputs: [] };
  }
  switch (paid) {
    case PAID_OPTIONS.paidNotReimbursed:
      return { kind: 'ok', netCents: amountCents, reimbursedCents: 0, inputs };
    case PAID_OPTIONS.paidPartlyReimbursed: {
      const r = cx.scopedCents(reimbQ, itemId);
      if (r === undefined) return { kind: 'review', netCents: amountCents, reimbursedCents: 0, note: 'Partly reimbursed but the reimbursed amount is missing.', inputs: [...inputs, reimbQ] };
      const net = Math.max(0, amountCents - r);
      return { kind: 'ok', netCents: net, reimbursedCents: r, note: `Reduced by ${r / 100} reimbursed.`, inputs: [...inputs, reimbQ] };
    }
    case PAID_OPTIONS.paidFullyReimbursed:
      return { kind: 'excluded', netCents: 0, reimbursedCents: amountCents, note: 'Fully reimbursed: reimbursed costs cannot be claimed.', inputs };
    case PAID_OPTIONS.employerPaid:
      return { kind: 'excluded', netCents: 0, reimbursedCents: amountCents, note: 'Paid or supplied by the employer: nothing to claim.', inputs };
    default:
      return { kind: 'review', netCents: amountCents, reimbursedCents: 0, note: 'Reimbursement answer not recognised.', inputs };
  }
}

/** True when the `${base}.evidence` answer is estimate_only or none (claim at risk; amount marked uncertain). */
export function weakEvidence(cx: CalcContext, base: string, itemId: string | null): boolean {
  const q = `${base}.evidence`;
  const v = cx.scopedValue(q, itemId);
  const values = typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  return values.includes(EVIDENCE_OPTIONS.estimateOnly) || values.includes(EVIDENCE_OPTIONS.none);
}

/**
 * Work-use percent from `${base}.work_pct`: 100 when the question is not in the bank; undefined
 * (-> review) when it exists but has no usable answer.
 */
export function workPct(cx: CalcContext, base: string, itemId: string | null): number | undefined {
  const q = `${base}.work_pct`;
  const v = cx.scopedNumber(q, itemId);
  if (v !== undefined) return Math.max(0, Math.min(100, v));
  if (!cx.exists(q)) return 100;
  return undefined;
}
