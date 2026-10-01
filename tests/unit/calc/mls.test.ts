import { describe, expect, it } from 'vitest';
import { mlsTier } from '@/src/calc/modules/mls';
import { Q } from '@/src/questions/ids';
import { RULES, a, c, item, lineById, notSure, run } from './fixture';

describe('MLS tiers', () => {
  const single: Array<[number, number]> = [[97000, 0], [97001, 1], [113000, 1], [113001, 2], [151000, 2], [151001, 3]];
  for (const [income, tier] of single) it(`single $${income} -> tier ${tier}`, () => expect(mlsTier(c(income), false, 0, RULES).tier).toBe(tier));
  const family: Array<[number, number, number]> = [[194000, 0, 0], [194001, 0, 1], [195500, 2, 0], [195501, 2, 1], [226000, 0, 1], [226001, 0, 2]];
  for (const [income, children, tier] of family) it(`family $${income} with ${children} children -> tier ${tier}`, () => expect(mlsTier(c(income), true, children, RULES).tier).toBe(tier));
});

describe('MLS in the pipeline', () => {
  it('no hospital cover, tier 1 -> 1% for the whole year', () => {
    const est = run([a(Q.phi.cover, 'none'), a(Q.emp.gross, c(100000), 'e1')]);
    expect(est.totals.mlsCents).toBe(c(1000));
  });
  it('extras only counts as no cover', () => {
    const est = run([a(Q.phi.cover, 'extras_only'), a(Q.emp.gross, c(100000), 'e1')]);
    expect(est.totals.mlsCents).toBe(c(1000));
  });
  it('part-year cover pro-rates', () => {
    const est = run([a(Q.phi.cover, 'part_year'), a(Q.phi.daysCovered, 200), a(Q.emp.gross, c(100000), 'e1')]);
    expect(est.totals.mlsCents).toBe(Math.round((100000 * 165) / 365));
  });
  it('a spouse whose own income is at or below the Medicare low-income threshold pays no surcharge (s 8D(3)(c))', () => {
    const spouse = [a(Q.fam.spouse, 'all_year'), a(Q.fam.spouseTaxableIncome, c(220000)), a(Q.fam.spouseRfb, 0), a(Q.fam.spouseRsc, 0), a(Q.phi.cover, 'none')];
    const low = run([...spouse, a(Q.emp.gross, c(RULES.medicare.lowIncome.single.lower), 'e1')]);
    expect(low.totals.mlsCents).toBe(0);
    expect(lineById(low, 'mls.surcharge').formula).toContain('8D(3)(c)');
    const above = run([...spouse, a(Q.emp.gross, c(RULES.medicare.lowIncome.single.lower + 1), 'e1')]);
    expect(above.totals.mlsCents).toBeGreaterThan(0);
  });
  it('whole-year cover -> 0', () => {
    const est = run([a(Q.phi.cover, 'whole_year'), a(Q.emp.gross, c(100000), 'e1')]);
    expect(est.totals.mlsCents).toBe(0);
  });
  it('below tier 1 -> 0 regardless of cover', () => {
    const est = run([a(Q.phi.cover, 'none'), a(Q.emp.gross, c(90000), 'e1')]);
    expect(est.totals.mlsCents).toBe(0);
    expect(est.moduleStatus['mls']).toBe('computed');
  });
  it('not sure about cover above the threshold -> review', () => {
    const est = run([notSure(Q.phi.cover), a(Q.emp.gross, c(100000), 'e1')]);
    expect(lineById(est, 'mls.surcharge').status).toBe('manual_review');
    expect(est.totals.mlsCents).toBe(0);
  });
  it('RFB and RESC are added to MLS income', () => {
    const est = run([a(Q.phi.cover, 'none'), a(Q.emp.gross, c(90000), 'e1'), a(Q.emp.rfb, c(5000), 'e1'), a(Q.emp.resc, c(3000), 'e1')]);
    expect(est.totals.mlsCents).toBe(c(980)); // 98,000 x 1%
  });
  it('family income uses the family thresholds', () => {
    const est = run([a(Q.phi.cover, 'none'), a(Q.fam.spouse, 'all_year'), a(Q.fam.spouseTaxableIncome, c(50000)), a(Q.emp.gross, c(100000), 'e1')]);
    expect(est.totals.mlsCents).toBe(0); // 150,000 < 194,000
  });
  it('family income over threshold taxes own income only', () => {
    const est = run([a(Q.phi.cover, 'none'), a(Q.fam.spouse, 'all_year'), a(Q.fam.spouseTaxableIncome, c(150000)), a(Q.emp.gross, c(100000), 'e1')]);
    expect(est.totals.mlsCents).toBe(c(1250)); // family 250,000 is tier 2 (1.25%) on own 100,000
  });
  it('medicare-exempt taxpayers pay no surcharge', () => {
    const est = run([a(Q.phi.cover, 'none'), a(Q.med.exemption, 'foreign_resident'), a(Q.emp.gross, c(200000), 'e1')]);
    expect(est.totals.mlsCents).toBe(0);
  });
  it('unused items do not break tier tests', () => {
    const est = run([a(Q.phi.cover, 'none'), a(Q.emp.gross, c(160000), 'e1')], { items: [item('p1', 'phi_policy')] });
    expect(est.totals.mlsCents).toBe(c(2400)); // tier 3, 1.5%
  });
});
