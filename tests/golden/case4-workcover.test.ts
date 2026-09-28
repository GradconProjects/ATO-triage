/**
 * Golden case 4 (Section 13): WorkCover recipient, 2024-25.
 *   $30,000 weekly payments (withheld $5,000), $14,000 arrears as Lump Sum E accrued over 2022-23 ($8,000, taxable
 *   income then $10,000) and 2023-24 ($6,000, taxable income then $12,000), and a $50,000 permanent impairment lump
 *   sum (must be excluded and flagged). No hospital cover, no employer.
 *
 * Hand working (2024-25: 16% over 18,200; LITO 700 less 5c per $ over 37,500; Medicare 2%):
 *   income       30,000 weekly + 14,000 arrears                          = 44,000.00 (impairment excluded -> review)
 *   gross tax    0.16 x (44,000 - 18,200)                                =  4,128.00
 *   LITO         700 - 0.05 x (44,000 - 37,500)                          =    375.00
 *   LSPIA        tax now with arrears - tax without = 4,128 - 0.16 x 11,800 (1,888) = 2,240.00
 *                notional: 2022-23 tax(18,000) - tax(10,000) = 0 (no 2022-23 table: 2024-25 scale used, noted);
 *                          2023-24 tax(18,000) - tax(12,000) = 0 (2023-24 table, threshold 18,200)
 *                offset = 2,240 - 0                                      =  2,240.00
 *   offsets      375 + 2,240 = 2,615 (< gross tax 4,128)
 *   tax after    4,128 - 2,615                                           =  1,513.00
 *   Medicare     0.02 x 44,000                                           =    880.00
 *   MLS          44,000 < 97,000                                         =      0
 *   result       5,000 - (1,513 + 880)                                   =  2,607.00 refund
 */
import { describe, expect, it } from 'vitest';
import { Q } from '@/src/questions/ids';
import { a, c, item, lineById, runGolden } from './harness';

const run = () =>
  runGolden({
    fy: '2024-25',
    items: [item('y1', 'lump_sum_e_year', 0), item('y2', 'lump_sum_e_year', 1)],
    answers: [
      a(Q.core.fy, '2024-25'),
      a(Q.core.purpose, 'pre_lodgment'),
      a(Q.core.lodged, 'no'),
      a(Q.res.status, 'resident_full'),
      a(Q.res.dual, 'no'),
      a(Q.fam.spouse, 'no'),
      a(Q.fam.dependantsCount, 0),
      a(Q.med.exemption, 'entitled_full'),
      a(Q.phi.cover, 'none'),
      a(Q.emp.otherPay, ['none']),
      a(Q.allow.any, 'no'),
      a(Q.comp.received, ['weekly', 'arrears', 'impairment']),
      a(Q.comp.weeklyAmount, c(30000)),
      a(Q.comp.weeklyWithheld, c(5000)),
      a(Q.comp.arrearsAmount, c(14000)),
      a('comp.arrears.date', '2025-03-01'),
      a(Q.comp.impairmentAmount, c(50000)),
      a(Q.comp.lseFy, '2022-23', 'y1'),
      a(Q.comp.lseAmount, c(8000), 'y1'),
      a(Q.comp.lseOver12m, 'yes', 'y1'),
      a(Q.comp.lseTaxableIncome, c(10000), 'y1'),
      a(Q.comp.lseFy, '2023-24', 'y2'),
      a(Q.comp.lseAmount, c(6000), 'y2'),
      a(Q.comp.lseOver12m, 'yes', 'y2'),
      a(Q.comp.lseTaxableIncome, c(12000), 'y2'),
      a(Q.comp.etpReceived, ['none']),
      a(Q.gov.received, ['none']),
      a(Q.sup.received, 'no'),
      a(Q.inv.interestAny, 'no'),
      a(Q.inv.divAny, 'no'),
      a(Q.inv.trustAny, 'no'),
      a(Q.inv.ess, 'no'),
      a(Q.rent.any, 'no'),
      a(Q.cgt.events, ['none']),
      a(Q.fgn.received, ['none']),
      a(Q.bus.soleTrader, 'no'),
      a(Q.bus.ptAny, 'no'),
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
    ],
  });

describe('golden 4: WorkCover recipient 2024-25', () => {
  const { estimate: est, hiddenAnswered } = run();

  it('every answer given is visible', () => {
    expect(hiddenAnswered).toEqual([]);
  });
  it('weekly payments and arrears are income', () => {
    expect(lineById(est, `income.${Q.comp.weeklyAmount}`).amountCents).toBe(c(30000));
    expect(lineById(est, `income.${Q.comp.arrearsAmount}`).amountCents).toBe(c(14000));
    expect(est.totals.assessableIncomeCents).toBe(c(44000));
  });
  it('impairment lump sum is excluded from income and flagged for manual review', () => {
    const l = lineById(est, `income.${Q.comp.impairmentAmount}`);
    expect(l.status).toBe('manual_review');
    expect(l.amountCents).toBe(c(50000));
    expect(est.manualReview.some((m) => m.module === 'income' && m.questionIds.includes(Q.comp.impairmentAmount) && m.amountCents === c(50000))).toBe(true);
    expect(est.uncertainInputs).toContain(Q.comp.impairmentAmount);
    expect(est.moduleStatus['income']).toBe('manual_review');
  });
  it('LSPIA offset = 2,240.00 with the earlier years notional tax of nil', () => {
    const l = lineById(est, 'offset.lspia');
    expect(l.status).toBe('computed');
    expect(l.amountCents).toBe(c(2240));
    expect(l.detail?.['currentYearExtraTaxCents']).toBe(c(2240));
    expect(l.detail?.['notionalTaxCents']).toBe(0);
    expect(est.assumptions.some((s) => s.includes('no rule table for 2022-23'))).toBe(true);
    expect(est.moduleStatus['lspia']).toBe('computed');
  });
  it('totals', () => {
    expect(est.totals.taxableIncomeCents).toBe(c(44000));
    expect(lineById(est, 'tax.gross').amountCents).toBe(c(4128));
    expect(lineById(est, 'offset.lito').amountCents).toBe(c(375));
    expect(est.totals.offsetsCents).toBe(c(2615));
    expect(est.totals.taxAfterOffsetsCents).toBe(c(1513));
    expect(lineById(est, 'medicare.levy').amountCents).toBe(c(880));
    expect(est.totals.mlsCents).toBe(0);
    expect(est.totals.creditsCents).toBe(c(5000));
    expect(lineById(est, `credit.${Q.comp.weeklyWithheld}`).amountCents).toBe(c(5000));
    expect(est.totals.resultCents).toBe(c(2607));
  });
});
