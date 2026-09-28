import { Q } from '../../questions/ids';
import type { RuleSet } from '../../rules/schema';
import { dollarsToCents, mulRate } from '../money';
import type { CalcContext } from '../context';

export const REAL_LOAN_TYPES = ['help', 'vsl', 'ssl', 'abstudy_ssl', 'aasl'] as const;

/**
 * Compulsory repayment for a repayment income (cents).
 * Bands follow the tax-bracket convention: `from` inclusive in whole dollars, so a band covers
 * (from - 1) < income <= to. The band chosen is the last one whose lower bound is below the income.
 * - total_income_rate: rate x whole repayment income.
 * - marginal: base + rate x (income - (from - 1)); a band with `wholeIncome: true` is rate x whole income.
 */
export function repaymentFor(incomeCents: number, studyLoan: RuleSet['studyLoan']): number {
  const bands = [...studyLoan.bands].sort((a, b) => a.from - b.from);
  let band: (typeof bands)[number] | undefined;
  for (const b of bands) {
    const lower = b.from === 0 ? 0 : dollarsToCents(b.from - 1);
    if (lower < incomeCents) band = b;
  }
  if (!band || band.rate === 0) return 0;
  if (studyLoan.method === 'total_income_rate' || band.wholeIncome) return mulRate(incomeCents, band.rate);
  const lower = band.from === 0 ? 0 : dollarsToCents(band.from - 1);
  return dollarsToCents(band.base ?? 0) + mulRate(incomeCents - lower, band.rate);
}

export function hasRealLoan(cx: CalcContext): boolean {
  const types = cx.a.list(Q.loan.types) ?? [];
  return types.some((t) => (REAL_LOAN_TYPES as readonly string[]).includes(t));
}

/** Step 7: study and training loan repayment. Repayment income = taxable + RFB + RESC + net investment loss (0). */
export function computeStudyLoan(cx: CalcContext, taxableCents: number, rfbCents: number, rescCents: number): number {
  const rules = cx.rules;
  if (!hasRealLoan(cx)) {
    if (cx.a.isNotSure(Q.loan.types)) {
      cx.setStatus('study_loan', 'manual_review');
      cx.review('study_loan', 'Not sure whether there is a study or training loan; a compulsory repayment may apply.', [Q.loan.types]);
      cx.markUncertain(Q.loan.types);
    } else {
      cx.setStatus('study_loan', 'not_applicable');
    }
    return 0;
  }
  const income = taxableCents + rfbCents + rescCents;
  let repayment = repaymentFor(income, rules.studyLoan);
  const balance = cx.a.cents(Q.loan.balance);
  let note: string | undefined;
  if (balance !== undefined && repayment > balance) {
    repayment = Math.max(0, balance);
    note = 'Repayment capped at the loan balance.';
  }
  cx.setStatus('study_loan', 'computed');
  cx.lines.computed({
    id: 'study_loan.repayment',
    section: 'study_loan',
    label: 'Study and training loan compulsory repayment',
    amountCents: repayment,
    ruleId: `${rules.fy}.studyLoan`,
    inputs: [Q.loan.types, Q.loan.balance],
    formula: `${rules.studyLoan.method} bands on repayment income ${income / 100} (taxable ${taxableCents / 100} + RFB ${rfbCents / 100} + RESC ${rescCents / 100})`,
    ...(note ? { note } : {}),
  });
  return repayment;
}
