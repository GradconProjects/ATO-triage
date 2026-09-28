import { Q } from '../../questions/ids';
import type { CalcContext } from '../context';
import { pct } from '../money';
import { resolvePaid } from '../reimbursement';

/**
 * Working from home.
 * - fixed_rate: hours x wfhFixedRatePerHour (cents) only with a full record or a representative
 *   4-week record of hours; estimate / none -> review (amount shown as information).
 * - actual: actual costs x work %.
 */
export function computeHomeOffice(cx: CalcContext): number {
  const rules = cx.rules;
  const any = cx.a.string(Q.ded.wfhAny);
  const method = cx.a.string(Q.ded.wfhMethod);
  const hours = cx.a.number(Q.ded.wfhHours);
  const actual = cx.a.cents(Q.ded.wfhActualCosts);
  if (any === 'no' || (any === undefined && method === undefined && hours === undefined && actual === undefined)) {
    if (cx.a.isNotSure(Q.ded.wfhAny)) {
      cx.setStatus('home_office', 'manual_review');
      cx.review('home_office', 'Not sure whether work was done from home.', [Q.ded.wfhAny]);
    } else cx.setStatus('home_office', 'not_applicable');
    return 0;
  }
  const inputs = [Q.ded.wfhAny, Q.ded.wfhMethod];
  const toReview = (reason: string, ids: string[], amount: number, formula: string) => {
    cx.setStatus('home_office', 'manual_review');
    cx.review('home_office', reason, ids, amount);
    cx.markUncertain(Q.ded.wfhHours, Q.ded.wfhActualCosts);
    cx.lines.review({ id: 'ded.wfh', section: 'deductions', label: 'Working from home', amountCents: amount, ruleId: `${rules.fy}.wfh`, inputs: [...inputs, ...ids], formula, note: reason, category: 'home_office' });
    return 0;
  };
  if (method === 'fixed_rate') {
    if (hours === undefined) return toReview('Hours worked from home not answered.', [Q.ded.wfhHours], 0, 'hours x rate (hours missing)');
    const record = cx.a.string(Q.ded.wfhHoursRecord);
    const amount = Math.round(hours * rules.wfhFixedRatePerHour);
    const formula = `${hours} hours x ${rules.wfhFixedRatePerHour}c`;
    if (record !== 'full_record' && record !== 'representative_4_weeks') {
      const reason = record === 'estimate' ? 'The fixed rate needs a record of actual hours; an estimate is not enough.' : record === 'none' ? 'The fixed rate needs a record of actual hours; none was kept.' : cx.a.isNotSure(Q.ded.wfhHoursRecord) ? 'Not sure what record of hours was kept.' : 'Record of hours not answered.';
      return toReview(reason, [Q.ded.wfhHours, Q.ded.wfhHoursRecord], amount, `${formula} (no valid record)`);
    }
    cx.setStatus('home_office', 'computed');
    cx.lines.computed({ id: 'ded.wfh', section: 'deductions', label: 'Working from home (fixed rate)', amountCents: amount, ruleId: `${rules.fy}.wfh`, inputs: [...inputs, Q.ded.wfhHours, Q.ded.wfhHoursRecord], formula, category: 'home_office', detail: { method: 'fixed_rate', hours, ratePerHour: rules.wfhFixedRatePerHour, record } });
    return amount;
  }
  if (method === 'actual') {
    const wp = cx.a.number(Q.ded.wfhWorkPct);
    if (actual === undefined || wp === undefined) return toReview('Actual-cost method needs the total running costs and the work-use percentage.', [Q.ded.wfhActualCosts, Q.ded.wfhWorkPct], actual ?? 0, 'actual costs x work % (missing)');
    const paid = resolvePaid(cx, 'ded.wfh', null, actual);
    if (paid.kind === 'excluded') {
      cx.setStatus('home_office', 'computed');
      cx.lines.excluded({ id: 'ded.wfh', section: 'deductions', label: 'Working from home (actual cost)', amountCents: actual, ruleId: `${rules.fy}.wfh`, inputs: [...inputs, ...paid.inputs], formula: `${actual / 100} reimbursed`, note: paid.note ?? 'Reimbursed.', category: 'home_office' });
      return 0;
    }
    if (paid.kind === 'review') return toReview(paid.note ?? 'Reimbursement unknown.', paid.inputs, actual, 'actual costs x work %');
    const amount = pct(paid.netCents, wp);
    cx.setStatus('home_office', 'computed');
    cx.lines.computed({ id: 'ded.wfh', section: 'deductions', label: 'Working from home (actual cost)', amountCents: amount, ruleId: `${rules.fy}.wfh`, inputs: [...inputs, Q.ded.wfhActualCosts, Q.ded.wfhWorkPct], formula: `${paid.netCents / 100} x ${wp}%`, category: 'home_office', detail: { method: 'actual', actualCostsCents: actual, workPct: wp, reimbursedCents: paid.reimbursedCents } });
    return amount;
  }
  return toReview(cx.a.isNotSure(Q.ded.wfhMethod) ? 'Not sure which working-from-home method applies.' : 'Working-from-home method not answered.', [Q.ded.wfhMethod], 0, 'method unknown');
}
