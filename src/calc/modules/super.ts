import { Q } from '../../questions/ids';
import type { CalcContext } from '../context';
import { dollarsToCents } from '../money';
import { resolvePaid } from '../reimbursement';

/**
 * Personal deductible super contribution: only when the notice of intent is acknowledged; capped
 * at the concessional cap less reportable employer super (excess excluded with a note).
 */
export function computeSuperDeduction(cx: CalcContext, rescCents: number): number {
  const rules = cx.rules;
  const amount = cx.a.cents(Q.supc.personalAmount);
  if (amount === undefined) {
    if (cx.a.isNotSure(Q.supc.personalAny)) {
      cx.setStatus('super_contribution', 'manual_review');
      cx.review('super_contribution', 'Not sure whether personal super contributions were made.', [Q.supc.personalAny]);
    } else cx.setStatus('super_contribution', 'not_applicable');
    return 0;
  }
  const noi = cx.a.string(Q.supc.noi);
  const inputs = [Q.supc.personalAmount, Q.supc.noi];
  if (noi !== 'acknowledged') {
    cx.setStatus('super_contribution', 'computed');
    cx.lines.excluded({ id: 'ded.super', section: 'deductions', label: 'Personal super contribution', amountCents: amount, ruleId: `${rules.fy}.superDeduction`, inputs, formula: `${amount / 100} (notice of intent ${noi ?? 'not answered'})`, note: 'Blocked: a personal super deduction needs a notice of intent lodged with the fund and acknowledged before lodging.', category: 'personal_super' });
    return 0;
  }
  const paid = resolvePaid(cx, 'supc.personal', null, amount);
  if (paid.kind === 'excluded') {
    cx.setStatus('super_contribution', 'computed');
    cx.lines.excluded({ id: 'ded.super', section: 'deductions', label: 'Personal super contribution', amountCents: amount, ruleId: `${rules.fy}.superDeduction`, inputs: [...inputs, ...paid.inputs], formula: `${amount / 100} not paid from own money`, note: paid.note ?? 'Not paid from your own after-tax money.', category: 'personal_super' });
    return 0;
  }
  if (paid.kind === 'review') {
    cx.setStatus('super_contribution', 'manual_review');
    cx.review('super_contribution', paid.note ?? 'Reimbursement unknown.', paid.inputs, amount);
    cx.markUncertain(Q.supc.personalAmount);
    cx.lines.review({ id: 'ded.super', section: 'deductions', label: 'Personal super contribution', amountCents: amount, ruleId: `${rules.fy}.superDeduction`, inputs: [...inputs, ...paid.inputs], formula: `${amount / 100}`, note: paid.note ?? 'Reimbursement unknown.', category: 'personal_super' });
    return 0;
  }
  const cap = Math.max(0, dollarsToCents(rules.concessionalCap) - rescCents);
  const deductible = Math.min(amount, cap);
  const excess = amount - deductible;
  cx.setStatus('super_contribution', 'computed');
  cx.lines.computed({ id: 'ded.super', section: 'deductions', label: 'Personal super contribution', amountCents: deductible, ruleId: `${rules.fy}.superDeduction`, inputs, formula: `min(${amount / 100}, concessional cap ${rules.concessionalCap} - reportable employer super ${rescCents / 100})`, category: 'personal_super', detail: { contributionCents: amount, capRemainingCents: cap } });
  if (excess > 0) {
    cx.lines.excluded({ id: 'ded.super.excess', section: 'deductions', label: 'Personal super contribution above the concessional cap', amountCents: excess, ruleId: `${rules.fy}.superDeduction`, inputs: [...inputs, Q.emp.resc], formula: `${amount / 100} - ${deductible / 100}`, note: `Only ${cap / 100} of concessional cap remains after employer contributions; the excess is not deductible (carry-forward cap not modelled).`, category: 'personal_super' });
    cx.review('super_contribution', 'Contribution exceeds the remaining concessional cap; check carry-forward unused cap eligibility.', [Q.supc.personalAmount, Q.supc.carryForward], excess);
  }
  return deductible;
}
