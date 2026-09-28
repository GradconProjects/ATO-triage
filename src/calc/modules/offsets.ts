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
  /** Non-refundable offsets from this module (spouse super, FITO, PHI rebate shortfall). */
  offsetsCents: number;
  /** PHI rebate received above entitlement: added to tax. */
  phiLiabilityCents: number;
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

  // Private health insurance rebate reconciliation.
  {
    const policies = cx.items(GROUPS.phiPolicy);
    let any = false;
    for (const p of policies) {
      const vis = (q: string) => cx.visible.has(`${q}@${p.id}`);
      const premiums = vis(Q.phi.policyPremiums) ? cx.a.cents(Q.phi.policyPremiums, p.id) : undefined;
      const received = vis(Q.phi.policyRebate) ? cx.a.cents(Q.phi.policyRebate, p.id) : undefined;
      if (premiums === undefined || received === undefined) continue;
      any = true;
      const inputs = [Q.phi.policyPremiums, Q.phi.policyRebate, Q.phi.policyTier, Q.fam.spouse, Q.fam.dependantsCount];
      const claimedTier = cx.a.string(Q.phi.policyTier, p.id);
      if (claimedTier === undefined || claimedTier === 'not_sure') {
        cx.setStatus('phi_rebate', 'manual_review');
        cx.review('phi_rebate', 'Private health rebate tier claimed with the insurer is not sure; the rebate reconciliation cannot be done.', [Q.phi.policyTier]);
        cx.markUncertain(`${Q.phi.policyRebate}@${p.id}`);
        cx.lines.review({ id: `offset.phi@${p.id}`, section: 'offsets', label: 'Private health insurance rebate adjustment', amountCents: 0, ruleId: `${fy}.phiRebate`, inputs, formula: 'tier claimed unknown', note: 'Check the tier on the private health insurance statement.', itemId: p.id });
        continue;
      }
      const fam = familyInfo(cx);
      const own = mlsIncomeCents(i.taxableCents, i.rfbCents, i.rescCents, 0);
      const testIncome = fam.isFamily ? own + (fam.spouseMlsIncomeCents ?? 0) : own;
      const tier = mlsTier(testIncome, fam.isFamily, fam.children, rules);
      const rebate = rules.phiRebate.find((r) => r.tier === tier.tier);
      if (!rebate) continue;
      // Blend the two rebate periods (1 Jul - 31 Mar: 9 months; 1 Apr - 30 Jun: 3 months). Age under 65 assumed.
      const pctEntitled = new Decimal(rebate.under65).mul(9).plus(new Decimal(rebate.under65Apr).mul(3)).div(12);
      const entitled = new Decimal(premiums).mul(pctEntitled).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
      const diff = entitled - received;
      cx.assume('Private health rebate entitlement uses the under-65 percentage, blended 9/12 (Jul-Mar) and 3/12 (Apr-Jun) over the year\'s premiums.');
      cx.setStatus('phi_rebate', 'computed');
      const formula = `entitled ${entitled / 100} (premiums ${premiums / 100} x ${pctEntitled.toFixed(3)}% for income tier ${tier.tier}) - rebate received ${received / 100} (claimed tier ${claimedTier})`;
      if (diff > 0) {
        offsets += diff;
        cx.lines.computed({ id: `offset.phi@${p.id}`, section: 'offsets', label: 'Private health insurance rebate shortfall (offset)', amountCents: diff, ruleId: `${fy}.phiRebate`, inputs, formula, itemId: p.id });
      } else if (diff < 0) {
        phiLiability += -diff;
        cx.lines.computed({ id: `offset.phi@${p.id}`, section: 'offsets', label: 'Private health insurance rebate liability (excess rebate received)', amountCents: diff, ruleId: `${fy}.phiRebate`, inputs, formula, itemId: p.id, note: 'Rebate received exceeds the entitlement for your income tier; the excess is added to tax.' });
      } else {
        cx.lines.computed({ id: `offset.phi@${p.id}`, section: 'offsets', label: 'Private health insurance rebate (no adjustment)', amountCents: 0, ruleId: `${fy}.phiRebate`, inputs, formula, itemId: p.id });
      }
    }
    if (!any && cx.moduleStatus['phi_rebate'] === undefined) cx.setStatus('phi_rebate', 'not_applicable');
  }

  if (cx.moduleStatus['offsets'] === undefined) cx.setStatus('offsets', 'not_applicable');
  return { offsetsCents: offsets, phiLiabilityCents: phiLiability };
}
