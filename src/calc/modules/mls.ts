import { Q } from '../../questions/ids';
import type { MlsTier, RuleSet } from '../../rules/schema';
import { dollarsToCents, mulRate } from '../money';
import { CalcContext, daysInFy } from '../context';
import Decimal from 'decimal.js';

export interface FamilyInfo {
  /** Spouse at any time in the year, or any dependent children. */
  isFamily: boolean;
  hasSpouse: boolean;
  children: number;
  /** Spouse income for MLS purposes (taxable + RFB + reportable super) when answered. */
  spouseMlsIncomeCents: number | undefined;
  spouseTaxableCents: number | undefined;
}

/** Family status from Q.fam.* (used by Medicare thresholds and MLS tiers). */
export function familyInfo(cx: CalcContext): FamilyInfo {
  const spouse = cx.a.string(Q.fam.spouse);
  const hasSpouse = spouse === 'all_year' || spouse === 'part_year';
  const children = Math.max(0, Math.trunc(cx.a.number(Q.fam.dependantsCount) ?? 0));
  const spouseTaxable = hasSpouse ? cx.a.cents(Q.fam.spouseTaxableIncome) : undefined;
  const spouseMls =
    spouseTaxable === undefined ? undefined : spouseTaxable + (cx.a.cents(Q.fam.spouseRfb) ?? 0) + (cx.a.cents(Q.fam.spouseRsc) ?? 0);
  return { isFamily: hasSpouse || children > 0, hasSpouse, children, spouseMlsIncomeCents: spouseMls, spouseTaxableCents: spouseTaxable };
}

/**
 * Income for MLS purposes = taxable income + reportable fringe benefits + reportable employer super
 * + net investment losses (approximated as 0, see assumption in computeMls).
 */
export function mlsIncomeCents(taxableCents: number, rfbCents: number, rescCents: number, netInvestmentLossCents = 0): number {
  return taxableCents + rfbCents + rescCents + netInvestmentLossCents;
}

/** Family threshold for a tier: familyTo + familyChildIncrement per child after the first. */
export function familyThresholdCents(tier: MlsTier, children: number, rules: Pick<RuleSet, 'mls'>): number | null {
  if (tier.familyTo === null) return null;
  return dollarsToCents(tier.familyTo + rules.mls.familyChildIncrement * Math.max(0, children - 1));
}

/** Pick the MLS tier for an income (singles use singleTo, families familyTo + child increment). */
export function mlsTier(incomeCents: number, isFamily: boolean, children: number, rules: Pick<RuleSet, 'mls'>): MlsTier {
  const tiers = [...rules.mls.tiers].sort((a, b) => a.tier - b.tier);
  for (const t of tiers) {
    const limit = isFamily ? familyThresholdCents(t, children, rules) : t.singleTo === null ? null : dollarsToCents(t.singleTo);
    if (limit === null || incomeCents <= limit) return t;
  }
  return tiers[tiers.length - 1]!;
}

/** Days without private hospital cover from Q.phi.cover; undefined = cannot tell (review). */
export function daysWithoutCover(cx: CalcContext): { days: number | undefined; reason?: string } {
  const cover = cx.a.string(Q.phi.cover);
  const year = daysInFy(cx.fy);
  switch (cover) {
    case 'whole_year':
      return { days: 0 };
    case 'none':
    case 'extras_only':
      return { days: year };
    case 'part_year': {
      const covered = cx.a.number(Q.phi.daysCovered);
      if (covered === undefined) return { days: undefined, reason: 'Days of hospital cover not answered.' };
      return { days: Math.max(0, year - Math.min(year, Math.trunc(covered))) };
    }
    default:
      return { days: undefined, reason: cx.a.isNotSure(Q.phi.cover) ? 'Not sure about private hospital cover.' : 'Private hospital cover not answered.' };
  }
}

/**
 * Medicare levy surcharge. Threshold test uses family income (own + spouse) when there is a
 * family; the surcharge itself is on the taxpayer's own MLS income:
 *   surcharge = own MLS income x tier rate x daysWithoutCover / daysInFy.
 */
export function computeMls(cx: CalcContext, taxableCents: number, rfbCents: number, rescCents: number, medicareExempt: boolean): number {
  const rules = cx.rules;
  const fam = familyInfo(cx);
  const own = mlsIncomeCents(taxableCents, rfbCents, rescCents, 0);
  const inputs = [Q.phi.cover, Q.fam.spouse, Q.fam.dependantsCount];
  cx.assume('Net investment losses treated as $0 when working out income for Medicare levy surcharge and study loan purposes.');

  if (medicareExempt) {
    cx.setStatus('mls', 'not_applicable');
    return 0;
  }
  const testIncome = fam.isFamily ? own + (fam.spouseMlsIncomeCents ?? 0) : own;
  if (fam.hasSpouse && fam.spouseMlsIncomeCents === undefined) {
    cx.assume('Spouse income not answered: family MLS threshold tested on your income only.');
  }
  const tier = mlsTier(testIncome, fam.isFamily, fam.children, rules);
  if (tier.rate === 0) {
    cx.setStatus('mls', 'computed');
    cx.lines.computed({
      id: 'mls.surcharge',
      section: 'mls',
      label: 'Medicare levy surcharge (income below tier 1 threshold)',
      amountCents: 0,
      ruleId: `${rules.fy}.mls`,
      inputs,
      formula: `${fam.isFamily ? 'family' : 'single'} income for MLS ${testIncome / 100} is in tier 0`,
    });
    return 0;
  }
  const { days, reason } = daysWithoutCover(cx);
  if (days === undefined) {
    cx.setStatus('mls', 'manual_review');
    cx.review('mls', `${reason ?? 'Hospital cover unknown.'} Income for MLS is in tier ${tier.tier}; surcharge may apply.`, [Q.phi.cover, Q.phi.daysCovered]);
    cx.markUncertain(Q.phi.cover);
    cx.lines.review({
      id: 'mls.surcharge',
      section: 'mls',
      label: 'Medicare levy surcharge',
      amountCents: mulRate(own, tier.rate),
      ruleId: `${rules.fy}.mls`,
      inputs,
      formula: `${own / 100} x ${tier.rate * 100}% x days without cover / ${daysInFy(cx.fy)} (days unknown)`,
      note: reason ?? 'Hospital cover unknown.',
    });
    return 0;
  }
  const year = daysInFy(cx.fy);
  const amount = new Decimal(own).mul(tier.rate).mul(days).div(year).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  cx.setStatus('mls', 'computed');
  cx.lines.computed({
    id: 'mls.surcharge',
    section: 'mls',
    label: `Medicare levy surcharge (tier ${tier.tier}, ${days} days without hospital cover)`,
    amountCents: amount,
    ruleId: `${rules.fy}.mls`,
    inputs: [...inputs, Q.phi.daysCovered],
    formula: `${own / 100} x ${tier.rate * 100}% x ${days}/${year}`,
  });
  return amount;
}
