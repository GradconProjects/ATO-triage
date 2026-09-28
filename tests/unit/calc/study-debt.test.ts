import { describe, expect, it } from 'vitest';
import { repaymentFor } from '@/src/calc/modules/study-debt';
import { Q } from '@/src/questions/ids';
import { MARGINAL_LOAN, RULES, a, c, lineById, notSure, run } from './fixture';

describe('study loan: total_income_rate (2024-25 style)', () => {
  const cases: Array<[number, number]> = [
    [54434, 0],
    [54435, c(544.35)],
    [62850, c(628.5)],
    [62851, c(1257.02)],
    [100000, c(5500)],
    [159663, c(15167.99)], // 9.5% x 159,663 = 15,167.985
    [159664, c(15966.4)],
    [0, 0],
  ];
  for (const [income, rep] of cases) it(`$${income} -> ${rep}`, () => expect(repaymentFor(c(income), RULES.studyLoan)).toBe(rep));
});

describe('study loan: marginal (2025-26 style)', () => {
  const cases: Array<[number, number]> = [
    [67000, 0],
    [67001, 15],
    [100000, c(4950)],
    [125000, c(8700)],
    [125001, c(8700.17)],
    [179285, c(17928.45)],
    [179286, c(17928.6)],
    [250000, c(25000)],
  ];
  for (const [income, rep] of cases) it(`$${income} -> ${rep}`, () => expect(repaymentFor(c(income), MARGINAL_LOAN)).toBe(rep));
});

describe('study loan in the pipeline', () => {
  it('HELP debt on repayment income (taxable + RFB + RESC)', () => {
    const est = run([a(Q.loan.types, ['help']), a(Q.emp.gross, c(95000), 'e1'), a(Q.emp.rfb, c(3000), 'e1'), a(Q.emp.resc, c(2000), 'e1')]);
    expect(est.totals.studyLoanCents).toBe(c(5500)); // 100,000 x 5.5%
  });
  it('balance caps the repayment', () => {
    const est = run([a(Q.loan.types, ['help']), a(Q.loan.balance, c(2000)), a(Q.emp.gross, c(100000), 'e1')]);
    expect(est.totals.studyLoanCents).toBe(c(2000));
    expect(lineById(est, 'study_loan.repayment').note).toContain('capped');
  });
  it('no loan -> not applicable', () => {
    const est = run([a(Q.loan.types, ['none']), a(Q.emp.gross, c(100000), 'e1')]);
    expect(est.totals.studyLoanCents).toBe(0);
    expect(est.moduleStatus['study_loan']).toBe('not_applicable');
  });
  it('not sure -> review', () => {
    const est = run([notSure(Q.loan.types, null, true), a(Q.emp.gross, c(100000), 'e1')]);
    expect(est.moduleStatus['study_loan']).toBe('manual_review');
    expect(est.uncertainInputs).toContain(Q.loan.types);
  });
  it('marginal method through the pipeline', () => {
    const est = run([a(Q.loan.types, ['vsl']), a(Q.emp.gross, c(100000), 'e1')], { rules: { ...RULES, studyLoan: MARGINAL_LOAN } });
    expect(est.totals.studyLoanCents).toBe(c(4950));
  });
  it('below the threshold -> zero repayment, still computed', () => {
    const est = run([a(Q.loan.types, ['help']), a(Q.emp.gross, c(50000), 'e1')]);
    expect(est.totals.studyLoanCents).toBe(0);
    expect(est.moduleStatus['study_loan']).toBe('computed');
  });
});
