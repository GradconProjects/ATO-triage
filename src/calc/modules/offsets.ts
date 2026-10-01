import { GROUPS, Q } from '../../questions/ids';
import type { CalcContext } from '../context';
import { dollarsToCents, mulRate } from '../money';
import Decimal from 'decimal.js';
import { familyInfo, mlsIncomeCents, mlsTier } from './mls';

export interface OffsetsInput {
  taxableCents: number;
  grossTaxCents: number;
  foreignIncomeCents: number;
  rfbCents: number;
  rescCents: number;
}

export interface OffsetsResult {
  /** Non-refundable offsets from this module (spouse super, FITO). Capped at tax by the pipeline. */
  offsetsCents: number;
  /** PHI rebate received above entitlement: recovered as a separate liability. */
  phiLiabilityCents: number;
  /** Additional PHI rebate owed (received less than entitled): a REFUNDABLE offset. */
  refundableCents: number;
}

const SPOUSE_MAX_CONTRIBUTION = 3000;
const SPOUSE_INCOME_FROM = 37000;
const SPOUSE_INCOME_TO = 40000;
const SPOUSE_RATE = 0.18;
const FITO_DE_MINIMIS = 1000;

/** Spouse super contribution offset: 18% of up to $3,000, the $3,000 reduced $1 for $1 by spouse income over $37,000 (nil at $40,000). */
export function spouseSuperOffset(contributionCents: number, spouseIncomeCents: number): number {
  const reduction = Math.max(0, spouseIncomeCents - dollarsToCents(SPOUSE_INCOME_FROM));
  const eligible = Math.max(0, Math.min(contributionCents, dollarsToCents(SPOUSE_MAX_CONTRIBUTION) - reduction));
  return mulRate(eligible, SPOUSE_RATE);
}

/** Step 5 (other offsets): spouse super, zone / invalid-carer (review), FITO, PHI rebate reconciliation. */
export function computeOtherOffsets(cx: CalcContext, i: OffsetsInput): OffsetsResult {
  const rules = cx.rules;
  const fy = rules.fy;
  let offsets = 0;
  let phiLiability = 0;
  let refundable = 0;

  // Spouse super contribution offset.
  {
    const contribution = cx.a.cents(Q.supc.spouseAmount);
    if (contribution !== undefined && cx.visible.has(Q.supc.spouseAmount)) {
      const fam = familyInfo(cx);
      const inputs = [Q.supc.spouseAmount, Q.fam.spouse, Q.fam.spouseTaxableIncome, Q.fam.spouseRfb, Q.fam.spouseRsc];
      if (!fam.hasSpouse) {
        cx.lines.excluded({ id: 'offset.spouse_super', section: 'offsets', label: 'Spouse super contribution offset', amountCents: 0, ruleId: `${fy}.spouseSuperOffset`, inputs, formula: 'no spouse recorded', note: 'The offset needs a spouse for the year.' });
      } else if (fam.spouseMlsIncomeCents === undefined) {
        cx.setStatus('offsets', 'manual_review');
        cx.review('offsets', 'Spouse super contribution offset needs the spouse\'s income.', [Q.fam.spouseTaxableIncome], contribution);
        cx.markUncertain(Q.supc.spouseAmount);
        cx.lines.review({ id: 'offset.spouse_super', section: 'offsets', label: 'Spouse super contribution offset', amountCents: 0, ruleId: `${fy}.spouseSuperOffset`, inputs, formula: `18% x min(${contribution / 100}, 3000 - excess over 37000) (spouse income missing)`, note: 'Answer the spouse income questions to compute this offset.' });
      } else {
        const amount = spouseSuperOffset(contribution, fam.spouseMlsIncomeCents);
        offsets += amount;
        cx.setStatus('offsets', 'computed');
        cx.lines.computed({ id: 'offset.spouse_super', section: 'offsets', label: 'Spouse super contribution offset', amountCents: amount, ruleId: `${fy}.spouseSuperOffset`, inputs, formula: `${SPOUSE_RATE * 100}% x min(${contribution / 100}, ${SPOUSE_MAX_CONTRIBUTION} - max(0, spouse income ${fam.spouseMlsIncomeCents / 100} - ${SPOUSE_INCOME_FROM})); nil from ${SPOUSE_INCOME_TO}` });
      }
    }
  }

  // Zone / overseas forces, invalid and carer: always manual review.
  {
    const zone = cx.a.string(Q.off.zone);
    if ((zone !== undefined && zone !== 'none') || cx.a.isNotSure(Q.off.zone)) {
      cx.setStatus('offsets', 'manual_review');
      cx.review('offsets', `Zone / overseas forces tax offset (${zone ?? 'not sure'}) needs manual review.`, [Q.off.zone]);
      cx.lines.review({ id: 'offset.zone', section: 'offsets', label: 'Zone or overseas forces tax offset', amountCents: 0, ruleId: `${fy}.zoneOffset`, inputs: [Q.off.zone], formula: 'not computed', note: 'Zone offsets depend on days in the zone and dependants; always manual review.' });
    }
    const invalid = cx.a.string(Q.off.invalidCarer);
    if (invalid === 'yes' || cx.a.isNotSure(Q.off.invalidCarer)) {
      cx.setStatus('offsets', 'manual_review');
      cx.review('offsets', 'Invalid and invalid carer tax offset needs manual review.', [Q.off.invalidCarer]);
      cx.lines.review({ id: 'offset.invalid_carer', section: 'offsets', label: 'Invalid and invalid carer tax offset', amountCents: 0, ruleId: `${fy}.invalidCarerOffset`, inputs: [Q.off.invalidCarer], formula: 'not computed', note: 'Depends on the dependant\'s income and days; always manual review.' });
    }
  }

  // Foreign income tax offset.
  {
    const fgnPaid = cx.visible.has(Q.fgn.taxPaid) ? cx.a.cents(Q.fgn.taxPaid) : undefined;
    const offPaid = cx.visible.has(Q.off.fitoPaid) ? cx.a.cents(Q.off.fitoPaid) : undefined;
    let paid = fgnPaid ?? offPaid ?? 0;
    if (fgnPaid !== undefined && offPaid !== undefined && fgnPaid !== offPaid) cx.assume('Foreign tax paid answered twice; the foreign-income module answer was used.');
    const trustTax = cx.items(GROUPS.trustDist).reduce((acc, it) => acc + ((cx.visible.has(`${Q.inv.trustForeignTax}@${it.id}`) ? cx.a.cents(Q.inv.trustForeignTax, it.id) : undefined) ?? 0), 0);
    paid += trustTax;
    const inputs = [Q.fgn.taxPaid, Q.off.fitoPaid, Q.inv.trustForeignTax];
    if (paid > 0) {
      if (i.foreignIncomeCents <= 0 || i.taxableCents <= 0) {
        cx.setStatus('fito', 'manual_review');
        cx.review('fito', 'Foreign tax was paid but no assessable foreign income was included; the offset cannot be apportioned.', inputs, paid);
        cx.lines.review({ id: 'offset.fito', section: 'offsets', label: 'Foreign income tax offset', amountCents: paid, ruleId: `${fy}.fito`, inputs, formula: 'no foreign income included', note: 'Enter the foreign income the tax was paid on.' });
      } else {
        let amount: number;
        let formula: string;
        if (paid <= dollarsToCents(FITO_DE_MINIMIS)) {
          amount = paid;
          formula = `foreign tax paid ${paid / 100} (at or below $${FITO_DE_MINIMIS}: claimed in full)`;
        } else {
          const cap = new Decimal(i.grossTaxCents).mul(i.foreignIncomeCents).div(i.taxableCents).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
          amount = Math.min(paid, cap);
          formula = `min(foreign tax paid ${paid / 100}, gross tax ${i.grossTaxCents / 100} x foreign income ${i.foreignIncomeCents / 100} / taxable income ${i.taxableCents / 100} = ${cap / 100})`;
          cx.assume('FITO limit approximated as gross tax x foreign income / taxable income (the ATO limit uses tax on income excluding foreign amounts and related deductions).');
        }
        offsets += amount;
        cx.setStatus('fito', 'computed');
        cx.lines.computed({ id: 'offset.fito', section: 'offsets', label: 'Foreign income tax offset', amountCents: amount, ruleId: `${fy}.fito`, inputs, formula });
      }
    } else cx.setStatus('fito', 'not_applicable');
  }

  // Private health insurance rebate reconciliation (refundable offset or recovery), per policy.
  {
    const r = reconcilePhi(cx, i);
    refundable += r.refundableCents;
    phiLiability += r.liabilityCents;
  }

  if (cx.moduleStatus['offsets'] === undefined) cx.setStatus('offsets', 'not_applicable');
  return { offsetsCents: offsets, phiLiabilityCents: phiLiability, refundableCents: refundable };
}

type AgeBand = 'under65' | '65_69' | '70plus';
const AGE_FROM_CODE: Record<string, AgeBand> = { '30': 'under65', '31': 'under65', '35': '65_69', '36': '65_69', '40': '70plus', '41': '70plus' };

function rebatePct(rules: CalcContext['rules'], tier: number, age: AgeBand, fromApril: boolean): number | undefined {
  const row = rules.phiRebate.find((x) => x.tier === tier);
  if (!row) return undefined;
  if (age === 'under65') return fromApril ? row.under65Apr : row.under65;
  if (age === '65_69') return fromApril ? row.age65to69Apr : row.age65to69;
  return fromApril ? row.age70plusApr : row.age70plus;
}

/**
 * Private health insurance rebate (refundable offset or recovery), per policy.
 * - Statement lines (label J premiums eligible = your share without LHC loading, K rebate
 *   received, L benefit code = age band and period) give an exact calculation per period.
 * - Without a statement, your share = (premiums - LHC loading) / adults covered, split 9/12 and
 *   3/12 between the periods: marked approximate.
 * - Entitlement uses your income tier (income for surcharge purposes; couples and families use
 *   combined income), never the insurer's chosen tier. An unknown spouse income leaves it unresolved.
 * - Tax claim code E or F: the rebate is not claimed in this return.
 */
function reconcilePhi(cx: CalcContext, i: OffsetsInput): { refundableCents: number; liabilityCents: number } {
  const rules = cx.rules;
  const fy = rules.fy;
  let refundable = 0;
  let liability = 0;
  let any = false;
  const fam = familyInfo(cx);
  for (const p of cx.items(GROUPS.phiPolicy)) {
    const val = (q: string) => (cx.visible.has(`${q}@${p.id}`) ? cx.a.cents(q, p.id) : undefined);
    const str = (q: string) => (cx.visible.has(`${q}@${p.id}`) ? cx.a.string(q, p.id) : undefined);
    const inputs = [Q.phi.policyPremiums, Q.phi.policyRebate, Q.phi.policyJ1, Q.phi.policyK1, Q.phi.policyJ2, Q.phi.policyK2, Q.phi.policyElection, Q.phi.policyAmountBasis, Q.fam.spouse, Q.fam.dependantsCount];
    const id = `offset.phi@${p.id}`;
    const statement = str(Q.phi.policySource) === 'statement' || val(Q.phi.policyJ1) !== undefined || val(Q.phi.policyJ2) !== undefined;
    const unresolved = (reason: string, ids: string[], amount?: number) => {
      any = true;
      cx.setStatus('phi_rebate', 'manual_review');
      cx.markUncertain(`${Q.phi.policyPremiums}@${p.id}`);
      cx.review('phi_rebate', reason, ids, amount);
      cx.lines.review({ id, section: 'refundable_offsets', label: 'Private health insurance rebate adjustment (unresolved)', amountCents: 0, ruleId: `${fy}.phiRebate`, inputs, formula: 'not worked out', note: `Affects the estimate. ${reason}`, itemId: p.id });
    };

    type Line = { premiums: number; received: number; age: AgeBand; fromApril: boolean; whose: 'mine' | 'spouse' };
    const lines: Line[] = [];
    const approximations: string[] = [];
    let uncertain = false;
    let totalPolicyPremiums: number | undefined;
    const addStatementLine = (j: string, k: string, l: string, fromApril: boolean, whose: Line['whose']) => {
      const premiums = val(j);
      if (premiums === undefined) return;
      const received = val(k);
      const code = str(l);
      let age = code ? AGE_FROM_CODE[code] : undefined;
      if (!age) { age = 'under65'; approximations.push(`benefit code missing on ${whose === 'spouse' ? 'the spouse\'s' : 'a'} ${fromApril ? 'April to June' : 'July to March'} line: under-65 rate assumed`); uncertain = true; }
      if (received === undefined) { approximations.push('a rebate-received (K) figure is missing'); uncertain = true; }
      lines.push({ premiums, received: received ?? 0, age, fromApril, whose });
    };

    if (statement) {
      addStatementLine(Q.phi.policyJ1, Q.phi.policyK1, Q.phi.policyL1, false, 'mine');
      addStatementLine(Q.phi.policyJ2, Q.phi.policyK2, Q.phi.policyL2, true, 'mine');
    } else {
      const total = val(Q.phi.policyPremiums);
      const received = val(Q.phi.policyRebate);
      if (total === undefined || received === undefined) continue;
      totalPolicyPremiums = total;
      const basis = str(Q.phi.policyAmountBasis);
      let share: number;
      let shareReceived: number;
      if (basis === 'my_share') {
        share = total;
        shareReceived = received;
      } else if (basis === 'full_policy') {
        const adults = cx.a.number(Q.phi.policyAdults, p.id);
        if (adults === undefined || adults < 1) { unresolved('The number of adults covered is needed to work out your share of the full policy premium.', [`${Q.phi.policyAdults}@${p.id}`], total); continue; }
        const lhc = val(Q.phi.policyLhc) ?? 0;
        share = Math.round((total - lhc) / Math.trunc(adults));
        shareReceived = Math.round(received / Math.trunc(adults));
        approximations.push(`your share is (full premium ${total / 100}${lhc ? ` - LHC loading ${lhc / 100}` : ''}) / ${Math.trunc(adults)} adults`);
      } else if (fam.hasSpouse) {
        // Never assign a whole family premium to one adult without confirming the allocation.
        unresolved(`It is not confirmed whether the ${total / 100} premium is the whole policy or your allocated share. A family premium is shared between the adults covered, so the rebate cannot be worked out until this is answered (or the statement lines are entered).`, [`${Q.phi.policyAmountBasis}@${p.id}`], total);
        continue;
      } else {
        share = total;
        shareReceived = received;
        approximations.push('premium treated as yours alone (allocation not confirmed)');
        uncertain = true;
      }
      const ageAns = str(Q.phi.policyAge);
      const age: AgeBand = ageAns === '65_69' || ageAns === '70plus' || ageAns === 'under65' ? ageAns : 'under65';
      if (ageAns !== age) { approximations.push('age of the oldest person covered not given: under-65 rate assumed'); uncertain = true; }
      if (received === 0 && str(Q.phi.policyRebateConfirmed) !== 'yes') { approximations.push('a $0 rebate received is not confirmed as "paid full price"'); uncertain = true; }
      const jul = Math.round((share * 9) / 12);
      const julRec = Math.round((shareReceived * 9) / 12);
      lines.push({ premiums: jul, received: julRec, age, fromApril: false, whose: 'mine' }, { premiums: share - jul, received: shareReceived - julRec, age, fromApril: true, whose: 'mine' });
      approximations.push('no statement lines: premiums split 9/12 (July to March) and 3/12 (April to June)');
    }
    if (lines.length === 0) continue;
    any = true;

    if (str(Q.phi.policyCoveredAs) === 'dependant') {
      cx.setStatus('phi_rebate', cx.moduleStatus['phi_rebate'] ?? 'computed');
      cx.lines.excluded({ id, section: 'refundable_offsets', label: 'Private health insurance rebate (covered as a dependant)', amountCents: 0, ruleId: `${fy}.phiRebate`, inputs, formula: 'dependant on the policy', note: 'Neither share is included: dependants get no rebate in their own return.', itemId: p.id });
      continue;
    }
    // Spouse election: which shares belong in this return.
    let includes = 'your share';
    if (fam.hasSpouse) {
      const election = str(Q.phi.policyElection);
      const confirmed = str(Q.phi.policySpouseConfirmed);
      if (election === undefined || election === 'not_sure') { unresolved('Choose who claims the rebate for this policy (your share only, both shares, or your spouse claims yours). A share can be claimed in one return only.', [`${Q.phi.policyElection}@${p.id}`]); continue; }
      if (election === 'spouse_claims_mine') {
        cx.setStatus('phi_rebate', cx.moduleStatus['phi_rebate'] ?? 'computed');
        cx.lines.excluded({ id, section: 'refundable_offsets', label: 'Private health insurance rebate (your spouse claims your share)', amountCents: 0, ruleId: `${fy}.phiRebate`, inputs, formula: 'election: spouse claims my share', note: 'This return includes neither share; your share is reconciled in your spouse\'s return.', itemId: p.id });
        if (confirmed !== 'yes') cx.review('phi_rebate', 'Confirm that your spouse is including your share of the rebate in their return.', [`${Q.phi.policySpouseConfirmed}@${p.id}`]);
        continue;
      }
      if (election === 'both_shares') {
        if (cx.a.string(Q.phi.policySpouseShare, p.id) !== 'yes') { unresolved('Claiming your spouse\'s share needs all three ATO conditions confirmed (same policy and period, together on 30 June, spouse agrees).', [`${Q.phi.policySpouseShare}@${p.id}`]); continue; }
        const before = lines.length;
        addStatementLine(Q.phi.policySpouseJ1, Q.phi.policySpouseK1, Q.phi.policySpouseL1, false, 'spouse');
        addStatementLine(Q.phi.policySpouseJ2, Q.phi.policySpouseK2, Q.phi.policySpouseL2, true, 'spouse');
        if (lines.length === before) { unresolved('Enter your spouse\'s own statement lines (J, K, benefit code) to include their share; they are never assumed to equal yours.', [`${Q.phi.policySpouseJ1}@${p.id}`]); continue; }
        if (confirmed !== 'yes') { unresolved('Confirm that your spouse is leaving their share out of their own return, so it is claimed only once.', [`${Q.phi.policySpouseConfirmed}@${p.id}`]); continue; }
        includes = 'your share and your spouse\'s share';
      } else if (confirmed !== 'yes') {
        approximations.push('your spouse\'s matching election is not confirmed');
        uncertain = true;
      }
    }

    // Income tier: income for surcharge purposes; couples (and single parents) use family thresholds.
    const own = mlsIncomeCents(i.taxableCents, i.rfbCents, i.rescCents, 0);
    if (fam.hasSpouse && fam.spouseMlsIncomeCents === undefined) {
      cx.markUncertain(Q.fam.spouseTaxableIncome);
      unresolved('The rebate tier depends on the family income for surcharge purposes, and part of the spouse\'s income (taxable income, fringe benefits or reportable super) is not known.', [Q.fam.spouseTaxableIncome, Q.fam.spouseRfb, Q.fam.spouseRsc], lines.reduce((a, l) => a + l.premiums, 0));
      continue;
    }
    // Single parents (dependent children, no spouse) also use the family thresholds.
    const family = fam.hasSpouse || fam.children > 0;
    const testIncome = family ? own + (fam.spouseMlsIncomeCents ?? 0) : own;
    const tier = mlsTier(testIncome, family, fam.children, rules);
    if (fam.hasSpouse && cx.a.string(Q.fam.spouse) === 'part_year') { approximations.push('family status on 30 June assumed to be "with a spouse"'); uncertain = true; }

    let entitled = 0;
    const parts: string[] = [];
    let missingRate = false;
    for (const l of lines) {
      const pct = rebatePct(rules, tier.tier, l.age, l.fromApril);
      if (pct === undefined) { missingRate = true; continue; }
      const e = new Decimal(l.premiums).mul(pct).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
      entitled += e;
      parts.push(`${l.fromApril ? 'Apr-Jun' : 'Jul-Mar'}: ${l.premiums / 100} x ${pct}% (${l.age.replace('_', '-')}) = ${e / 100}`);
    }
    if (missingRate) {
      cx.setStatus('phi_rebate', 'manual_review');
      cx.review('phi_rebate', `No rebate percentage in the ${fy} rule set for income tier ${tier.tier}.`, inputs);
      continue;
    }
    const received = lines.reduce((a, l) => a + l.received, 0);
    const diff = entitled - received;
    if (uncertain) cx.markUncertain(`${Q.phi.policyPremiums}@${p.id}`);
    const approx = approximations.length > 0;
    if (approx) cx.assume(`Private health rebate (${approximations.join('; ')}).`);
    cx.setStatus('phi_rebate', cx.moduleStatus['phi_rebate'] === 'manual_review' ? 'manual_review' : 'computed');
    const eligible = lines.reduce((a, l) => a + l.premiums, 0);
    const formula = `includes ${includes}: eligible premiums ${eligible / 100}${totalPolicyPremiums !== undefined && totalPolicyPremiums !== eligible ? ` (of ${totalPolicyPremiums / 100} total policy premiums)` : ''}; entitled ${entitled / 100} [${parts.join('; ')}; income tier ${tier.tier} on ${family ? 'family' : 'single'} income for surcharge purposes ${testIncome / 100}] - rebate already received ${received / 100} = ${(entitled - received) / 100}`;
    const note = approx ? `Approximate: ${approximations.join('; ')}.` : undefined;
    const detail = { includes, eligiblePremiumsCents: eligible, totalPolicyPremiumsCents: totalPolicyPremiums ?? null, rebateReceivedCents: received, entitledCents: entitled, tier: tier.tier, statementLines: lines.length };
    const common = { ruleId: `${fy}.phiRebate`, inputs, formula, itemId: p.id, detail, ...(approx ? { provisional: true } : {}), ...(note ? { note } : {}) };
    if (diff > 0) {
      refundable += diff;
      cx.lines.computed({ id, section: 'refundable_offsets', label: 'Private health insurance rebate still owed (refundable offset)', amountCents: diff, ...common });
    } else if (diff < 0) {
      liability += -diff;
      cx.lines.computed({ id, section: 'phi_recovery', label: 'Private health insurance rebate recovered (excess rebate received)', amountCents: diff, ...common, note: note ?? 'Rebate received exceeds the entitlement for your income tier; the excess is recovered.' });
    } else {
      cx.lines.computed({ id, section: 'refundable_offsets', label: 'Private health insurance rebate (no adjustment)', amountCents: 0, ...common });
    }
  }
  if (!any && cx.moduleStatus['phi_rebate'] === undefined) cx.setStatus('phi_rebate', 'not_applicable');
  return { refundableCents: refundable, liabilityCents: liability };
}
