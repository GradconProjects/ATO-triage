/**
 * Golden case 2 (Section 13): construction labourer, 2025-26.
 *   Salary $88,000 (withheld $19,000), $450 tool allowance, tools $1,250 (a $1,000 drill bought 1 Sep 2025 with a
 *   5-year effective life, and $250 of hand tools), steel caps + hi-vis $320, White Card renewal $110, carried bulky
 *   tools with no site storage: 3,000 home-to-site km by cents per km. Hospital cover all year.
 *
 * Hand working:
 *   allowance    tool allowance is income                              =    450.00
 *   drill        1,000 x (200% / 5) x 303/365 days (1 Sep - 30 Jun)    =    332.05  (33,205.48c half-up)
 *   hand tools   under $300: immediate                                 =    250.00
 *   PPE          boots + hi-vis                                        =    320.00
 *   White Card   renewal                                               =    110.00
 *   car          3,000 x 0.88 (bulky tools exception)                  =  2,640.00
 *   deductions                                                         =  3,652.05
 *   taxable      88,450 - 3,652.05 = 84,797.95 -> rounded down         = 84,797.00
 *   gross tax    4,288 + 0.30 x (84,797 - 45,000)                      = 16,227.10
 *   LITO         84,797 > 66,667                                       =      0
 *   Medicare     0.02 x 84,797                                         =  1,695.94
 *   MLS          hospital cover all year                               =      0
 *   result       19,000 - (16,227.10 + 1,695.94)                       =  1,076.96 refund
 */
import { describe, expect, it } from 'vitest';
import { Q } from '@/src/questions/ids';
import { a, c, item, lineById, runGolden } from './harness';

const E = 'e1';
const run = () =>
  runGolden({
    fy: '2025-26',
    items: [item(E, 'employer'), item('al1', 'allowance'), item('t1', 'tool_item', 0), item('t2', 'tool_item', 1)],
    answers: [
      a(Q.core.fy, '2025-26'),
      a(Q.core.purpose, 'pre_lodgment'),
      a(Q.core.lodged, 'no'),
      a(Q.res.status, 'resident_full'),
      a(Q.res.dual, 'no'),
      a(Q.fam.spouse, 'no'),
      a(Q.fam.dependantsCount, 0),
      a(Q.med.exemption, 'entitled_full'),
      a(Q.phi.cover, 'whole_year'),
      a(Q.emp.name, 'BuildCo', E),
      a(Q.emp.occupation, 'construction_labourer', E),
      a(Q.emp.dates, { from: '2025-07-01', to: '2026-06-30' }, E),
      a(Q.emp.gross, c(88000), E),
      a(Q.emp.withheld, c(19000), E),
      a(Q.emp.taxReady, 'yes', E),
      a(Q.emp.otherPay, ['none']),
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
      // Construction deep module
      a(Q.con.commute, 'same_site'),
      a(Q.con.bulkyTools, 'yes_no_storage'),
      a(Q.con.itinerant, 'no'),
      a(Q.con.toolsAny, 'yes'),
      a('con.tool_repairs.any', 'no'),
      a(Q.con.ppe, ['boots', 'hi_vis']),
      a('con.ppe.paid', 'paid_not_reimbursed'),
      a(Q.con.ppeAmount, c(320)),
      a('con.ppe.evidence', 'receipts'),
      a(Q.con.everydayClothing, 'no'),
      a(Q.con.licences, ['white_card']),
      a(Q.con.licenceStage, 'renewal'),
      a('con.licences.paid', 'paid_not_reimbursed'),
      a(Q.con.licenceAmount, c(110)),
      a('con.licences.evidence', 'receipts'),
      a(Q.con.overnight, 'no'),
      a(Q.con.fifo, 'none'),
      a('con.allowances', 'yes'),
      a(Q.con.phone, 'no'),
      // Allowance
      a(Q.allow.type, 'tool', 'al1'),
      a(Q.allow.amount, c(450), 'al1'),
      a(Q.allow.onStatement, 'yes', 'al1'),
      a(Q.allow.nature, 'allowance', 'al1'),
      // Tools
      a(Q.ded.toolItem, 'Cordless drill', 't1'),
      a(Q.ded.toolPaid, 'paid_not_reimbursed', 't1'),
      a(Q.ded.toolCost, c(1000), 't1'),
      a(Q.ded.toolDate, '2025-09-01', 't1'),
      a(Q.ded.toolWorkPct, 100, 't1'),
      a('ded.tool.work_pct_method', 'diary', 't1'),
      a(Q.ded.toolEvidence, 'receipts', 't1'),
      a(Q.ded.toolEffectiveLife, 5, 't1'),
      a(Q.ded.toolItem, 'Hand tools', 't2'),
      a(Q.ded.toolPaid, 'paid_not_reimbursed', 't2'),
      a(Q.ded.toolCost, c(250), 't2'),
      a(Q.ded.toolDate, '2025-10-01', 't2'),
      a(Q.ded.toolWorkPct, 100, 't2'),
      a('ded.tool.work_pct_method', 'diary', 't2'),
      a(Q.ded.toolEvidence, 'receipts', 't2'),
      // Car (home-to-site with the bulky tools exception)
      a(Q.ded.carAny, 'yes'),
      a('ded.car.paid', 'paid_not_reimbursed'),
      a(Q.ded.carTripTypes, ['home_to_work']),
      a(Q.ded.carException, ['bulky_no_storage']),
      a(Q.ded.carMethod, 'cents_per_km'),
      a(Q.ded.carKm, 3000),
      a('ded.car.evidence', 'diary'),
      // Remaining screens
      a('ded.travel.any', 'no'),
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

describe('golden 2: construction labourer 2025-26', () => {
  const { estimate: est, hiddenAnswered } = run();

  it('every answer given is visible', () => {
    expect(hiddenAnswered).toEqual([]);
  });
  it('tool allowance is income', () => {
    expect(lineById(est, 'income.allowance@al1').amountCents).toBe(c(450));
    expect(est.totals.assessableIncomeCents).toBe(c(88450));
  });
  it('drill over $300: diminishing value pro-rated from 1 September', () => {
    const l = lineById(est, `ded.${Q.ded.toolCost}@t1`);
    expect(l.status).toBe('computed');
    expect(l.amountCents).toBe(33205);
    expect(l.detail?.['daysHeld']).toBe(303);
    expect(l.detail?.['effectiveLifeYears']).toBe(5);
  });
  it('hand tools under $300: immediate deduction', () => {
    const l = lineById(est, `ded.${Q.ded.toolCost}@t2`);
    expect(l.amountCents).toBe(c(250));
    expect(l.formula).toContain('immediate');
  });
  it('PPE and White Card renewal', () => {
    expect(lineById(est, `ded.${Q.con.ppeAmount}`).amountCents).toBe(c(320));
    expect(lineById(est, `ded.${Q.con.licenceAmount}`).amountCents).toBe(c(110));
    expect(lineById(est, `ded.${Q.con.licenceAmount}`).status).toBe('computed');
  });
  it('home-to-site km claimable under the bulky tools exception', () => {
    const car = lineById(est, 'ded.car');
    expect(car.status).toBe('computed');
    expect(car.amountCents).toBe(c(2640));
    expect(car.inputs).toContain(Q.ded.carException);
  });
  it('totals', () => {
    expect(est.totals.deductionsCents).toBe(365205);
    expect(est.totals.workRelatedDeductionsCents).toBe(365205);
    expect(est.totals.taxableIncomeCents).toBe(c(84797));
    expect(lineById(est, 'tax.gross').amountCents).toBe(c(16227.1));
    expect(lineById(est, 'offset.lito').amountCents).toBe(0);
    expect(lineById(est, 'medicare.levy').amountCents).toBe(c(1695.94));
    expect(est.totals.mlsCents).toBe(0);
    expect(est.totals.creditsCents).toBe(c(19000));
    expect(est.totals.resultCents).toBe(c(1076.96));
  });
  it('nothing needs manual review', () => {
    expect(est.manualReview).toEqual([]);
    expect(est.moduleStatus['decline_in_value']).toBe('computed');
    expect(est.moduleStatus['car']).toBe('computed');
  });
});
