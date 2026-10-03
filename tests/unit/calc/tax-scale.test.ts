import { describe, expect, it } from 'vitest';
import { grossTax, grossTaxCents, monthsResident, partYearScale, partYearThresholdCents } from '@/src/calc/modules/tax-scale';
import { Q } from '@/src/questions/ids';
import { RULES, a, c, lineById, run } from './fixture';

describe('gross tax on the resident scale (2024-25)', () => {
  const cases: Array<[number, number]> = [
    [0, 0],
    [18200, 0],
    [18201, 16],
    [45000, c(4288)],
    [45001, c(4288.3)],
    [60166, c(8837.8)],
    [135000, c(31288)],
    [135001, c(31288.37)],
    [190000, c(51638)],
    [190001, c(51638.45)],
    [250000, c(51638 + 0.45 * 60000)],
  ];
  for (const [income, tax] of cases) {
    it(`$${income} -> ${tax} cents`, () => {
      expect(grossTax(c(income), RULES.residentScale)).toBe(tax);
    });
  }
  it('foreign and WHM scales', () => {
    expect(grossTax(c(50000), RULES.foreignResidentScale)).toBe(c(15000));
    expect(grossTax(c(45000), RULES.whmScale)).toBe(c(6750));
    expect(grossTax(c(45001), RULES.whmScale)).toBe(c(6750.3));
  });
  it('negative taxable income is zero tax', () => {
    expect(grossTax(-5, RULES.residentScale)).toBe(0);
  });
});

describe('part-year tax-free threshold', () => {
  it('counts the month of arrival', () => {
    expect(monthsResident('became_resident', '2025-01-15', undefined, '2024-25')).toBe(6);
    expect(monthsResident('became_resident', '2024-07-01', undefined, '2024-25')).toBe(12);
    expect(monthsResident('became_resident', '2025-06-30', undefined, '2024-25')).toBe(1);
    expect(monthsResident('ceased_resident', undefined, '2024-09-30', '2024-25')).toBe(3);
    expect(monthsResident('ceased_resident', undefined, '2025-06-30', '2024-25')).toBe(12);
    expect(monthsResident('became_resident', undefined, undefined, '2024-25')).toBeUndefined();
    expect(monthsResident('resident_full', undefined, undefined, '2024-25')).toBe(12);
  });
  it('shifts the first bracket boundary and recomputes bases', () => {
    const threshold = partYearThresholdCents(RULES, 6); // 13464 + 395 x 6 = 15834
    expect(threshold).toBe(c(15834));
    const scale = partYearScale(RULES.residentScale, threshold);
    expect(grossTaxCents(c(15834), scale)).toBe(0);
    expect(grossTaxCents(c(20000), scale)).toBe(c(0.16 * (20000 - 15834)));
    expect(grossTaxCents(c(50000), scale)).toBe(c(0.16 * (45000 - 15834) + 0.3 * 5000));
  });
  it('is applied in the pipeline for a mid-year arrival', () => {
    const est = run([a(Q.res.status, 'became_resident'), a(Q.res.arrivalDate, '2025-01-15'), a(Q.emp.gross, c(20000), 'e1')]);
    expect(lineById(est, 'tax.gross').amountCents).toBe(c(0.16 * (20000 - 15834)));
    expect(est.moduleStatus['tax_scale']).toBe('computed');
  });
  it('routes to review when the arrival date is missing', () => {
    const est = run([a(Q.res.status, 'became_resident'), a(Q.emp.gross, c(20000), 'e1')]);
    expect(lineById(est, 'tax.gross').status).toBe('manual_review');
    expect(est.moduleStatus['tax_scale']).toBe('manual_review');
  });
});

describe('residency selects the scale', () => {
  it('foreign resident: no tax-free threshold, no LITO, no Medicare', () => {
    const est = run([a(Q.res.status, 'foreign_full'), a(Q.emp.gross, c(50000), 'e1')]);
    expect(lineById(est, 'tax.gross').amountCents).toBe(c(15000));
    expect(est.lines.find((l) => l.id === 'offset.lito')).toBeUndefined();
    expect(est.totals.medicareLevyCents).toBe(0);
  });
  it('WHM: other income is stacked above the WHM income, with no second tax-free threshold', () => {
    const est = run([a(Q.res.status, 'whm'), a(Q.res.whmResident, 'yes'), a(Q.res.whmIncome, c(30000)), a(Q.emp.gross, c(50000), 'e1')]);
    expect(lineById(est, 'tax.gross.whm').amountCents).toBe(c(4500));
    // resident scale: tax(50,000) - tax(30,000) = 5,788 - 1,888 = 3,900
    expect(lineById(est, 'tax.gross.other').amountCents).toBe(c(3900));
  });
  it('WHM residency not confirmed: foreign resident rates on other income, with review', () => {
    const est = run([a(Q.res.status, 'whm'), a(Q.res.whmIncome, c(30000)), a(Q.emp.gross, c(50000), 'e1')]);
    expect(lineById(est, 'tax.gross.other').amountCents).toBe(c(6000));
    expect(est.manualReview.some((r) => r.questionIds.includes(Q.res.whmResident))).toBe(true);
  });
  it('WHM without WHM income goes to review', () => {
    const est = run([a(Q.res.status, 'whm'), a(Q.emp.gross, c(50000), 'e1')]);
    expect(lineById(est, 'tax.gross').status).toBe('manual_review');
  });
  it('temporary resident uses the resident scale with an assumption', () => {
    const est = run([a(Q.res.status, 'temporary'), a(Q.emp.gross, c(50000), 'e1')]);
    expect(lineById(est, 'tax.gross').amountCents).toBe(c(4288 + 0.3 * 5000));
    expect(est.assumptions.some((s) => s.includes('Temporary resident'))).toBe(true);
  });
});
