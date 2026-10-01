/**
 * Golden case 7 (regression, spec section 17): support worker on WorkCover with arrears, a futures
 * and trading-signals activity, and capital losses carried forward from derivatives, 2025-26.
 *   Employment 46,522.03 (withheld 9,748). WorkCover weekly payments 186,754 gross (withheld 60,793).
 *   Lump sum in arrears 58,753: 15,960 for 2023-24 (taxable income then 20,499) and 42,793 for 2024-25
 *   (taxable income then 79,854).
 *   Activity: futures trading losses 6,000 plus signal subscriptions 1,500, no other income, no
 *   non-commercial loss test met -> 7,500 deferred, not deducted from other income. The 1,500 is
 *   counted once, inside the activity.
 *   Earlier capital losses 11,000 from derivatives: kept separate from deferred business losses and
 *   flagged for classification.
 *
 * Checks (no profile-specific logic): withholding counted once (70,541); whether the weekly gross
 * already includes the arrears decides whether the arrears are added again; LSPIA is provisional and
 * uses the 2023-24 and 2024-25 rule tables; the s 9A Medicare exemption fails the 10% test.
 */
import { describe, expect, it } from 'vitest';
import { Q } from '@/src/questions/ids';
import { a, c, item, lineById, runGolden, type A } from './harness';

const ITEMS = [item('e1', 'employer'), item('y1', 'lump_sum_e_year', 0), item('y2', 'lump_sum_e_year', 1), item('b1', 'business_activity')];

const ANSWERS: A[] = [
  a(Q.core.fy, '2025-26'),
  a(Q.core.purpose, 'pre_lodgment'),
  a(Q.core.lodged, 'no'),
  a(Q.res.status, 'resident_full'),
  a(Q.res.dual, 'no'),
  a(Q.fam.spouse, 'no'),
  a(Q.fam.dependantsCount, 0),
  a(Q.med.exemption, 'entitled_full'),
  a(Q.phi.cover, 'whole_year'),
  a(Q.emp.name, 'Support Services', 'e1'),
  a(Q.emp.occupation, 'disability_support_worker', 'e1'),
  a(Q.emp.dates, { from: '2025-07-01', to: '2026-06-30' }, 'e1'),
  a(Q.emp.gross, c(46522.03), 'e1'),
  a(Q.emp.withheld, c(9748), 'e1'),
  a(Q.emp.taxReady, 'yes', 'e1'),
  a(Q.emp.otherPay, ['none']),
  a(Q.allow.any, 'no'),
  a(Q.comp.received, ['weekly', 'arrears']),
  a(Q.comp.weeklyAmount, c(186754)),
  a(Q.comp.weeklyWithheld, c(60793)),
  a(Q.comp.weeklyIncludesArrears, 'yes'),
  a(Q.comp.arrearsAmount, c(58753)),
  a('comp.arrears.date', '2025-10-14'),
  a(Q.comp.lseFy, '2023-24', 'y1'),
  a(Q.comp.lseAmount, c(15960), 'y1'),
  a(Q.comp.lseOver12m, 'yes', 'y1'),
  a(Q.comp.lseTaxableIncome, c(20499), 'y1'),
  a(Q.comp.lseFy, '2024-25', 'y2'),
  a(Q.comp.lseAmount, c(42793), 'y2'),
  a(Q.comp.lseOver12m, 'yes', 'y2'),
  a(Q.comp.lseTaxableIncome, c(79854), 'y2'),
  a(Q.comp.etpReceived, ['none']),
  a(Q.gov.received, ['none']),
  a(Q.sup.received, 'no'),
  a(Q.inv.interestAny, 'no'),
  a(Q.inv.divAny, 'no'),
  a(Q.inv.trustAny, 'no'),
  a(Q.inv.ess, 'no'),
  a(Q.rent.any, 'no'),
  a(Q.cgt.events, ['none']),
  a(Q.cgt.priorLossesAny, 'yes'),
  a(Q.cgt.priorLosses, c(11000)),
  a(Q.cgt.priorLossesOrigin, ['derivatives']),
  a(Q.cgt.derivativesAny, 'yes'),
  a(Q.cgt.derivativesNature, 'business'),
  a(Q.fgn.received, ['none']),
  a(Q.bus.soleTrader, 'no'),
  a(Q.bus.ptAny, 'no'),
  a(Q.bus.activityAny, 'yes'),
  a(Q.bus.activityName, 'Futures and signals', 'b1'),
  a(Q.bus.activityKind, 'derivatives_trading', 'b1'),
  a(Q.bus.activityIncome, 0, 'b1'),
  a(Q.bus.activityExpSubscriptions, c(1500), 'b1'),
  a(Q.bus.activityExpOther, c(6000), 'b1'),
  a(Q.bus.activityLossTests, ['none'], 'b1'),
  a(Q.ded.carAny, 'no'),
  a('ded.travel.any', 'no'),
  a('ded.selfed.any', 'no'),
  a('ded.tax_affairs.any', 'no'),
  a('ded.gifts.any', 'no'),
  a('ded.income_protection.any', 'no'),
  a('ded.investment.any', 'no'),
  a(Q.supc.personalAny, 'no'),
  a('off.payg_instalments.any', 'no'),
  a(Q.off.zone, 'none'),
  a(Q.off.invalidCarer, 'no'),
  a(Q.off.saptoEligible, 'no'),
  a('off.fito.any', 'no'),
  a(Q.loan.types, ['none']),
];

const run = (over: A[] = []) => {
  const m = new Map<string, A>();
  for (const x of [...ANSWERS, ...over]) m.set(`${x.id}@${x.item ?? ''}`, x);
  return runGolden({ fy: '2025-26', items: ITEMS, answers: [...m.values()], profileOccupations: ['disability_support_worker'] });
};

describe('golden 7: WorkCover arrears, trading activity, derivative capital losses', () => {
  const { estimate: est, hiddenAnswered } = run();

  it('every answer given is visible', () => {
    expect(hiddenAnswered).toEqual([]);
  });
  it('withholding is counted once: 9,748 + 60,793 = 70,541', () => {
    expect(est.totals.creditsCents).toBe(c(70541));
    expect(est.lines.filter((l) => l.section === 'credits')).toHaveLength(2);
  });
  it('arrears inside the weekly gross are not added twice', () => {
    expect(lineById(est, `income.${Q.comp.weeklyAmount}`).amountCents).toBe(c(186754 - 58753));
    expect(lineById(est, `income.${Q.comp.arrearsAmount}`).amountCents).toBe(c(58753));
    expect(est.totals.assessableIncomeCents).toBe(c(46522.03 + 186754));
  });
  it('weekly gross that excludes the arrears: the arrears are added', () => {
    const { estimate } = run([a(Q.comp.weeklyIncludesArrears, 'no')]);
    expect(estimate.totals.assessableIncomeCents).toBe(c(46522.03 + 186754 + 58753));
  });
  it('not knowing whether the gross includes the arrears is review, not a guess', () => {
    const { estimate } = run([{ ...a(Q.comp.weeklyIncludesArrears, 'not_sure'), state: 'not_sure' }]);
    expect(estimate.manualReview.some((r) => r.questionIds.includes(Q.comp.weeklyIncludesArrears))).toBe(true);
  });
  it('LSPIA is provisional and uses each accrual year\'s own rule table', () => {
    const l = lineById(est, 'offset.lspia');
    expect(l.status).toBe('computed');
    expect(l.provisional).toBe(true);
    expect(l.formula).toContain('2023-24 (2023-24.');
    expect(l.formula).toContain('2024-25 (2024-25.');
    expect(est.manualReview.some((r) => r.module === 'lspia' && /not the statutory figure/.test(r.reason))).toBe(true);
  });
  it('a missing historical rule table is review, never the current year\'s rules', () => {
    const { estimate } = run([a(Q.comp.lseFy, '2021-22', 'y1')]);
    expect(lineById(estimate, 'offset.lspia').status).toBe('manual_review');
  });
  it('s 9A Medicare exemption not applied: earlier-year income plus arrears is above the phase-in limit', () => {
    expect(lineById(est, 'medicare.levy').amountCents).toBe(c(233276 * 0.02));
    expect(lineById(est, 'medicare.levy').formula).not.toContain('s 9A');
  });
  it('the trading activity loss is deferred, not deducted from other income', () => {
    const l = lineById(est, 'income.business.activity@b1');
    expect(l.status).toBe('excluded');
    expect(est.totals.taxableIncomeCents).toBe(c(233276));
    expect(est.deferredLosses).toEqual([expect.objectContaining({ activityId: 'b1', currentLossCents: c(7500), closingCents: c(7500), status: 'deferred' })]);
  });
  it('the signal subscriptions are counted once, inside the activity', () => {
    const hits = est.lines.filter((l) => l.amountCents === c(1500) || (l.formula ?? '').includes('subscriptions 1500'));
    expect(hits).toHaveLength(1);
    expect(est.totals.deductionsCents).toBe(0);
  });
  it('earlier capital losses stay separate from deferred business losses', () => {
    expect(est.totals.capitalLossCarriedForwardCents).toBe(c(11000));
    expect(est.totals.carriedForwardLossCents).toBe(0);
  });
  it('totals', () => {
    expect(lineById(est, 'tax.gross').amountCents).toBe(c(71112.2));
    expect(est.totals.mlsCents).toBe(0);
    expect(est.totals.resultCents).toBe(est.totals.creditsCents - (est.totals.taxAfterOffsetsCents + est.totals.medicareLevyCents));
  });
});

describe('golden 7: review flags', () => {
  it('flags the derivative-origin capital losses for classification and lowers confidence', async () => {
    const { runIntelligence } = await import('@/src/intelligence');
    const { calculate } = await import('@/src/calc');
    const { input, estimate } = run();
    const res = runIntelligence(input, estimate, calculate);
    const codes = res.flags.map((f) => f.code);
    expect(codes).toContain('PRIOR_LOSS_CLASSIFICATION');
    expect(codes).not.toContain('DERIVATIVES_BUSINESS_MISSING');
    expect(res.confidence).not.toBe('high');
    expect(res.canFinalise).toBe(false);
  });
});
