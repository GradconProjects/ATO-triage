import { describe, expect, it } from 'vitest';
import { Q } from '@/src/questions/ids';
import { a, c, item, lineById, notSure, q, run } from './fixture';

describe('income', () => {
  it('salary from several employers', () => {
    const est = run([a(Q.emp.gross, c(50000), 'e1'), a(Q.emp.gross, c(10000), 'e2')]);
    expect(est.totals.assessableIncomeCents).toBe(c(60000));
    expect(lineById(est, 'income.salary@e2').amountCents).toBe(c(10000));
  });
  it('lump sums A (full), B (5%), D (excluded), E (income + LSPIA)', () => {
    const est = run([a(Q.emp.lumpA, c(2000), 'e1'), a(Q.emp.lumpB, c(10000), 'e1'), a(Q.emp.lumpD, c(30000), 'e1'), a(Q.emp.lumpE, c(5000), 'e1')]);
    expect(lineById(est, 'income.lump_a@e1').amountCents).toBe(c(2000));
    expect(lineById(est, 'income.lump_b@e1').amountCents).toBe(c(500));
    expect(lineById(est, 'income.lump_d@e1').status).toBe('excluded');
    expect(est.totals.assessableIncomeCents).toBe(c(7500));
    expect(lineById(est, 'offset.lspia').status).toBe('manual_review'); // >= 1,200 with no accrual years
  });
  it('dividends gross up franking credits and claim them as credits', () => {
    const est = run([a(Q.inv.divUnfranked, c(100), 'd1'), a(Q.inv.divFranked, c(700), 'd1'), a(Q.inv.divFrankingCredit, c(300), 'd1')], { items: [item('d1', 'dividend')] });
    expect(est.totals.assessableIncomeCents).toBe(c(1100));
    expect(est.totals.creditsCents).toBe(c(300));
  });
  it('interest by ownership share', () => {
    const est = run([a(Q.inv.interestAmount, c(1000), 'i1'), a(Q.inv.interestSharePct, 50, 'i1')], { items: [item('i1', 'interest_account')] });
    expect(est.totals.assessableIncomeCents).toBe(c(500));
    const full = run([a(Q.inv.interestAmount, c(1000), 'i1')], { items: [item('i1', 'interest_account')] });
    expect(full.totals.assessableIncomeCents).toBe(c(1000));
    expect(full.assumptions.some((s) => s.includes('100%'))).toBe(true);
  });
  it('trust: income and franking credits in, foreign income tracked', () => {
    const est = run([a(Q.inv.trustIncome, c(1000), 't1'), a(Q.inv.trustFrankingCredit, c(200), 't1'), a(Q.inv.trustForeignIncome, c(300), 't1')], { items: [item('t1', 'trust_dist')] });
    expect(est.totals.assessableIncomeCents).toBe(c(1500));
    expect(est.totals.creditsCents).toBe(c(200));
  });
  it('super income: taxed element at 60+ is tax-free, anything else -> review', () => {
    const free = run([a(Q.sup.amount, c(20000)), a(Q.sup.element, 'taxed'), a(Q.sup.age, 65)]);
    expect(lineById(free, 'income.super').status).toBe('excluded');
    expect(free.totals.assessableIncomeCents).toBe(0);
    const rev = run([a(Q.sup.amount, c(20000)), a(Q.sup.element, 'taxed'), a(Q.sup.age, 55)]);
    expect(lineById(rev, 'income.super').status).toBe('manual_review');
    expect(rev.uncertainInputs).toContain(Q.sup.amount);
  });
  it('compensation: weekly in, medical out, impairment reviewed', () => {
    const est = run([a(Q.comp.weeklyAmount, c(30000)), a(Q.comp.medicalAmount, c(2000)), a(Q.comp.impairmentAmount, c(50000)), a(Q.comp.incomeProtectionAmount, c(1000))]);
    expect(est.totals.assessableIncomeCents).toBe(c(31000));
    expect(lineById(est, `income.${Q.comp.medicalAmount}`).status).toBe('excluded');
    expect(lineById(est, `income.${Q.comp.impairmentAmount}`).status).toBe('manual_review');
    expect(est.manualReview.some((m) => m.questionIds.includes(Q.comp.impairmentAmount))).toBe(true);
    expect(est.moduleStatus['income']).toBe('manual_review');
  });
  it('business: net income, PSI risk and losses', () => {
    expect(run([a(Q.bus.income, c(50000)), a(Q.bus.expenses, c(10000)), a(Q.bus.psi80, 'no')]).totals.assessableIncomeCents).toBe(c(40000));
    const psi = run([a(Q.bus.income, c(50000)), a(Q.bus.expenses, c(10000)), a(Q.bus.psi80, 'yes'), a(Q.bus.psiResults, 'no')]);
    expect(lineById(psi, 'income.business').status).toBe('manual_review');
    const ok = run([a(Q.bus.income, c(50000)), a(Q.bus.expenses, c(10000)), a(Q.bus.psi80, 'yes'), a(Q.bus.psiResults, 'yes')]);
    expect(ok.totals.assessableIncomeCents).toBe(c(40000));
    const loss = run([a(Q.bus.income, c(5000)), a(Q.bus.expenses, c(10000)), a(Q.bus.psi80, 'no')]);
    // Loss with the non-commercial loss tests not answered: deferred (never deducted) and flagged to confirm.
    expect(lineById(loss, 'income.business').status).toBe('excluded');
    expect(loss.totals.assessableIncomeCents).toBe(0);
    expect(loss.manualReview.some((r) => r.module === 'business')).toBe(true);
    expect(loss.deferredLosses?.[0]).toMatchObject({ activityId: 'main', currentLossCents: c(5000), closingCents: c(5000), status: 'deferred' });
    const unsure = run([a(Q.bus.income, c(50000)), a(Q.bus.expenses, c(10000)), notSure(Q.bus.psi80)]);
    expect(lineById(unsure, 'income.business').status).toBe('manual_review');
  });
  it('partnership shares: positive in, negative reviewed, credits counted once (as a credit)', () => {
    const est = run([a(Q.bus.ptShare, c(2000), 'x1'), a(Q.bus.ptCredits, c(300), 'x1'), a(Q.bus.ptShare, c(-1000), 'x2')], { items: [item('x1', 'partnership_trust'), item('x2', 'partnership_trust', 1)] });
    // The share of net income already includes the franking credit.
    expect(est.totals.assessableIncomeCents).toBe(c(2000));
    expect(est.totals.creditsCents).toBe(c(300));
    expect(lineById(est, 'income.pt.share@x2').status).toBe('manual_review');
  });
  it('allowances by nature', () => {
    const items = [item('al1', 'allowance')];
    expect(run([a(Q.allow.amount, c(450), 'al1'), a(Q.allow.nature, 'allowance', 'al1'), a(Q.allow.type, 'tool', 'al1')], { items }).totals.assessableIncomeCents).toBe(c(450));
    const reimb = run([a(Q.allow.amount, c(450), 'al1'), a(Q.allow.nature, 'reimbursement', 'al1')], { items });
    expect(lineById(reimb, 'income.allowance@al1').status).toBe('excluded');
    expect(lineById(run([a(Q.allow.amount, c(450), 'al1'), notSure(Q.allow.nature, 'al1')], { items }), 'income.allowance@al1').status).toBe('manual_review');
    const unanswered = run([a(Q.allow.amount, c(450), 'al1')], { items });
    expect(lineById(unanswered, 'income.allowance@al1').status).toBe('manual_review');
    expect(unanswered.totals.assessableIncomeCents).toBe(0);
  });
  it('foreign income by residency', () => {
    const res = run([a(Q.res.status, 'resident_full'), a(Q.fgn.amount('employment'), c(10000))]);
    expect(res.totals.assessableIncomeCents).toBe(c(10000));
    expect(lineById(run([a(Q.res.status, 'temporary'), a(Q.fgn.amount('employment'), c(10000))]), `income.${Q.fgn.amount('employment')}`).status).toBe('manual_review');
    expect(lineById(run([a(Q.res.status, 'foreign_full'), a(Q.fgn.amount('employment'), c(10000))]), `income.${Q.fgn.amount('employment')}`).status).toBe('excluded');
  });
  it('government payments, tips, crypto income, ESS', () => {
    const est = run([a(Q.gov.amount('jobseeker'), c(5000)), a(Q.gov.amount('other'), c(100)), a(Q.chef.tipsAmount, c(2000)), a(Q.emp.otherPayTips, c(300)), a(Q.cgt.cryptoIncome, c(50)), a(Q.inv.essDiscount, c(400)), a(Q.emp.otherPayGifts, c(80))]);
    expect(est.totals.assessableIncomeCents).toBe(c(7350));
    expect(lineById(est, `income.${Q.gov.amount('other')}`).status).toBe('manual_review');
    expect(lineById(est, `income.${Q.inv.essDiscount}`).status).toBe('manual_review');
    expect(lineById(est, `income.${Q.emp.otherPayGifts}`).status).toBe('manual_review');
  });
  it('data-driven meta with byQuestion', () => {
    const questions = [q({ id: 'x.income', module: 'employment', income: { category: 'other_employment', treatment: { byQuestion: 'x.kind', map: { a: 'I', b: 'N' } } } }), q({ id: 'x.kind', type: 'single', module: 'employment' })];
    expect(run([a('x.income', c(100)), a('x.kind', 'a')], { questions }).totals.assessableIncomeCents).toBe(c(100));
    expect(lineById(run([a('x.income', c(100)), a('x.kind', 'b')], { questions }), 'income.x.income').status).toBe('excluded');
    expect(lineById(run([a('x.income', c(100))], { questions }), 'income.x.income').status).toBe('manual_review');
  });
  it('RFB and RESC are tracked but not income', () => {
    const est = run([a(Q.emp.gross, c(50000), 'e1'), a(Q.emp.rfb, c(5000), 'e1'), a(Q.emp.resc, c(3000), 'e1')]);
    expect(est.totals.assessableIncomeCents).toBe(c(50000));
  });
  it('nothing answered -> not applicable', () => {
    expect(run([]).moduleStatus['income']).toBe('not_applicable');
  });
});
