import { describe, expect, it } from 'vitest';
import { GROUPS, Q } from '@/src/questions/ids';
import { familyLevyFor } from '@/src/calc/modules/medicare';
import { a, c, item, run, RULES } from './fixture';

// Fixture rules (2024-25): single 27,222 / 34,027; family 45,907 (+4,216 per child); phase-in 10%, rate 2%.
describe('Medicare levy: individual test first, family test only lowers it', () => {
  it('a low-income taxpayer pays no levy even with a high-income spouse', () => {
    const est = run([a(Q.emp.gross, c(12152.38), 'e1'), a(Q.fam.spouse, 'all_year'), a(Q.fam.spouseTaxableIncome, c(200000)), a(Q.fam.dependantsCount, 2)]);
    expect(est.totals.medicareLevyCents).toBe(0);
  });
  it('individual phase-in applies on own income regardless of a high-income spouse', () => {
    const est = run([a(Q.emp.gross, c(30000), 'e1'), a(Q.fam.spouse, 'all_year'), a(Q.fam.spouseTaxableIncome, c(150000))]);
    expect(est.totals.medicareLevyCents).toBe(c(277.8)); // 10% x (30,000 - 27,222)
  });
  it('family reduction is shared by income when it gives a lower levy than the individual test', () => {
    const est = run([a(Q.emp.gross, c(40000), 'e1'), a(Q.fam.spouse, 'all_year'), a(Q.fam.spouseTaxableIncome, c(5000))]);
    // individual: 2% x 40,000 = 800; family 45,000 <= 45,907 -> nil
    expect(est.totals.medicareLevyCents).toBe(0);
  });
  it('an unknown spouse income leaves the family test unresolved, not zero', () => {
    const est = run([a(Q.emp.gross, c(40000), 'e1'), a(Q.fam.spouse, 'all_year')]);
    expect(est.totals.medicareLevyCents).toBe(c(800));
    expect(est.manualReview.some((r) => r.module === 'medicare' && r.reason.includes('spouse'))).toBe(true);
    expect(est.uncertainInputs).toContain(Q.fam.spouseTaxableIncome);
  });
  it('sole parent: family threshold with the child increment on own income', () => {
    const est = run([a(Q.emp.gross, c(48000), 'e1'), a(Q.fam.spouse, 'no'), a(Q.fam.dependantsCount, 1)]);
    // family lower 45,907 + 4,216 = 50,123 -> nil
    expect(est.totals.medicareLevyCents).toBe(0);
  });
  it('family levy formula: whole-family phase-in shared by taxable income', () => {
    const t = { rate: 0.02, phaseInRate: 0.1, lowerCents: c(45907), upperCents: c(57383.75) };
    expect(familyLevyFor(c(30000), c(50000), t)).toBe(24558);
    expect(familyLevyFor(c(20000), c(50000), t)).toBe(16372);
  });
});

describe('Medicare levy exemption for lump sums in arrears (s 9A, from 2024-25)', () => {
  const years = [item('y1', GROUPS.lumpSumEYear), item('y2', GROUPS.lumpSumEYear, 1)];
  const base = (hist1: number, hist2: number) => [
    a(Q.comp.weeklyAmount, c(20000)), a(Q.comp.arrearsAmount, c(8000)),
    a(Q.comp.lseFy, '2023-24', 'y1'), a(Q.comp.lseAmount, c(4000), 'y1'), a(Q.comp.lseTaxableIncome, c(hist1), 'y1'), a(Q.comp.lseOver12m, 'yes', 'y1'),
    a(Q.comp.lseFy, '2022-23', 'y2'), a(Q.comp.lseAmount, c(4000), 'y2'), a(Q.comp.lseTaxableIncome, c(hist2), 'y2'), a(Q.comp.lseOver12m, 'yes', 'y2'),
  ];
  it('excludes the arrears when each recent year stays within the phase-in limit', () => {
    const est = run(base(15000, 15000), { items: years, fy: '2024-25', rulesFor: () => RULES });
    // taxable 28,000 -> without the 8,000 arrears 20,000 <= 27,222 -> no levy
    expect(est.totals.medicareLevyCents).toBe(0);
  });
  it('does not exclude them when a recent year would exceed the limit', () => {
    const est = run(base(31000, 15000), { items: years, fy: '2024-25', rulesFor: () => RULES });
    expect(est.totals.medicareLevyCents).toBeGreaterThan(0);
  });
  it('goes to review when a year\'s rules are missing (never substituted)', () => {
    const est = run(base(15000, 15000), { items: years, fy: '2024-25', rulesFor: (fy) => (fy === '2023-24' ? RULES : undefined) });
    expect(est.manualReview.some((r) => r.module === 'medicare' && r.reason.includes('2022-23'))).toBe(true);
  });
});
