import { describe, expect, it } from 'vitest';
import { GROUPS, Q } from '@/src/questions/ids';
import { a, c, item, lineById, run } from './fixture';

const SIG = 'act-signals';
const items = [item('e1', GROUPS.employer), item(SIG, GROUPS.businessActivity)];
const salary = [a(Q.emp.gross, c(80000), 'e1'), a(Q.emp.withheld, c(18000), 'e1')];
const signals = (extra: ReturnType<typeof a>[] = []) => [
  a(Q.bus.activityAny, 'yes'),
  a(Q.bus.activityName, 'Trading signals', SIG),
  a(Q.bus.activityKind, 'trading_signals', SIG),
  a(Q.bus.activityIncome, 0, SIG),
  a(Q.bus.activityExpSubscriptions, c(1500), SIG),
  a(Q.bus.activityExpOther, c(6000), SIG),
  ...extra,
];

describe('separate business activities and deferred non-commercial losses', () => {
  it('a deferred $7,500 activity loss does not reduce current-year taxable income', () => {
    const est = run([...salary, ...signals([a(Q.bus.activityLossTests, ['none'], SIG)])], { items });
    expect(est.totals.taxableIncomeCents).toBe(c(80000));
    const line = lineById(est, `income.business.activity@${SIG}`);
    expect(line.status).toBe('excluded');
    expect(line.amountCents).toBe(-c(7500));
    expect(est.deferredLosses).toEqual([
      { activityId: SIG, activity: 'Trading signals', openingCents: 0, currentLossCents: c(7500), usedCents: 0, closingCents: c(7500), status: 'deferred' },
    ]);
  });

  it('the $1,500 signals subscription appears once, inside its activity, and never as a separate deduction or loss', () => {
    const est = run([...salary, ...signals([a(Q.bus.activityLossTests, ['none'], SIG)])], { items });
    const mentions = est.lines.filter((l) => l.formula.includes('subscriptions 15') || l.amountCents === c(1500) || l.amountCents === -c(1500));
    expect(mentions).toHaveLength(1);
    expect(mentions[0]!.id).toBe(`income.business.activity@${SIG}`);
    expect(est.lines.filter((l) => l.section === 'deductions')).toHaveLength(0);
    expect(est.totals.deductionsCents).toBe(0);
    // The deferred balance is the activity's net loss (subscription included once), not subscription + loss.
    expect(est.deferredLosses?.[0]?.closingCents).toBe(c(7500));
  });

  it('prior-year capital losses stay separate from deferred business losses', () => {
    const est = run([...salary, ...signals([a(Q.bus.activityLossTests, ['none'], SIG), a(Q.bus.activityPriorDeferred, c(2000), SIG)]), a(Q.cgt.priorLosses, c(11000))], { items });
    expect(est.totals.capitalLossCarriedForwardCents).toBe(c(11000));
    expect(est.deferredLosses?.[0]).toMatchObject({ openingCents: c(2000), closingCents: c(9500) });
    expect(est.totals.taxableIncomeCents).toBe(c(80000));
  });

  it('an earlier deferred loss is used only against the same activity\'s profit', () => {
    const profit = [a(Q.bus.activityAny, 'yes'), a(Q.bus.activityName, 'Trading signals', SIG), a(Q.bus.activityIncome, c(5000), SIG), a(Q.bus.activityExpSubscriptions, c(1500), SIG), a(Q.bus.activityPriorDeferred, c(7500), SIG)];
    const est = run([...salary, ...profit], { items });
    expect(lineById(est, `income.business.activity@${SIG}`).amountCents).toBe(0);
    expect(est.totals.taxableIncomeCents).toBe(c(80000));
    expect(est.deferredLosses?.[0]).toMatchObject({ usedCents: c(3500), closingCents: c(4000), status: 'none' });
  });

  it('a ticked loss test sends the loss to review instead of deducting it', () => {
    const est = run([...salary, ...signals([a(Q.bus.activityLossTests, ['income_20k'], SIG)])], { items });
    expect(lineById(est, `income.business.activity@${SIG}`).status).toBe('manual_review');
    expect(est.totals.taxableIncomeCents).toBe(c(80000));
    expect(est.deferredLosses?.[0]?.status).toBe('review');
  });

  it('a case saved before this change (main business only) calculates as before', () => {
    const est = run([...salary, a(Q.bus.soleTrader, 'yes'), a(Q.bus.income, c(25000)), a(Q.bus.expenses, c(2500)), a(Q.bus.psi80, 'no')], { items: [item('e1', GROUPS.employer)] });
    expect(lineById(est, 'income.business').amountCents).toBe(c(22500));
    expect(est.totals.assessableIncomeCents).toBe(c(102500));
  });
});
