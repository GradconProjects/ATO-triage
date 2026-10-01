import { describe, expect, it } from 'vitest';
import { spouseSuperOffset } from '@/src/calc/modules/offsets';
import { saptoAmount } from '@/src/calc/modules/sapto';
import { Q } from '@/src/questions/ids';
import { RULES, a, c, item, lineById, notSure, run } from './fixture';

describe('spouse super contribution offset', () => {
  it('18% of up to $3,000, tapering from $37,000 to $40,000 of spouse income', () => {
    expect(spouseSuperOffset(c(3000), c(30000))).toBe(c(540));
    expect(spouseSuperOffset(c(3000), c(37000))).toBe(c(540));
    expect(spouseSuperOffset(c(3000), c(38500))).toBe(c(270));
    expect(spouseSuperOffset(c(3000), c(40000))).toBe(0);
    expect(spouseSuperOffset(c(1000), c(30000))).toBe(c(180));
    expect(spouseSuperOffset(c(5000), c(30000))).toBe(c(540));
    expect(spouseSuperOffset(c(5000), c(39000))).toBe(c(180));
  });
  it('in the pipeline', () => {
    const est = run([a(Q.emp.gross, c(60000), 'e1'), a(Q.fam.spouse, 'all_year'), a(Q.fam.spouseTaxableIncome, c(30000)), a(Q.supc.spouseAmount, c(3000))]);
    expect(lineById(est, 'offset.spouse_super').amountCents).toBe(c(540));
    expect(lineById(run([a(Q.emp.gross, c(60000), 'e1'), a(Q.fam.spouse, 'no'), a(Q.supc.spouseAmount, c(3000))]), 'offset.spouse_super').status).toBe('excluded');
    expect(lineById(run([a(Q.emp.gross, c(60000), 'e1'), a(Q.fam.spouse, 'all_year'), a(Q.supc.spouseAmount, c(3000))]), 'offset.spouse_super').status).toBe('manual_review');
  });
});

describe('SAPTO', () => {
  it('shades out at 12.5c per dollar', () => {
    expect(saptoAmount(c(30000), RULES.sapto.single, RULES.sapto.taperRate)).toBe(c(2230));
    expect(saptoAmount(c(34919), RULES.sapto.single, RULES.sapto.taperRate)).toBe(c(2230));
    expect(saptoAmount(c(35919), RULES.sapto.single, RULES.sapto.taperRate)).toBe(c(2105));
    expect(saptoAmount(c(52759), RULES.sapto.single, RULES.sapto.taperRate)).toBe(0);
    expect(saptoAmount(c(30994), RULES.sapto.coupleEach, RULES.sapto.taperRate)).toBe(c(1602));
  });
  it('pipeline: eligible single / couple / not sure / separated', () => {
    expect(lineById(run([a(Q.emp.gross, c(40000), 'e1'), a(Q.off.saptoEligible, 'yes'), a(Q.off.saptoStatus, 'single')]), 'offset.sapto').amountCents).toBe(159487); // 2,230 - 12.5c x 5,081 (635.13 half-up) = 1,594.87
    expect(lineById(run([a(Q.emp.gross, c(30000), 'e1'), a(Q.off.saptoEligible, 'yes'), a(Q.off.saptoStatus, 'couple')]), 'offset.sapto').amountCents).toBe(c(1602));
    expect(run([a(Q.emp.gross, c(30000), 'e1'), notSure(Q.off.saptoEligible)]).moduleStatus['sapto']).toBe('manual_review');
    expect(lineById(run([a(Q.emp.gross, c(30000), 'e1'), a(Q.off.saptoEligible, 'yes'), a(Q.off.saptoStatus, 'couple_separated_illness')]), 'offset.sapto').status).toBe('manual_review');
    expect(run([a(Q.emp.gross, c(30000), 'e1'), a(Q.off.saptoEligible, 'no')]).moduleStatus['sapto']).toBe('not_applicable');
  });
});

describe('zone, invalid carer', () => {
  it('route to review when claimed', () => {
    const est = run([a(Q.emp.gross, c(60000), 'e1'), a(Q.off.zone, 'zone_a'), a(Q.off.invalidCarer, 'yes')]);
    expect(lineById(est, 'offset.zone').status).toBe('manual_review');
    expect(lineById(est, 'offset.invalid_carer').status).toBe('manual_review');
    expect(est.moduleStatus['offsets']).toBe('manual_review');
    expect(run([a(Q.emp.gross, c(60000), 'e1'), a(Q.off.zone, 'none'), a(Q.off.invalidCarer, 'no')]).moduleStatus['offsets']).toBe('not_applicable');
  });
});

describe('FITO', () => {
  it('foreign tax at or below $1,000 is claimed in full', () => {
    const est = run([a(Q.emp.gross, c(50000), 'e1'), a(Q.fgn.amount('employment'), c(10000)), a(Q.fgn.taxPaid, c(500))]);
    expect(lineById(est, 'offset.fito').amountCents).toBe(c(500));
  });
  it('above $1,000 it is limited to the Australian tax on the foreign income', () => {
    const est = run([a(Q.emp.gross, c(90000), 'e1'), a(Q.fgn.amount('employment'), c(10000)), a(Q.fgn.taxPaid, c(5000))]);
    // taxable 100,000 -> gross 20,788; x 10,000/100,000 = 2,078.80
    expect(lineById(est, 'offset.fito').amountCents).toBe(c(2078.8));
  });
  it('foreign tax with no foreign income -> review', () => {
    const est = run([a(Q.emp.gross, c(90000), 'e1'), a(Q.off.fitoPaid, c(500))]);
    expect(lineById(est, 'offset.fito').status).toBe('manual_review');
  });
  it('trust foreign tax counts', () => {
    const est = run([a(Q.emp.gross, c(50000), 'e1'), a(Q.inv.trustForeignIncome, c(1000), 't1'), a(Q.inv.trustForeignTax, c(100), 't1')], { items: [item('t1', 'trust_dist')] });
    expect(lineById(est, 'offset.fito').amountCents).toBe(c(100));
  });
});

describe('private health rebate reconciliation', () => {
  const policy = (received: number, tier = 'base') => [a(Q.emp.gross, c(60000), 'e1'), a(Q.phi.cover, 'whole_year'), a(Q.phi.policyPremiums, c(2000), 'p1'), a(Q.phi.policyRebate, c(received), 'p1'), a(Q.phi.policyTier, tier, 'p1')];
  const items = [item('p1', 'phi_policy')];
  it('rebate received above entitlement -> recovered as a separate liability', () => {
    // entitled = 2,000 x (24.608 x 9 + 24.288 x 3) / 12 % = 2,000 x 24.528% = 490.56
    const est = run(policy(500), { items });
    expect(lineById(est, 'offset.phi@p1').amountCents).toBe(-944);
    expect(est.totals.phiLiabilityCents).toBe(944);
    expect(est.totals.taxAfterOffsetsCents).toBe(est.totals.grossTaxCents - est.totals.offsetsCents);
    expect(lineById(est, 'offset.phi@p1').section).toBe('phi_recovery');
  });
  it('rebate received below entitlement -> refundable offset, kept apart from non-refundable offsets', () => {
    const est = run(policy(400), { items });
    expect(lineById(est, 'offset.phi@p1').amountCents).toBe(9056);
    expect(lineById(est, 'offset.phi@p1').section).toBe('refundable_offsets');
    expect(est.totals.phiLiabilityCents).toBe(0);
    expect(est.totals.refundableOffsetsCents).toBe(9056);
  });
  it('an additional rebate is paid in full even when income tax is nil', () => {
    const low = [a(Q.emp.gross, c(15000), 'e1'), a(Q.emp.withheld, c(100), 'e1'), a(Q.phi.cover, 'whole_year'), a(Q.phi.policyPremiums, c(2000), 'p1'), a(Q.phi.policyRebate, c(0), 'p1'), a(Q.phi.policyTier, 'base', 'p1')];
    const est = run(low, { items });
    expect(est.totals.grossTaxCents).toBe(0);
    expect(est.totals.refundableOffsetsCents).toBeGreaterThan(0);
    expect(est.totals.resultCents).toBe(c(100) + est.totals.refundableOffsetsCents! - est.totals.medicareLevyCents);
  });
  it('the insurer\'s chosen tier does not decide the entitlement (income tier does)', () => {
    const est = run([a(Q.emp.gross, c(60000), 'e1'), a(Q.phi.cover, 'whole_year'), a(Q.phi.policyPremiums, c(2000), 'p1'), a(Q.phi.policyRebate, c(500), 'p1'), notSure(Q.phi.policyTier, 'p1')], { items });
    expect(lineById(est, 'offset.phi@p1').status).toBe('computed');
  });
  it('high income tier 3 -> no entitlement, full rebate is a liability', () => {
    const est = run([a(Q.emp.gross, c(200000), 'e1'), a(Q.phi.cover, 'whole_year'), a(Q.phi.policyPremiums, c(2000), 'p1'), a(Q.phi.policyRebate, c(500), 'p1'), a(Q.phi.policyTier, 'base', 'p1')], { items });
    expect(est.totals.phiLiabilityCents).toBe(c(500));
  });
});

describe('LSPIA', () => {
  const years = [item('y1', 'lump_sum_e_year'), item('y2', 'lump_sum_e_year', 1)];
  const arrears = (weekly: number) => [a(Q.comp.weeklyAmount, c(weekly)), a(Q.comp.arrearsAmount, c(14000)), a(Q.comp.lseFy, '2022-23', 'y1'), a(Q.comp.lseAmount, c(8000), 'y1'), a(Q.comp.lseTaxableIncome, c(25000), 'y1'), a(Q.comp.lseOver12m, 'yes', 'y1'), a(Q.comp.lseFy, '2023-24', 'y2'), a(Q.comp.lseAmount, c(6000), 'y2'), a(Q.comp.lseTaxableIncome, c(28000), 'y2'), a(Q.comp.lseOver12m, 'yes', 'y2')];
  it('below $1,200 -> no offset (excluded line)', () => {
    const est = run([a(Q.emp.gross, c(50000), 'e1'), a(Q.emp.lumpE, c(1000), 'e1')]);
    expect(lineById(est, 'offset.lspia').status).toBe('excluded');
    expect(est.moduleStatus['lspia']).toBe('computed');
  });
  it('accrual years missing -> review', () => {
    expect(lineById(run([a(Q.comp.arrearsAmount, c(5000))]), 'offset.lspia').status).toBe('manual_review');
  });
  it('a year without its taxable income -> review', () => {
    const est = run([a(Q.comp.weeklyAmount, c(40000)), a(Q.comp.arrearsAmount, c(14000)), a(Q.comp.lseAmount, c(14000), 'y1')], { items: [years[0]!] });
    expect(lineById(est, 'offset.lspia').status).toBe('manual_review');
  });
  it('offset = extra tax this year - notional tax in the accrual years, using each year\'s own rules (provisional estimate)', () => {
    const est = run(arrears(40000), { items: years, rulesFor: (fy) => (fy === '2023-24' || fy === '2022-23' ? RULES : undefined) });
    // taxable 54,000: tax 6,988 - tax(40,000) 3,488 = 3,500; notional 1,280 + 960 = 2,240 -> 1,260
    const l = lineById(est, 'offset.lspia');
    expect(l.amountCents).toBe(c(1260));
    expect(l.provisional).toBe(true);
    expect(est.manualReview.some((r) => r.module === 'lspia' && r.reason.includes('not the statutory figure'))).toBe(true);
  });
  it('never substitutes current-year rules for a missing historical year', () => {
    const est = run(arrears(40000), { items: years, rulesFor: (fy) => (fy === '2023-24' ? RULES : undefined) });
    expect(lineById(est, 'offset.lspia').status).toBe('manual_review');
    expect(lineById(est, 'offset.lspia').note).toContain('2022-23');
  });
  it('floors at zero when the arrears would have been taxed the same', () => {
    expect(lineById(run(arrears(30000), { items: years, rulesFor: () => RULES }), 'offset.lspia').amountCents).toBe(0);
  });
  it('arrears accrued within 12 months -> review', () => {
    const est = run([...arrears(40000).filter((x) => !(x.id === Q.comp.lseOver12m && x.item === 'y2')), a(Q.comp.lseOver12m, 'no', 'y2')], { items: years });
    expect(lineById(est, 'offset.lspia').status).toBe('manual_review');
  });
  it('offsets cannot exceed gross tax', () => {
    const est = run([a(Q.emp.gross, c(19000), 'e1')]);
    expect(est.totals.grossTaxCents).toBe(c(128));
    expect(est.totals.offsetsCents).toBe(c(128));
    expect(est.totals.taxAfterOffsetsCents).toBe(0);
  });
});
