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
  homeActivityLines(cx);
  if (method === 'fixed_rate') {
    if (hours === undefined) return toReview('Hours worked from home not answered.', [Q.ded.wfhHours], 0, 'hours x rate (hours missing)');
    const record = cx.a.string(Q.ded.wfhHoursRecord);
    const amount = Math.round(hours * rules.wfhFixedRatePerHour);
    const formula = `${hours} hours x ${rules.wfhFixedRatePerHour}c`;
    // From 1 March 2023 the revised fixed-rate method needs a record of the actual hours for the
    // whole year; a representative 4-week sample is not accepted for any year this app supports.
    if (record === 'representative_4_weeks') {
      return toReview('The fixed-rate method needs a record of the actual hours worked at home for the whole year; a 4-week sample is not accepted for this year.', [Q.ded.wfhHours, Q.ded.wfhHoursRecord], amount, `${formula} (sample record only)`);
    }
    if (cx.a.string(Q.ded.wfhHoursOverlap) === 'yes' || cx.a.isNotSure(Q.ded.wfhHoursOverlap)) {
      return toReview('Some hours may be counted under more than one home activity; each hour can be used once only.', [Q.ded.wfhHours, Q.ded.wfhHoursOverlap], amount, `${formula} (possible double-counted hours)`);
    }
    if (record !== 'full_record') {
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

/**
 * Business and study hours at home are separate activity records. Business running costs belong
 * to that business activity's expenses; study-at-home running costs depend on the course and the
 * method allowed, so they are shown for manual review and never priced at the work rate automatically.
 */
function homeActivityLines(cx: CalcContext) {
  const acts = cx.a.list(Q.ded.wfhActivities) ?? [];
  const fy = cx.rules.fy;
  const biz = cx.visible.has(Q.ded.wfhBusinessHours) ? cx.a.number(Q.ded.wfhBusinessHours) : undefined;
  if (acts.includes('business') && biz !== undefined) {
    cx.lines.excluded({ id: 'ded.wfh.business_hours', section: 'deductions', label: `Business work at home (${biz} hours)`, amountCents: 0, ruleId: `${fy}.wfh.business`, inputs: [Q.ded.wfhActivities, Q.ded.wfhBusinessHours], formula: `${biz} hours recorded`, note: 'Not an employee deduction: include the home running costs as an expense of the business activity, once.', category: 'home_office' });
  }
  const study = cx.visible.has(Q.ded.wfhStudyHours) ? cx.a.number(Q.ded.wfhStudyHours) : undefined;
  if (acts.includes('study') && study !== undefined) {
    cx.setStatus('home_office', 'manual_review');
    cx.review('home_office', `Home study (${study} hours): which method can be used for study-at-home running costs depends on the course and year, so it is assessed manually. Hours are not a deduction on their own.`, [Q.ded.wfhStudyHours]);
    cx.lines.review({ id: 'ded.wfh.study_hours', section: 'deductions', label: `Study at home (${study} hours)`, amountCents: 0, ruleId: `${fy}.selfEducation.home`, inputs: [Q.ded.wfhActivities, Q.ded.wfhStudyHours], formula: `${study} hours recorded`, note: 'Not priced at the working-from-home rate automatically. Any eligible running costs are added once the method is confirmed.', category: 'self_education' });
  }
}
