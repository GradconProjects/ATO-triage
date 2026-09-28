/**
 * Golden case 1 (Section 13): disability support worker, 2025-26.
 *   Salary $62,000 (tax withheld $11,000), 1,800 km client-to-client by cents per km,
 *   compulsory logo uniform $250, first NDIS screening check $130 (must be excluded),
 *   no private hospital cover.
 *
 * Hand working (2025-26 rule table: resident scale 0 / 16% over 18,200 / 30% over 45,000 with base 4,288;
 * car 88c/km; LITO 700 less 5c per $ between 37,500 and 45,000 (375) then 1.5c per $ over 45,000; Medicare 2%):
 *   car          1,800 x 0.88                              = 1,584.00
 *   uniform      compulsory logo uniform                   =   250.00
 *   NDIS check   first check to get the job                = excluded (N)
 *   taxable      62,000 - 1,584 - 250                      = 60,166.00
 *   gross tax    4,288 + 0.30 x (60,166 - 45,000)          = 4,288 + 4,549.80 = 8,837.80
 *   LITO         700 - 375 - 0.015 x (60,166 - 45,000)     = 325 - 227.49 = 97.51
 *                (the brief's "700 - 227.49 = 472.51" skipped the 37,500-45,000 taper; the ATO LITO at 60,166 is 97.51)
 *   Medicare     0.02 x 60,166                             = 1,203.32
 *   MLS          60,166 < tier 1 (101,000)                 = 0
 *   result       11,000 - (8,837.80 - 97.51 + 1,203.32)    = 11,000 - 9,943.61 = 1,056.39 refund
 */
import { describe, expect, it } from 'vitest';
import { Q } from '@/src/questions/ids';
import { a, c, item, lineById, runGolden } from './harness';

const E = 'e1';
const run = () =>
  runGolden({
    fy: '2025-26',
    items: [item(E, 'employer')],
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
      a(Q.emp.name, 'CareCo', E),
      a(Q.emp.occupation, 'disability_support_worker', E),
      a(Q.emp.dates, { from: '2025-07-01', to: '2026-06-30' }, E),
      a(Q.emp.gross, c(62000), E),
      a(Q.emp.withheld, c(11000), E),
      a(Q.emp.taxReady, 'yes', E),
      a(Q.emp.otherPay, ['none']),
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
      // DSW deep module
      a(Q.dsw.clientToClient, 'yes_own_car'),
      a(Q.dsw.homeToFirst, 'no'),
      a(Q.dsw.betweenEmployers, 'no'),
      a(Q.dsw.clientTransport, 'no'),
      a(Q.dsw.sleepover, 'no'),
      a(Q.dsw.clientCosts, 'no'),
      a(Q.dsw.clothing, ['compulsory_logo']),
      a('dsw.clothing.paid', 'paid_not_reimbursed'),
      a(Q.dsw.clothingAmount, c(250)),
      a('dsw.clothing.evidence', 'receipts'),
      a(Q.dsw.laundry, 'no'),
      a(Q.dsw.firstAid, 'none'),
      a(Q.dsw.checks, ['ndis_screening']),
      a(Q.dsw.checksStage, 'first_check'),
      a('dsw.checks.paid', 'paid_not_reimbursed'),
      a(Q.dsw.checksAmount, c(130)),
      a('dsw.checks.evidence', 'receipts'),
      a(Q.dsw.training, 'none'),
      a('dsw.conferences.any', 'no'),
      a(Q.dsw.phone, 'no'),
      a(Q.dsw.homeOffice, 'no'),
      a(Q.dsw.sun, 'no'),
      a(Q.dsw.vaccinations, 'no'),
      // Car (special module)
      a(Q.ded.carAny, 'yes'),
      a('ded.car.paid', 'paid_not_reimbursed'),
      a(Q.ded.carTripTypes, ['client_to_client']),
      a(Q.ded.carMethod, 'cents_per_km'),
      a(Q.ded.carKm, 1800),
      a('ded.car.evidence', 'diary'),
      // Remaining screens
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
    ],
  });

describe('golden 1: disability support worker 2025-26', () => {
  const { estimate: est, hiddenAnswered, rules } = run();

  it('uses the real bank: every answer given is visible', () => {
    expect(hiddenAnswered).toEqual([]);
    expect(rules.fy).toBe('2025-26');
    expect(rules.carCentsPerKm).toBe(88);
  });
  it('salary and withholding', () => {
    expect(lineById(est, `income.salary@${E}`).amountCents).toBe(c(62000));
    expect(lineById(est, `credit.${Q.emp.withheld}@${E}`).amountCents).toBe(c(11000));
    expect(est.totals.assessableIncomeCents).toBe(c(62000));
  });
  it('car: 1,800 km x 88c = $1,584.00', () => {
    const car = lineById(est, 'ded.car');
    expect(car.status).toBe('computed');
    expect(car.amountCents).toBe(c(1584));
    expect(car.inputs).toContain(Q.ded.carKm);
  });
  it('compulsory uniform $250 deductible', () => {
    const l = lineById(est, `ded.${Q.dsw.clothingAmount}`);
    expect(l.status).toBe('computed');
    expect(l.amountCents).toBe(c(250));
  });
  it('first NDIS screening check is excluded, not deducted', () => {
    const l = lineById(est, `ded.${Q.dsw.checksAmount}`);
    expect(l.status).toBe('excluded');
    expect(l.amountCents).toBe(c(130));
    expect(l.inputs).toContain(Q.dsw.checksStage);
  });
  it('totals', () => {
    expect(est.totals.deductionsCents).toBe(c(1834));
    expect(est.totals.workRelatedDeductionsCents).toBe(c(1834));
    expect(est.totals.taxableIncomeCents).toBe(c(60166));
    expect(lineById(est, 'tax.gross').amountCents).toBe(c(8837.8));
    expect(lineById(est, 'offset.lito').amountCents).toBe(c(97.51));
    expect(est.totals.offsetsCents).toBe(c(97.51));
    expect(lineById(est, 'medicare.levy').amountCents).toBe(c(1203.32));
    expect(est.totals.mlsCents).toBe(0);
    expect(est.totals.studyLoanCents).toBe(0);
    expect(est.totals.creditsCents).toBe(c(11000));
    expect(est.totals.resultCents).toBe(c(1056.39));
    expect(lineById(est, 'result').label).toBe('Estimated refund');
  });
  it('module status and review state', () => {
    expect(est.moduleStatus['car']).toBe('computed');
    expect(est.moduleStatus['deductions']).toBe('computed');
    expect(est.moduleStatus['income']).toBe('computed');
    expect(est.moduleStatus['laundry']).toBe('not_applicable');
    expect(est.manualReview).toEqual([]);
    expect(est.uncertainInputs).toEqual([]);
  });
});
