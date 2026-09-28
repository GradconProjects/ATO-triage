/**
 * Golden case 3 (Section 13): chef, 2025-26.
 *   Salary $54,000 (withheld $8,500) plus $2,000 tips, knives $380 (bought 15 Aug 2025, 5-year life) and $120,
 *   chef jacket + checked pants $260, laundry 3 work-only loads a week for 48 weeks, first food-safety certificate
 *   $150 (must be excluded). No hospital cover.
 *
 * Hand working:
 *   tips         income                                                  =  2,000.00
 *   knife $380   380 x (200% / 5) x 320/365 days (15 Aug - 30 Jun)      =    133.26  (13,326.03c)
 *   knife $120   under $300: immediate                                   =    120.00
 *   clothing     jacket + checked pants (occupation-specific)            =    260.00
 *   laundry      3 loads x $1.00 x 48 weeks                              =    144.00
 *   certificate  first certificate to get the job                        = excluded (N)
 *   deductions                                                           =    657.26
 *   taxable      56,000 - 657.26 = 55,342.74 -> rounded down             = 55,342.00
 *   gross tax    4,288 + 0.30 x (55,342 - 45,000)                        =  7,390.60
 *   LITO         325 - 0.015 x 10,342 (155.13)                           =    169.87
 *   Medicare     0.02 x 55,342                                           =  1,106.84
 *   MLS          55,342 < 101,000                                        =      0
 *   result       8,500 - (7,390.60 - 169.87 + 1,106.84)                  =    172.43 refund
 */
import { describe, expect, it } from 'vitest';
import { Q } from '@/src/questions/ids';
import { a, c, item, lineById, runGolden } from './harness';

const E = 'e1';
const run = () =>
  runGolden({
    fy: '2025-26',
    items: [item(E, 'employer'), item('t1', 'tool_item', 0), item('t2', 'tool_item', 1)],
    answers: [
      a(Q.core.fy, '2025-26'),
      a(Q.core.purpose, 'pre_lodgment'),
      a(Q.core.lodged, 'no'),
      a(Q.res.status, 'resident_full'),
      a(Q.res.dual, 'no'),
      a(Q.fam.spouse, 'no'),
      a(Q.fam.dependantsCount, 0),
      a(Q.med.exemption, 'entitled_full'),
      a(Q.phi.cover, 'none'),
      a(Q.emp.name, 'Bistro', E),
      a(Q.emp.occupation, 'chef', E),
      a(Q.emp.dates, { from: '2025-07-01', to: '2026-06-30' }, E),
      a(Q.emp.gross, c(54000), E),
      a(Q.emp.withheld, c(8500), E),
      a(Q.emp.taxReady, 'yes', E),
      a(Q.emp.otherPay, ['tips']),
      a(Q.emp.otherPayTips, c(2000)),
      a(Q.allow.any, 'no'),
      a(Q.comp.received, ['none']),
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
      // Chef deep module
      a(Q.chef.knivesAny, 'yes'),
      a('chef.sharpening.any', 'no'),
      a(Q.chef.clothing, ['jacket', 'checked_pants']),
      a('chef.clothing.paid', 'paid_not_reimbursed'),
      a(Q.chef.clothingAmount, c(260)),
      a('chef.clothing.evidence', 'receipts'),
      a(Q.chef.laundry, 'yes'),
      a(Q.chef.travelBetweenJobs, 'no'),
      a(Q.chef.homeToWork, 'yes'),
      a(Q.chef.certificates, ['food_safety']),
      a(Q.chef.certStage, 'first'),
      a('chef.certificates.paid', 'paid_not_reimbursed'),
      a(Q.chef.certAmount, c(150)),
      a('chef.certificates.evidence', 'receipts'),
      a(Q.chef.courses, 'none'),
      a(Q.chef.mealsAtWork, 'no'),
      a(Q.chef.overtimeMealAllowance, 'no'),
      // Knives (tool repeater)
      a(Q.ded.toolItem, 'Chef knife', 't1'),
      a(Q.ded.toolPaid, 'paid_not_reimbursed', 't1'),
      a(Q.ded.toolCost, c(380), 't1'),
      a(Q.ded.toolDate, '2025-08-15', 't1'),
      a(Q.ded.toolWorkPct, 100, 't1'),
      a('ded.tool.work_pct_method', 'diary', 't1'),
      a(Q.ded.toolEvidence, 'receipts', 't1'),
      a(Q.ded.toolEffectiveLife, 5, 't1'),
      a(Q.ded.toolItem, 'Paring knife', 't2'),
      a(Q.ded.toolPaid, 'paid_not_reimbursed', 't2'),
      a(Q.ded.toolCost, c(120), 't2'),
      a(Q.ded.toolDate, '2025-08-15', 't2'),
      a(Q.ded.toolWorkPct, 100, 't2'),
      a('ded.tool.work_pct_method', 'diary', 't2'),
      a(Q.ded.toolEvidence, 'receipts', 't2'),
      // Laundry (shared fields)
      a('ded.laundry.paid', 'paid_not_reimbursed'),
      a(Q.ded.laundryLoadsWorkOnly, 3),
      a(Q.ded.laundryLoadsMixed, 0),
      a(Q.ded.laundryWeeks, 48),
      a(Q.ded.laundryEvidence, 'diary'),
      // Remaining screens
      a(Q.ded.carAny, 'no'),
      a('ded.travel.any', 'no'),
      a('ded.selfed.any', 'no'),
      a('ded.subscriptions.any', 'no'),
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

describe('golden 3: chef 2025-26', () => {
  const { estimate: est, hiddenAnswered } = run();

  it('every answer given is visible', () => {
    expect(hiddenAnswered).toEqual([]);
  });
  it('salary plus tips', () => {
    expect(lineById(est, `income.${Q.emp.otherPayTips}`).amountCents).toBe(c(2000));
    expect(est.totals.assessableIncomeCents).toBe(c(56000));
  });
  it('knives: $380 over its life, $120 immediately', () => {
    expect(lineById(est, `ded.${Q.ded.toolCost}@t1`).amountCents).toBe(13326);
    expect(lineById(est, `ded.${Q.ded.toolCost}@t1`).detail?.['daysHeld']).toBe(320);
    expect(lineById(est, `ded.${Q.ded.toolCost}@t2`).amountCents).toBe(c(120));
  });
  it('chef whites deductible', () => {
    expect(lineById(est, `ded.${Q.chef.clothingAmount}`).amountCents).toBe(c(260));
  });
  it('laundry 3 x $1 x 48 weeks = $144', () => {
    const l = lineById(est, 'ded.laundry');
    expect(l.status).toBe('computed');
    expect(l.amountCents).toBe(c(144));
  });
  it('first food-safety certificate excluded', () => {
    const l = lineById(est, `ded.${Q.chef.certAmount}`);
    expect(l.status).toBe('excluded');
    expect(l.amountCents).toBe(c(150));
  });
  it('totals', () => {
    expect(est.totals.deductionsCents).toBe(65726);
    expect(est.totals.taxableIncomeCents).toBe(c(55342));
    expect(lineById(est, 'tax.gross').amountCents).toBe(c(7390.6));
    expect(lineById(est, 'offset.lito').amountCents).toBe(c(169.87));
    expect(lineById(est, 'medicare.levy').amountCents).toBe(c(1106.84));
    expect(est.totals.mlsCents).toBe(0);
    expect(est.totals.resultCents).toBe(c(172.43));
    expect(lineById(est, 'result').label).toBe('Estimated refund');
    expect(est.manualReview).toEqual([]);
  });
});
