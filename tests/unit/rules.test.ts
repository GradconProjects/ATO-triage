import { describe, expect, it } from 'vitest';
import { FINANCIAL_YEARS, type FY } from '@/src/engine/types';
import { RULE_SETS, LATEST_FY, getRuleSet } from '@/src/rules';
import { REQUIRED_SOURCE_KEYS, validateRuleSet, type Bracket, type RuleSet } from '@/src/rules/schema';

const entries = Object.entries(RULE_SETS) as [FY, RuleSet][];

/** Tax (whole dollars) on `income` under a bracket scale, using each bracket's own base. */
function taxAtTopOfBracket(b: Bracket): number {
  if (b.to === null) return Number.POSITIVE_INFINITY;
  return b.base + (b.to - (b.from - 1)) * b.rate;
}

function assertContinuousBands(bands: { from: number; to: number | null }[]): void {
  expect(bands.length).toBeGreaterThan(0);
  expect(bands[0]?.from).toBe(0);
  bands.forEach((band, i) => {
    if (band.to === null) {
      expect(i, 'only the last band may be open-ended').toBe(bands.length - 1);
      return;
    }
    expect(band.to).toBeGreaterThanOrEqual(band.from);
    const next = bands[i + 1];
    expect(next, `band ${i} ends at ${band.to} but nothing follows`).toBeDefined();
    expect(next?.from, `band ${i + 1} must start at ${band.to + 1}`).toBe(band.to + 1);
  });
  expect(bands[bands.length - 1]?.to).toBeNull();
}

describe('rule tables: index', () => {
  it('has a rule set for every FY in the engine', () => {
    for (const fy of FINANCIAL_YEARS) expect(RULE_SETS[fy]).toBeDefined();
    expect(Object.keys(RULE_SETS).sort()).toEqual([...FINANCIAL_YEARS].sort());
  });

  it('getRuleSet returns the matching set and throws on unknown years', () => {
    for (const fy of FINANCIAL_YEARS) expect(getRuleSet(fy).fy).toBe(fy);
    expect(() => getRuleSet('2019-20' as FY)).toThrow(/No rule set/);
  });

  it('LATEST_FY is the last FY and has a rule set', () => {
    expect(LATEST_FY).toBe(FINANCIAL_YEARS[FINANCIAL_YEARS.length - 1]);
    expect(RULE_SETS[LATEST_FY].fy).toBe(LATEST_FY);
  });
});

describe.each(entries)('rule table %s', (fy, rs) => {
  it('parses through validateRuleSet', () => {
    expect(() => validateRuleSet(rs)).not.toThrow();
    expect(rs.fy).toBe(fy);
  });

  it('version string matches the file fy and verifiedOn is a date', () => {
    expect(rs.version.startsWith(`${fy}.`)).toBe(true);
    expect(rs.version).toMatch(/^20\d{2}-\d{2}\.\d+$/);
    expect(Number.isNaN(Date.parse(rs.verifiedOn))).toBe(false);
  });

  it('every required source key has a source with a valid https URL', () => {
    for (const key of REQUIRED_SOURCE_KEYS) {
      const rows = rs.sources.filter((s) => s.key === key);
      expect(rows.length, `missing source for ${key}`).toBeGreaterThan(0);
      for (const row of rows) {
        const url = new URL(row.url);
        expect(url.protocol, `${key} source must be https`).toBe('https:');
        expect(url.hostname.length).toBeGreaterThan(0);
      }
    }
  });

  describe.each([
    ['residentScale', rs.residentScale],
    ['foreignResidentScale', rs.foreignResidentScale],
    ['whmScale', rs.whmScale],
  ] as const)('%s', (_name, scale) => {
    it('is continuous with no gaps or overlaps', () => {
      assertContinuousBands(scale);
    });

    it('has a base equal to the tax at the top of the previous bracket (within $1)', () => {
      expect(scale[0]?.base).toBe(0);
      for (let i = 1; i < scale.length; i++) {
        const prev = scale[i - 1]!;
        const cur = scale[i]!;
        expect(Math.abs(cur.base - taxAtTopOfBracket(prev)), `bracket ${i} base`).toBeLessThanOrEqual(1);
      }
    });

    it('has non-decreasing marginal rates', () => {
      for (let i = 1; i < scale.length; i++) {
        expect(scale[i]!.rate).toBeGreaterThanOrEqual(scale[i - 1]!.rate);
      }
    });
  });

  it('resident scale starts with the $18,200 tax-free threshold', () => {
    expect(rs.residentScale[0]).toEqual({ from: 0, to: 18200, rate: 0, base: 0 });
  });

  it('MLS tiers ascend for singles and families, with the top tier open-ended', () => {
    const tiers = rs.mls.tiers;
    expect(tiers.map((t) => t.tier)).toEqual([0, 1, 2, 3]);
    for (let i = 1; i < tiers.length; i++) {
      const prev = tiers[i - 1]!;
      const cur = tiers[i]!;
      expect(cur.rate).toBeGreaterThan(prev.rate);
      if (cur.singleTo !== null) {
        expect(prev.singleTo).not.toBeNull();
        expect(cur.singleTo).toBeGreaterThan(prev.singleTo as number);
        expect(cur.familyTo).toBeGreaterThan(prev.familyTo as number);
      }
    }
    expect(tiers[3]?.singleTo).toBeNull();
    expect(tiers[3]?.familyTo).toBeNull();
    expect(rs.mls.familyChildIncrement).toBeGreaterThan(0);
  });

  it('PHI rebate tiers are 0..3 with descending percentages and a zero top tier', () => {
    expect(rs.phiRebate.map((t) => t.tier)).toEqual([0, 1, 2, 3]);
    for (let i = 1; i < rs.phiRebate.length; i++) {
      const prev = rs.phiRebate[i - 1]!;
      const cur = rs.phiRebate[i]!;
      expect(cur.under65).toBeLessThan(prev.under65);
      expect(cur.under65Apr).toBeLessThan(prev.under65Apr);
    }
    const top = rs.phiRebate[3]!;
    expect([top.under65, top.age65to69, top.age70plus, top.under65Apr, top.age65to69Apr, top.age70plusApr]).toEqual([0, 0, 0, 0, 0, 0]);
    for (const t of rs.phiRebate) {
      // stored as percentages, not fractions
      expect(t.under65).toBeLessThan(100);
      expect(t.age65to69).toBeGreaterThanOrEqual(t.under65);
      expect(t.age70plus).toBeGreaterThanOrEqual(t.age65to69);
    }
  });

  it('LITO taper boundaries meet', () => {
    expect(rs.lito.taper1.to).toBe(rs.lito.taper2.from);
    expect(rs.lito.taper1.from).toBeLessThan(rs.lito.taper1.to);
    expect(rs.lito.taper2.from).toBeLessThan(rs.lito.taper2.to);
    // the offset reaches zero at the end of taper 2 (within $1 of rounding)
    const afterTaper1 = rs.lito.max - (rs.lito.taper1.to - rs.lito.taper1.from) * rs.lito.taper1.rate;
    const afterTaper2 = afterTaper1 - (rs.lito.taper2.to - rs.lito.taper2.from) * rs.lito.taper2.rate;
    expect(Math.abs(afterTaper2)).toBeLessThanOrEqual(1);
  });

  it('SAPTO cut-out equals shade-out plus max offset / taper rate (within $1)', () => {
    for (const s of [rs.sapto.single, rs.sapto.coupleEach]) {
      expect(s.cutOut).toBeGreaterThan(s.shadeOutFrom);
      expect(Math.abs(s.cutOut - (s.shadeOutFrom + s.maxOffset / rs.sapto.taperRate))).toBeLessThanOrEqual(1);
    }
  });

  it('medicare low-income upper thresholds exceed lower thresholds', () => {
    const li = rs.medicare.lowIncome;
    for (const t of [li.single, li.family, li.sapto, li.saptoFamily]) {
      expect(t.upper).toBeGreaterThan(t.lower);
      // upper is where 10% phase-in meets the 2% levy: lower × (phaseIn / (phaseIn − rate)), floored
      const expected = Math.floor(t.lower * (rs.medicare.phaseInRate / (rs.medicare.phaseInRate - rs.medicare.rate)));
      expect(Math.abs(t.upper - expected)).toBeLessThanOrEqual(1);
    }
    expect(li.familyChildIncrement).toBeGreaterThan(0);
    expect(rs.medicare.rate).toBe(0.02);
  });

  it('study loan bands are continuous and rates ascend', () => {
    const bands = rs.studyLoan.bands;
    assertContinuousBands(bands);
    expect(bands[0]?.rate).toBe(0);
    for (const b of bands) {
      expect(b.rate).toBeGreaterThanOrEqual(0);
      expect(b.rate).toBeLessThanOrEqual(1);
    }
    if (rs.studyLoan.method === 'marginal') {
      for (let i = 1; i < bands.length; i++) {
        const prev = bands[i - 1]!;
        const cur = bands[i]!;
        if (cur.wholeIncome) {
          expect(cur.to).toBeNull();
          continue;
        }
        expect(cur.base).toBeDefined();
        // base equals the repayment at the top of the previous marginal band (within $1)
        const prevTop = (prev.base ?? 0) + ((prev.to as number) - (prev.from === 0 ? 0 : prev.from - 1)) * prev.rate;
        expect(Math.abs((cur.base ?? 0) - prevTop), `band ${i} base`).toBeLessThanOrEqual(1);
      }
    } else {
      for (let i = 1; i < bands.length; i++) expect(bands[i]!.rate).toBeGreaterThan(bands[i - 1]!.rate);
      for (const b of bands) expect(b.wholeIncome).toBeUndefined();
    }
  });

  it('fixed constants match the spec', () => {
    expect(rs.carMaxKm).toBe(5000);
    expect(rs.instantDeductionThreshold).toBe(300);
    expect(rs.lspiaMinimum).toBe(1200);
    expect(rs.cgtDiscountRate).toBe(0.5);
    expect(rs.carryForwardTsbLimit).toBe(500000);
    expect(rs.laundry).toEqual({ perLoadWorkOnly: 100, perLoadMixed: 50, noEvidenceCap: 15000 });
    expect(rs.partYearThreshold.base + 12 * rs.partYearThreshold.perMonth).toBe(18204);
    expect(rs.carCentsPerKm).toBeGreaterThan(0);
    expect(rs.wfhFixedRatePerHour).toBeGreaterThan(0);
    expect(rs.concessionalCap).toBeGreaterThan(0);
  });
});

describe('rule tables: year-specific values', () => {
  it('resident scale rates follow the legislated path', () => {
    expect(RULE_SETS['2023-24'].residentScale.map((b) => b.rate)).toEqual([0, 0.19, 0.325, 0.37, 0.45]);
    expect(RULE_SETS['2024-25'].residentScale.map((b) => b.rate)).toEqual([0, 0.16, 0.3, 0.37, 0.45]);
    expect(RULE_SETS['2025-26'].residentScale.map((b) => b.rate)).toEqual([0, 0.16, 0.3, 0.37, 0.45]);
    expect(RULE_SETS['2026-27'].residentScale.map((b) => b.rate)).toEqual([0, 0.15, 0.3, 0.37, 0.45]);
    expect(RULE_SETS['2024-25'].residentScale).toEqual([
      { from: 0, to: 18200, rate: 0, base: 0 },
      { from: 18201, to: 45000, rate: 0.16, base: 0 },
      { from: 45001, to: 135000, rate: 0.3, base: 4288 },
      { from: 135001, to: 190000, rate: 0.37, base: 31288 },
      { from: 190001, to: null, rate: 0.45, base: 51638 },
    ]);
  });

  it('study loan method switches to marginal from 2025-26', () => {
    expect(RULE_SETS['2023-24'].studyLoan.method).toBe('total_income_rate');
    expect(RULE_SETS['2024-25'].studyLoan.method).toBe('total_income_rate');
    expect(RULE_SETS['2025-26'].studyLoan.method).toBe('marginal');
    expect(RULE_SETS['2026-27'].studyLoan.method).toBe('marginal');
    expect(RULE_SETS['2025-26'].studyLoan.bands.at(-1)).toMatchObject({ from: 179286, rate: 0.1, wholeIncome: true });
    expect(RULE_SETS['2026-27'].studyLoan.bands.at(-1)).toMatchObject({ from: 186051, rate: 0.1, wholeIncome: true });
  });
});
