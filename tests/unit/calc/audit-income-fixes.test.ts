import { describe, expect, it } from 'vitest';
import { Q } from '@/src/questions/ids';
import { a, c, item, lineById, run } from './fixture';
import { runGolden } from '../../golden/harness';

describe('audit fixes: income', () => {
  it('disaster and veterans payments are flagged for review (counted provisionally)', () => {
    const est = run([a(Q.gov.amount('disaster'), c(1000)), a(Q.gov.amount('veterans'), c(20000))]);
    expect(est.totals.provisionalIncomeCents).toBe(c(21000));
    expect(lineById(est, `income.${Q.gov.amount('veterans')}`).status).toBe('manual_review');
  });
  it('pension type decides the treatment', () => {
    const dsp = run([a(Q.gov.pensionKind, 'dsp_under_age'), a(Q.gov.amount('pension'), c(25000))]);
    expect(lineById(dsp, `income.${Q.gov.amount('pension')}`).status).toBe('excluded');
    const age = run([a(Q.gov.pensionKind, 'age_pension'), a(Q.gov.amount('pension'), c(25000))]);
    expect(age.totals.assessableIncomeCents).toBe(c(25000));
    const unknown = run([a(Q.gov.amount('pension'), c(25000))]);
    expect(lineById(unknown, `income.${Q.gov.amount('pension')}`).status).toBe('manual_review');
  });
  it('a weekly gross smaller than the arrears it includes is reviewed', () => {
    const est = run([a(Q.comp.weeklyAmount, c(5000)), a(Q.comp.weeklyIncludesArrears, 'yes'), a(Q.comp.arrearsAmount, c(8000))]);
    expect(lineById(est, `income.${Q.comp.weeklyAmount}`).status).toBe('manual_review');
    expect(est.lines.every((l) => l.amountCents >= 0 || l.section !== 'income' || l.status !== 'computed')).toBe(true);
  });
  it('PSI: no tests passed means review', () => {
    const est = run([a(Q.bus.soleTrader, 'yes'), a(Q.bus.income, c(80000)), a(Q.bus.psi80, 'no'), a(Q.bus.psiResults, 'no'), a(Q.bus.psiUnrelated, 'no')]);
    expect(lineById(est, 'income.business').status).toBe('manual_review');
    const passed = run([a(Q.bus.soleTrader, 'yes'), a(Q.bus.income, c(80000)), a(Q.bus.psi80, 'no'), a(Q.bus.psiResults, 'no'), a(Q.bus.psiUnrelated, 'yes')]);
    expect(lineById(passed, 'income.business').status).toBe('computed');
  });
  it('LAFHA is reviewed', () => {
    const est = run([a(Q.allow.type, 'lafha', 'al1'), a(Q.allow.nature, 'allowance', 'al1'), a(Q.allow.amount, c(15000), 'al1')], { items: [item('al1', 'allowance')] });
    expect(lineById(est, 'income.allowance@al1').status).toBe('manual_review');
  });
  it('arrears years are asked for an employer Lump Sum E', () => {
    const g = runGolden({ fy: '2025-26', items: [item('e1', 'employer'), item('y1', 'lump_sum_e_year')], answers: [a(Q.core.fy, '2025-26'), a(Q.emp.lumpE, c(10000), 'e1')] });
    expect(g.input.visible.has(`${Q.comp.lseAmount}@y1`)).toBe(true);
  });
  it('other foreign income is reviewed', () => {
    const est = run([a(Q.res.status, 'resident_full'), a(Q.fgn.amount('other'), c(1000))]);
    expect(lineById(est, `income.${Q.fgn.amount('other')}`).status).toBe('manual_review');
    expect(est.totals.provisionalIncomeCents).toBe(c(1000));
  });
});
