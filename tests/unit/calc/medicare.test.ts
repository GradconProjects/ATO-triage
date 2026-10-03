import { describe, expect, it } from 'vitest';
import { medicareLevyFor, phaseInUpperCents, thresholdsFor } from '@/src/calc/modules/medicare';
import { Q } from '@/src/questions/ids';
import { RULES, a, c, lineById, notSure, run } from './fixture';

const single = thresholdsFor(RULES, 'single', 0);

describe('Medicare levy low-income phase-in (single 27,222 / 34,027)', () => {
  const cases: Array<[number, number]> = [
    [0, 0],
    [27222, 0],
    [27223, 10],
    [30000, c(277.8)],
    [34026, c(680.4)],
    [34027, c(680.54)],
    [50000, c(1000)],
  ];
  for (const [income, levy] of cases) {
    it(`$${income} -> ${levy} cents`, () => {
      expect(medicareLevyFor(c(income), c(income), single)).toBe(levy);
    });
  }
  it('family threshold grows per child and the upper is lower / (1 - rate/phaseIn)', () => {
    const fam1 = thresholdsFor(RULES, 'family', 1);
    expect(fam1.lowerCents).toBe(c(45907 + 4216));
    expect(fam1.upperCents).toBe(phaseInUpperCents(c(50123), 0.02, 0.1));
    expect(fam1.upperCents).toBe(c(62653.75));
    expect(thresholdsFor(RULES, 'family', 0).upperCents).toBe(c(57383));
    expect(thresholdsFor(RULES, 'sapto', 0).lowerCents).toBe(c(43020));
  });
});

describe('Medicare in the pipeline', () => {
  it('full levy on a plain salary', () => {
    const est = run([a(Q.emp.gross, c(60166), 'e1')]);
    expect(est.totals.medicareLevyCents).toBe(c(1203.32));
  });
  it('foreign resident exemption -> 0 and excluded line', () => {
    const est = run([a(Q.med.exemption, 'foreign_resident'), a(Q.emp.gross, c(60000), 'e1')]);
    expect(est.totals.medicareLevyCents).toBe(0);
    expect(lineById(est, 'medicare.levy').status).toBe('excluded');
  });
  it('temporary visa with a Medicare Entitlement Statement for the whole year -> 0', () => {
    const est = run([a(Q.med.exemption, 'temp_visa_mes'), a(Q.med.exemptDays, 365), a(Q.emp.gross, c(60000), 'e1')]);
    expect(est.totals.medicareLevyCents).toBe(0);
    expect(est.totals.mlsCents).toBe(0);
  });
  it('temporary visa without the number of exempt days -> review, not a silent exemption', () => {
    const est = run([a(Q.med.exemption, 'temp_visa_mes'), a(Q.emp.gross, c(60000), 'e1')]);
    expect(lineById(est, 'medicare.levy').status).toBe('manual_review');
  });
  it('part-year exemption pro-rates by exempt days', () => {
    const est = run([a(Q.med.exemption, 'part_year'), a(Q.med.exemptDays, 100), a(Q.emp.gross, c(60000), 'e1')]);
    expect(est.totals.medicareLevyCents).toBe(Math.round((120000 * 265) / 365));
  });
  it('part-year exemption without days -> review', () => {
    const est = run([a(Q.med.exemption, 'part_year'), a(Q.emp.gross, c(60000), 'e1')]);
    expect(lineById(est, 'medicare.levy').status).toBe('manual_review');
    expect(est.moduleStatus['medicare']).toBe('manual_review');
  });
  it('not sure -> full levy and the answer is uncertain', () => {
    const est = run([notSure(Q.med.exemption), a(Q.emp.gross, c(60000), 'e1')]);
    expect(est.totals.medicareLevyCents).toBe(c(1200));
    expect(est.uncertainInputs).toContain(Q.med.exemption);
  });
  it('family thresholds with spouse income', () => {
    const est = run([a(Q.fam.spouse, 'all_year'), a(Q.fam.spouseTaxableIncome, c(20000)), a(Q.emp.gross, c(30000), 'e1')]);
    // individual: 10% x (30,000 - 27,222) = 277.80; family 50,000: family phase-in 10% x (50,000 - 45,907) = 409.30,
    // shared by income: 409.30 x 30,000 / 50,000 = 245.58 (the lower of the two applies)
    expect(est.totals.medicareLevyCents).toBe(24558);
  });
  it('single low income below threshold pays nothing', () => {
    const est = run([a(Q.emp.gross, c(27000), 'e1')]);
    expect(est.totals.medicareLevyCents).toBe(0);
  });
  it('SAPTO thresholds when eligible', () => {
    const est = run([a(Q.off.saptoEligible, 'yes'), a(Q.off.saptoStatus, 'single'), a(Q.emp.gross, c(40000), 'e1')]);
    expect(est.totals.medicareLevyCents).toBe(0); // 40,000 < 43,020
  });
});
