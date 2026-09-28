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

/** Step 6a: Medicare levy with low-income reduction and exemption days. */
export function computeMedicare(cx: CalcContext, taxableCents: number): MedicareResult {
  const rules = cx.rules;
  const exemption = cx.a.string(Q.med.exemption);
  const inputs: string[] = [Q.med.exemption, Q.fam.spouse, Q.fam.dependantsCount, Q.off.saptoEligible];
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

  const fam = familyInfo(cx);
  const sapto = saptoEligible(cx);
  const kind = fam.isFamily ? (sapto ? 'saptoFamily' : 'family') : sapto ? 'sapto' : 'single';
  const t = thresholdsFor(rules, kind, fam.children);
  const testIncome = fam.isFamily ? taxableCents + (fam.spouseTaxableCents ?? 0) : taxableCents;
  if (fam.isFamily) cx.assume('Family Medicare levy reduction tested on your taxable income plus spouse taxable income (simplified family income).');
  let levy = medicareLevyFor(taxableCents, testIncome, t);
  let label = `Medicare levy (${rules.medicare.rate * 100}%${testIncome > t.lowerCents && testIncome < t.upperCents ? ', low-income phase-in' : ''})`;
  let formula =
    testIncome <= t.lowerCents
      ? `${testIncome / 100} is at or below the ${kind} low-income threshold ${t.lowerCents / 100}`
      : testIncome < t.upperCents
        ? `${rules.medicare.phaseInRate * 100}% x (${testIncome / 100} - ${t.lowerCents / 100})`
        : `${rules.medicare.rate * 100}% x ${taxableCents / 100}`;

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
