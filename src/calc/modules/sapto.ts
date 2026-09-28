import { Q } from '../../questions/ids';
import type { RuleSet } from '../../rules/schema';
import { dollarsToCents, mulRate } from '../money';
import type { CalcContext } from '../context';

/** SAPTO for one band: maxOffset shading out at taperRate per dollar above shadeOutFrom. */
export function saptoAmount(rebateIncomeCents: number, band: { maxOffset: number; shadeOutFrom: number }, taperRate: number): number {
  const max = dollarsToCents(band.maxOffset);
  const from = dollarsToCents(band.shadeOutFrom);
  if (rebateIncomeCents <= from) return max;
  return Math.max(0, max - mulRate(rebateIncomeCents - from, taperRate));
}

/** True when the taxpayer answered yes to SAPTO eligibility. */
export function saptoEligible(cx: CalcContext): boolean {
  return cx.a.string(Q.off.saptoEligible) === 'yes';
}

/**
 * Seniors and pensioners tax offset. Only when off.sapto_eligible = yes and a status is answered.
 * Rebate income is approximated as taxable income + reportable fringe benefits + reportable super.
 * couple_separated_illness has its own thresholds not in the rule table -> review.
 */
export function computeSapto(cx: CalcContext, taxableCents: number, rfbCents: number, rescCents: number): number {
  const elig = cx.a.string(Q.off.saptoEligible);
  if (elig === undefined || elig === 'no') {
    if (cx.a.isNotSure(Q.off.saptoEligible)) {
      cx.review('sapto', 'Not sure whether eligible for the seniors and pensioners tax offset.', [Q.off.saptoEligible]);
      cx.setStatus('sapto', 'manual_review');
      cx.markUncertain(Q.off.saptoEligible);
    } else {
      cx.setStatus('sapto', 'not_applicable');
    }
    return 0;
  }
  if (elig !== 'yes') {
    cx.setStatus('sapto', 'not_applicable');
    return 0;
  }
  const status = cx.a.string(Q.off.saptoStatus);
  const rules: RuleSet = cx.rules;
  const rebateIncome = taxableCents + rfbCents + rescCents;
  const toReview = (reason: string, ids: string[]) => {
    cx.review('sapto', reason, ids);
    cx.setStatus('sapto', 'manual_review');
    cx.lines.review({
      id: 'offset.sapto',
      section: 'offsets',
      label: 'Seniors and pensioners tax offset',
      amountCents: 0,
      ruleId: `${rules.fy}.sapto`,
      inputs: ids,
      formula: 'not computed',
      note: reason,
    });
    return 0;
  };
  if (status === undefined) return toReview('SAPTO status (single / couple) not answered.', [Q.off.saptoStatus]);
  if (status === 'couple_separated_illness') return toReview('Illness-separated couple SAPTO thresholds are not in the rule table.', [Q.off.saptoStatus]);
  let amount: number;
  let bandLabel: string;
  if (status === 'single') {
    amount = saptoAmount(rebateIncome, rules.sapto.single, rules.sapto.taperRate);
    bandLabel = 'single';
  } else if (status === 'couple') {
    amount = saptoAmount(rebateIncome, rules.sapto.coupleEach, rules.sapto.taperRate);
    bandLabel = 'couple (each)';
  } else {
    return toReview('SAPTO status not recognised.', [Q.off.saptoStatus]);
  }
  cx.assume('SAPTO rebate income approximated as taxable income + reportable fringe benefits + reportable super; unused spouse SAPTO transfer not modelled.');
  cx.setStatus('sapto', 'computed');
  cx.lines.computed({
    id: 'offset.sapto',
    section: 'offsets',
    label: `Seniors and pensioners tax offset (${bandLabel})`,
    amountCents: amount,
    ruleId: `${rules.fy}.sapto`,
    inputs: [Q.off.saptoEligible, Q.off.saptoStatus],
    formula: `max ${bandLabel === 'single' ? rules.sapto.single.maxOffset : rules.sapto.coupleEach.maxOffset} less ${rules.sapto.taperRate * 100}c per $ of rebate income ${rebateIncome / 100} over ${bandLabel === 'single' ? rules.sapto.single.shadeOutFrom : rules.sapto.coupleEach.shadeOutFrom}`,
  });
  return amount;
}
