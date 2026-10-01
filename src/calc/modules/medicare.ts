import { Q } from '../../questions/ids';
import type { RuleSet } from '../../rules/schema';
import { dollarsToCents, mulRate } from '../money';
import { CalcContext, daysInFy } from '../context';
import { familyInfo } from './mls';
import { residencyKind } from './tax-scale';
import { saptoEligible } from './sapto';
import Decimal from 'decimal.js';

export interface LevyThresholds {
  rate: number;
  phaseInRate: number;
  lowerCents: number;
  upperCents: number;
}

/**
 * Medicare levy with the low-income phase-in:
 *   income <= lower          -> 0
 *   lower < income < upper   -> phaseInRate x (income - lower), never above rate x income
 *   income >= upper          -> rate x income
 * With family thresholds the test income may differ from the levy base (own taxable income).
 */
export function medicareLevyFor(levyBaseCents: number, testIncomeCents: number, t: LevyThresholds): number {
  if (levyBaseCents <= 0) return 0;
  const full = mulRate(levyBaseCents, t.rate);
  if (testIncomeCents <= t.lowerCents) return 0;
  if (testIncomeCents >= t.upperCents) return full;
  return Math.min(full, mulRate(testIncomeCents - t.lowerCents, t.phaseInRate));
}

/** Upper (phase-in end) for an adjusted lower threshold: lower / (1 - rate / phaseInRate). */
export function phaseInUpperCents(lowerCents: number, rate: number, phaseInRate: number): number {
  return new Decimal(lowerCents).div(new Decimal(1).minus(new Decimal(rate).div(phaseInRate))).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export function thresholdsFor(rules: RuleSet, kind: 'single' | 'family' | 'sapto' | 'saptoFamily', children: number): LevyThresholds {
  const m = rules.medicare;
  const base = m.lowIncome[kind];
  const lower = dollarsToCents(base.lower);
  if ((kind === 'family' || kind === 'saptoFamily') && children > 0) {
    const adjLower = lower + dollarsToCents(m.lowIncome.familyChildIncrement) * children;
    return { rate: m.rate, phaseInRate: m.phaseInRate, lowerCents: adjLower, upperCents: phaseInUpperCents(adjLower, m.rate, m.phaseInRate) };
  }
  return { rate: m.rate, phaseInRate: m.phaseInRate, lowerCents: lower, upperCents: dollarsToCents(base.upper) };
}

export interface MedicareResult {
  levyCents: number;
  /** True when fully exempt (foreign resident / temporary visa without Medicare). */
  exempt: boolean;
}

export interface ArrearsYear {
  fy: string;
  amountCents: number;
  /** That year's taxable income, when answered. */
  taxableCents: number | undefined;
}

/**
 * Family reduction (Medicare Levy Act 1986 s 8): the family reduction amount is
 *   rate x lower - (phaseInRate - rate) x (family income - lower)
 * shared by the taxpayer's share of family taxable income. Returns the taxpayer's levy.
 */
export function familyLevyFor(ownTaxableCents: number, familyIncomeCents: number, t: LevyThresholds): number {
  const full = mulRate(ownTaxableCents, t.rate);
  if (ownTaxableCents <= 0) return 0;
  if (familyIncomeCents <= t.lowerCents) return 0;
  if (familyIncomeCents >= t.upperCents) return full;
  const reduction = new Decimal(t.lowerCents).mul(t.rate).minus(new Decimal(familyIncomeCents - t.lowerCents).mul(t.phaseInRate - t.rate));
  const share = reduction.mul(ownTaxableCents).div(familyIncomeCents);
  return Math.max(0, new Decimal(full).minus(share).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber());
}

/**
 * Medicare Levy Act s 9A (from 1 July 2024): an eligible lump sum in arrears is left out of taxable
 * income for the levy and for the low-income tests when it is at least 10% of normal taxable
 * income and, in each of the (up to two) most recent accrual years, that year's taxable income plus
 * the arrears for that year would not have exceeded the phase-in limit. Needs each year's rules.
 */
export function arrearsMedicareExclusion(cx: CalcContext, taxableCents: number, arrears: { totalCents: number; years: ArrearsYear[] } | undefined): { excludedCents: number; reason?: string; review?: string } {
  if (!arrears || arrears.totalCents <= 0) return { excludedCents: 0 };
  if (cx.fy < '2024-25') return { excludedCents: 0, reason: 'The Medicare levy exemption for lump sums in arrears starts in 2024-25.' };
  const normal = taxableCents - arrears.totalCents;
  if (normal > 0 && arrears.totalCents * 10 < normal) return { excludedCents: 0, reason: 'The arrears are less than 10% of the rest of taxable income.' };
  const recent = [...arrears.years].sort((a, b) => b.fy.localeCompare(a.fy)).slice(0, 2);
  if (recent.length === 0) return { excludedCents: 0, review: 'Lump sum in arrears: add each earlier year it relates to, with that year\'s taxable income, to test the Medicare levy exemption.' };
  for (const y of recent) {
    const yr = cx.rulesFor(y.fy);
    if (!yr) return { excludedCents: 0, review: `Lump sum in arrears: no verified rule table for ${y.fy}, so the Medicare levy exemption cannot be tested.` };
    if (y.taxableCents === undefined) return { excludedCents: 0, review: `Lump sum in arrears: ${y.fy} taxable income is needed to test the Medicare levy exemption.` };
    const upper = dollarsToCents(yr.medicare.lowIncome.single.upper);
    if (y.taxableCents + y.amountCents > upper) return { excludedCents: 0, reason: `In ${y.fy}, taxable income plus that year's arrears would have been above the Medicare low-income phase-in limit.` };
  }
  return { excludedCents: arrears.totalCents, reason: 'Eligible lump sum in arrears left out of the Medicare levy (s 9A).' };
}

/**
 * Step 6a: Medicare levy. The individual low-income test (own taxable income) is applied first and
 * is never overridden by family circumstances; the family reduction is a further test that can
 * only lower the levy. A spouse's income that is not known leaves the family test unresolved.
 */
export function computeMedicare(cx: CalcContext, taxableCents: number, arrears?: { totalCents: number; years: ArrearsYear[] }): MedicareResult {
  const rules = cx.rules;
  const exemption = cx.a.string(Q.med.exemption);
  const inputs: string[] = [Q.med.exemption, Q.fam.spouse, Q.fam.spouseTaxableIncome, Q.fam.dependantsCount, Q.off.saptoEligible];
  cx.setStatus('medicare', 'computed');

  if (residencyKind(cx) === 'foreign' || exemption === 'foreign_resident' || exemption === 'temp_visa_mes') {
    cx.lines.excluded({
      id: 'medicare.levy',
      section: 'medicare',
      label: 'Medicare levy (not entitled to Medicare)',
      amountCents: 0,
      ruleId: `${rules.fy}.medicare`,
      inputs,
      formula: 'exempt for the full year',
      note: exemption === 'temp_visa_mes' ? 'Temporary visa holder with a Medicare Entitlement Statement: no levy.' : 'Foreign residents do not pay the Medicare levy.',
    });
    return { levyCents: 0, exempt: true };
  }

  // Lump sum in arrears exemption (from 2024-25): excluded from the levy base and the tests.
  const lse = arrearsMedicareExclusion(cx, taxableCents, arrears);
  if (lse.review) {
    cx.review('medicare', lse.review, [Q.comp.lseRepeater]);
  }
  const base = Math.max(0, taxableCents - lse.excludedCents);
  const fmt = (c: number) => (c / 100).toFixed(2);

  const fam = familyInfo(cx);
  const sapto = saptoEligible(cx);
  // 1. Individual test on own taxable income.
  const tInd = thresholdsFor(rules, sapto ? 'sapto' : 'single', 0);
  const levyInd = medicareLevyFor(base, base, tInd);
  let levy = levyInd;
  let formula =
    base <= tInd.lowerCents
      ? `own taxable income ${fmt(base)} is at or below the individual threshold ${fmt(tInd.lowerCents)}: no levy`
      : base < tInd.upperCents
        ? `individual reduction: ${rules.medicare.phaseInRate * 100}% x (${fmt(base)} - ${fmt(tInd.lowerCents)})`
        : `${rules.medicare.rate * 100}% x ${fmt(base)}`;
  let label = `Medicare levy (${rules.medicare.rate * 100}%${levyInd < mulRate(base, rules.medicare.rate) ? ', individual low-income reduction' : ''})`;

  // 2. Family test: only when the individual test leaves some levy, and it can only lower it.
  if (fam.isFamily && levyInd > 0) {
    if (fam.hasSpouse && fam.spouseTaxableCents === undefined) {
      cx.setStatus('medicare', 'manual_review');
      cx.markUncertain(Q.fam.spouseTaxableIncome);
      cx.review('medicare', 'Family Medicare levy reduction not assessed: the spouse\'s taxable income is not known. The individual result is used until it is.', [Q.fam.spouseTaxableIncome], levyInd);
    } else {
      const tFam = thresholdsFor(rules, sapto ? 'saptoFamily' : 'family', fam.children);
      const familyIncome = base + (fam.hasSpouse ? (fam.spouseTaxableCents ?? 0) : 0);
      const levyFam = familyLevyFor(base, familyIncome, tFam);
      if (levyFam < levyInd) {
        levy = levyFam;
        label = `Medicare levy (${rules.medicare.rate * 100}%, family reduction)`;
        formula = `family taxable income ${fmt(familyIncome)} vs family threshold ${fmt(tFam.lowerCents)} (${fam.children} dependent children): reduction shared by your share of family income`;
      }
      if (!fam.hasSpouse && fam.children > 0) cx.assume('Sole parent: the family Medicare threshold counts only children for whom family tax benefit was payable; check the number of children.');
    }
  }
  if (lse.excludedCents > 0) formula += `; ${fmt(lse.excludedCents)} lump sum in arrears excluded (s 9A)`;
  else if (lse.reason && arrears && arrears.totalCents > 0) cx.assume(`Medicare levy on lump sum in arrears: ${lse.reason}`);

  if (exemption === 'part_year') {
    const exemptDays = cx.a.number(Q.med.exemptDays);
    if (exemptDays === undefined) {
      cx.setStatus('medicare', 'manual_review');
      cx.review('medicare', 'Part-year Medicare exemption: number of exempt days not answered.', [Q.med.exemptDays], levy);
      cx.lines.review({
        id: 'medicare.levy',
        section: 'medicare',
        label: 'Medicare levy (part-year exemption days missing)',
        amountCents: levy,
        ruleId: `${rules.fy}.medicare`,
        inputs: [...inputs, Q.med.exemptDays],
        formula: `${formula} (full-year placeholder)`,
        note: 'Answer the number of days you were not entitled to Medicare.',
      });
      return { levyCents: levy, exempt: false };
    }
    const year = daysInFy(cx.fy);
    const days = Math.max(0, Math.min(year, Math.trunc(exemptDays)));
    levy = new Decimal(levy).mul(year - days).div(year).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    label = `Medicare levy (${year - days} of ${year} days)`;
    formula = `(${formula}) x ${year - days}/${year}`;
    inputs.push(Q.med.exemptDays);
  } else if (exemption === undefined && cx.a.isNotSure(Q.med.exemption)) {
    cx.markUncertain(Q.med.exemption);
    cx.review('medicare', 'Not sure about Medicare entitlement; full levy applied.', [Q.med.exemption], levy);
  }

  cx.lines.computed({
    id: 'medicare.levy',
    section: 'medicare',
    label,
    amountCents: levy,
    ruleId: `${rules.fy}.medicare`,
    inputs,
    formula,
  });
  return { levyCents: levy, exempt: false };
}
