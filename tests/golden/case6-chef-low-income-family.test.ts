/**
 * Golden case 6 (regression, spec section 17): low-income chef with a high-income spouse, 2025-26.
 * Three employers: gross 202.29 + 6,458.58 + 5,491.51 = 12,152.38; withheld 32 + 439 + 172 = 643.
 * The same $2,500 course was entered twice (job questions and self-education). It must count once.
 *
 * Hand working (one course confirmed):
 *   course        2,500   (chef.courses, current job)
 *   clothing      1,200   (chef jacket, checked pants: occupation-specific)
 *   sharpening    1,500
 *   tax affairs     100
 *   travel        2,300   (parking/tolls between workplaces)
 *   laundry          90   (3 work-only loads x $1 x 30 weeks)
 *   deductions    7,690
 *   taxable       12,152.38 - 7,690 = 4,462.38 -> 4,462
 *   tax, Medicare 0 (below tax-free threshold and Medicare low-income threshold)
 *   car           home-to-work with no exception: goes to review, not deducted.
 */
import { describe, expect, it } from 'vitest';
import { Q } from '@/src/questions/ids';
import { a, c, item, lineById, runGolden, type A } from './harness';

const base = (over: A[] = []): A[] => {
  const m = new Map<string, A>();
  for (const x of [...ANSWERS, ...over]) m.set(`${x.id}@${x.item ?? ''}`, x);
  return [...m.values()];
};

const ITEMS = [item('e1', 'employer', 0), item('e2', 'employer', 1), item('e3', 'employer', 2), item('p1', 'phi_policy')];
const emp = (id: string, name: string, gross: number, withheld: number): A[] => [
  a(Q.emp.name, name, id),
  a(Q.emp.occupation, 'chef', id),
  a(Q.emp.dates, { from: '2025-07-01', to: '2026-06-30' }, id),
  a(Q.emp.gross, c(gross), id),
  a(Q.emp.withheld, c(withheld), id),
  a(Q.emp.taxReady, 'yes', id),
];
const spent = (b: string, amount: number): A[] => [a(`${b}.paid`, 'paid_not_reimbursed'), a(`${b}.amount`, c(amount)), a(`${b}.evidence`, 'receipts')];

const ANSWERS: A[] = [
  a(Q.core.fy, '2025-26'),
  a(Q.core.purpose, 'pre_lodgment'),
  a(Q.core.lodged, 'no'),
  a(Q.res.status, 'resident_full'),
  a(Q.res.dual, 'no'),
  a(Q.fam.spouse, 'all_year'),
  a(Q.fam.spouseTaxableIncome, c(200000)),
  a(Q.fam.spouseRfb, 0),
  a(Q.fam.spouseRsc, 0),
  a(Q.fam.dependantsCount, 2),
  a(Q.med.exemption, 'entitled_full'),
  a(Q.phi.cover, 'none'),
  ...emp('e1', 'Cafe A', 202.29, 32),
  ...emp('e2', 'Restaurant B', 6458.58, 439),
  ...emp('e3', 'Hotel C', 5491.51, 172),
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
  // Chef module
  a(Q.chef.knivesAny, 'no'),
  a('chef.sharpening.any', 'yes'),
  ...spent('chef.sharpening', 1500),
  a(Q.chef.clothing, ['jacket', 'checked_pants']),
  a('chef.clothing.paid', 'paid_not_reimbursed'),
  a(Q.chef.clothingAmount, c(1200)),
  a('chef.clothing.evidence', 'receipts'),
  a(Q.chef.laundry, 'yes'),
  a(Q.chef.travelBetweenJobs, 'yes'),
  a(Q.chef.homeToWork, 'yes'),
  a(Q.chef.certificates, ['none']),
  a(Q.chef.courses, 'current_job'),
  ...spent('chef.courses', 2500),
  a(Q.chef.mealsAtWork, 'no'),
  a(Q.chef.overtimeMealAllowance, 'no'),
  // Laundry
  a('ded.laundry.paid', 'paid_not_reimbursed'),
  a(Q.ded.laundryLoadsWorkOnly, 3),
  a(Q.ded.laundryLoadsMixed, 0),
  a(Q.ded.laundryWeeks, 30),
  a(Q.ded.laundryEvidence, 'diary'),
  // Car: home-to-work trips with no exception
  a(Q.ded.carAny, 'yes'),
  a(Q.ded.carTripTypes, ['between_workplaces', 'home_to_work']),
  a(Q.ded.carException, ['none']),
  a(Q.ded.carMethod, 'cents_per_km'),
  a(Q.ded.carCount, 'one'),
  a(Q.ded.carKm, 1580),
  a(Q.ded.carEvidence, 'diary'),
  a('ded.travel.any', 'yes'),
  a('ded.travel.kind', ['parking_tolls']),
  ...spent('ded.travel', 2300),
  // The same course entered again under self-education
  a('ded.selfed.any', 'yes'),
  a(Q.ded.selfEdSameCourse, 'same'),
  a(Q.ded.selfEdRelated, 'current_duties'),
  ...spent('ded.selfed', 2500),
  a('ded.selfed.work_pct', 100),
  a('ded.subscriptions.any', 'no'),
  a('ded.tax_affairs.any', 'yes'),
  ...spent('ded.tax_affairs', 100),
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

const run = (over: A[] = []) => runGolden({ fy: '2025-26', items: ITEMS, answers: base(over), profileOccupations: ['chef'] });

const PHI_STATEMENT = (j1: number, j2: number): A[] => [
  a(Q.phi.cover, 'whole_year'),
  a('phi.policy.insurer', 'Fund', 'p1'),
  a(Q.phi.policyCoveredAs, 'adult', 'p1'),
  a(Q.phi.policySource, 'statement', 'p1'),
  a(Q.phi.policyJ1, c(j1), 'p1'), a(Q.phi.policyK1, 0, 'p1'), a(Q.phi.policyL1, '30', 'p1'),
  a(Q.phi.policyJ2, c(j2), 'p1'), a(Q.phi.policyK2, 0, 'p1'), a(Q.phi.policyL2, '31', 'p1'),
  a(Q.phi.policyElection, 'my_share', 'p1'),
  a(Q.phi.policySpouseConfirmed, 'yes', 'p1'),
];

describe('golden 6: low-income chef, duplicate course, high-income spouse', () => {
  const { estimate: est, hiddenAnswered } = run();

  it('every answer given is visible', () => {
    expect(hiddenAnswered).toEqual([]);
  });
  it('income and withholding from three employers', () => {
    expect(est.totals.assessableIncomeCents).toBe(1215238);
    expect(est.totals.creditsCents).toBe(c(643));
  });
  it('the course entered twice counts once', () => {
    expect(lineById(est, `ded.${Q.chef.coursesAmount}`).amountCents).toBe(c(2500));
    expect(lineById(est, `ded.${Q.chef.coursesAmount}`).status).toBe('computed');
    expect(lineById(est, `ded.${Q.ded.selfEdAmount}`).status).toBe('excluded');
  });
  it('confirmed deductions 7,690; the car claim under review is counted provisionally', () => {
    // 7,690 confirmed + car 1,580 km x 88c = 1,390.40 provisional (mixed home-to-work trips).
    expect(est.totals.deductionsCents - (est.totals.provisionalDeductionsCents ?? 0)).toBe(c(7690));
    expect(est.totals.provisionalDeductionsCents).toBe(139040);
    expect(est.totals.taxableIncomeCents).toBe(c(3071));
  });
  it('home-to-work car trips with no exception are flagged for review and marked provisional', () => {
    expect(lineById(est, 'ded.car').status).toBe('manual_review');
    expect(lineById(est, 'ded.car').provisional).toBe(true);
    expect(est.manualReview.some((r) => r.questionIds?.includes(Q.ded.carException) || /car/i.test(r.reason))).toBe(true);
  });
  it('no tax, no Medicare levy, no surcharge (own income below the low-income threshold, s 8D(3)(c))', () => {
    expect(est.totals.grossTaxCents).toBe(0);
    expect(lineById(est, 'medicare.levy').amountCents).toBe(0);
    expect(est.totals.mlsCents).toBe(0);
    expect(est.totals.resultCents).toBe(c(643));
  });
  it('an unconfirmed course entry is review, never silently counted twice', () => {
    const { estimate } = run([a(Q.ded.selfEdSameCourse, 'not_sure')].map((x) => ({ ...x, state: 'not_sure' as const })));
    expect(lineById(estimate, `ded.${Q.ded.selfEdAmount}`).status).toBe('manual_review');
    // Held out: a possible duplicate is never counted as entered.
    expect(lineById(estimate, `ded.${Q.ded.selfEdAmount}`).heldOut).toBe(true);
    expect(estimate.totals.deductionsCents).toBe(c(7690) + 139040);
  });
  it('a different course counts separately', () => {
    const { estimate } = run([a(Q.ded.selfEdSameCourse, 'different')]);
    expect(estimate.totals.deductionsCents).toBe(c(10190) + 139040);
  });
  it('a whole family premium with no allocation is unresolved, not claimed in full', () => {
    const { estimate } = run([
      a(Q.phi.cover, 'whole_year'),
      a('phi.policy.insurer', 'Fund', 'p1'),
      a(Q.phi.policyCoveredAs, 'adult', 'p1'),
      a(Q.phi.policySource, 'own_figures', 'p1'),
      a(Q.phi.policyPremiums, c(4500), 'p1'),
      a(Q.phi.policyRebate, 0, 'p1'),
      a(Q.phi.policyRebateConfirmed, 'yes', 'p1'),
    ]);
    expect(lineById(estimate, 'offset.phi@p1').status).toBe('manual_review');
    expect(estimate.totals.refundableOffsetsCents).toBe(0);
  });
  it('with statement lines and a confirmed election the rebate is refundable at nil tax', () => {
    const { estimate } = run(PHI_STATEMENT(1687.5, 562.5));
    const l = lineById(estimate, 'offset.phi@p1');
    expect(l.status).toBe('computed');
    expect(l.section).toBe('refundable_offsets');
    expect(estimate.totals.refundableOffsetsCents).toBeGreaterThan(0);
    expect(estimate.totals.resultCents).toBe(c(643) + (estimate.totals.refundableOffsetsCents ?? 0));
  });
});
