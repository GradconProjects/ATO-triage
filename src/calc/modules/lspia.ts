import { GROUPS, Q } from '../../questions/ids';
import type { RuleSet } from '../../rules/schema';
import type { CalcContext } from '../context';
import { dollarsToCents } from '../money';
import { grossTax } from './tax-scale';

/** Arrears allocation by earlier year (shared by the LSPIA offset and the Medicare s 9A test). */
export function collectArrears(cx: CalcContext, lumpSumECents: number): { totalCents: number; years: { fy: string; amountCents: number; taxableCents: number | undefined }[] } {
  const years = cx.items(GROUPS.lumpSumEYear).map((it) => ({
    fy: cx.a.string(Q.comp.lseFy, it.id) ?? 'unknown',
    amountCents: cx.a.cents(Q.comp.lseAmount, it.id) ?? 0,
    taxableCents: cx.a.cents(Q.comp.lseTaxableIncome, it.id),
  }));
  return { totalCents: lumpSumECents, years };
}

export interface LspiaInput {
  taxableCents: number;
  lumpSumECents: number;
}

/**
 * Lump sum payment in arrears tax offset (Section 8):
 *   when lump sum E total >= lspiaMinimum and every accrual year has its taxable income answered,
 *   notional = sum over years of [tax(thatYearTaxable + thatYearArrears) - tax(thatYearTaxable)]
 *              using that year's rule set when available (else the current year's, with a note),
 *   offset   = [tax(taxable) - tax(taxable - lumpSumE)] - notional, floored at 0.
 * Tax = gross tax on the resident scale (Medicare and other offsets are not part of this simplification).
 */
export function computeLspia(cx: CalcContext, i: LspiaInput): number {
  const rules = cx.rules;
  const fy = rules.fy;
  const items = cx.items(GROUPS.lumpSumEYear);
  const minimum = dollarsToCents(rules.lspiaMinimum);
  if (i.lumpSumECents <= 0 && items.length === 0) {
    cx.setStatus('lspia', 'not_applicable');
    return 0;
  }
  const inputs = [Q.comp.lseRepeater, Q.comp.lseFy, Q.comp.lseAmount, Q.comp.lseTaxableIncome, Q.comp.lseOver12m];
  const toReview = (reason: string, ids: string[]) => {
    cx.setStatus('lspia', 'manual_review');
    cx.review('lspia', reason, ids, i.lumpSumECents);
    cx.lines.review({ id: 'offset.lspia', section: 'offsets', label: 'Lump sum payment in arrears tax offset', amountCents: 0, ruleId: `${fy}.lspia`, inputs, formula: 'not computed', note: reason });
    return 0;
  };
  if (i.lumpSumECents < minimum) {
    cx.setStatus('lspia', 'computed');
    cx.lines.excluded({ id: 'offset.lspia', section: 'offsets', label: 'Lump sum payment in arrears tax offset', amountCents: 0, ruleId: `${fy}.lspia`, inputs, formula: `lump sum E ${i.lumpSumECents / 100} < ${rules.lspiaMinimum}`, note: `The offset only applies when lump sum E totals at least $${rules.lspiaMinimum}.` });
    return 0;
  }
  if (items.length === 0) return toReview('Lump sum E of $1,200 or more: add each accrual year with its taxable income to work out the offset.', [Q.comp.lseRepeater]);

  type Year = { fy: string; amount: number; taxable: number; itemId: string };
  const years: Year[] = [];
  for (const it of items) {
    const yfy = cx.a.string(Q.comp.lseFy, it.id);
    const amount = cx.a.cents(Q.comp.lseAmount, it.id);
    const taxable = cx.a.cents(Q.comp.lseTaxableIncome, it.id);
    const over = cx.a.string(Q.comp.lseOver12m, it.id);
    if (amount === undefined) return toReview('An accrual year is missing its arrears amount.', [`${Q.comp.lseAmount}@${it.id}`]);
    if (taxable === undefined) return toReview('An accrual year is missing that year\'s taxable income; the notional tax cannot be worked out.', [`${Q.comp.lseTaxableIncome}@${it.id}`]);
    if (over === 'no' || cx.a.isNotSure(Q.comp.lseOver12m, it.id)) return toReview('Arrears that accrued within 12 months of payment are not eligible; check the accrual timing.', [`${Q.comp.lseOver12m}@${it.id}`]);
    if (over === undefined) cx.assume('Lump sum E accrual timing not answered; assumed to have accrued more than 12 months before payment.');
    years.push({ fy: yfy ?? 'unknown', amount, taxable, itemId: it.id });
  }
  const itemTotal = years.reduce((a, y) => a + y.amount, 0);

  const taxWith = grossTax(i.taxableCents, rules.residentScale);
  const taxWithout = grossTax(Math.max(0, i.taxableCents - i.lumpSumECents), rules.residentScale);
  const currentDiff = taxWith - taxWithout;
  // Every accrual year needs its own verified rule table: the current year's rules are never
  // substituted for a missing historical year.
  const missing = years.filter((y) => !cx.rulesFor(y.fy)).map((y) => y.fy);
  if (missing.length) return toReview(`No verified rule table for ${missing.join(', ')}: the notional tax for ${missing.length === 1 ? 'that year' : 'those years'} cannot be worked out with the correct historical rates.`, [Q.comp.lseFy]);
  if (itemTotal !== i.lumpSumECents) cx.review('lspia', `The arrears allocated to earlier years (${itemTotal / 100}) do not reconcile to the lump sum E in income (${i.lumpSumECents / 100}). Check the allocation.`, [Q.comp.lseAmount], Math.abs(itemTotal - i.lumpSumECents));
  let notional = 0;
  const parts: string[] = [];
  for (const y of years) {
    const yr = cx.rulesFor(y.fy) as RuleSet;
    const n = grossTax(y.taxable + y.amount, yr.residentScale) - grossTax(y.taxable, yr.residentScale);
    notional += n;
    parts.push(`${y.fy} (${yr.version}): tax(${(y.taxable + y.amount) / 100}) - tax(${y.taxable / 100}) = ${n / 100}`);
  }
  const offset = Math.max(0, currentDiff - notional);
  cx.setStatus('lspia', 'computed');
  cx.review('lspia', 'The lump sum in arrears offset shown is an app estimate (a marginal-tax comparison using each year\'s rates), not the statutory figure: the ATO works out the offset at assessment. Treat it as provisional.', inputs, offset);
  cx.lines.computed({ id: 'offset.lspia', section: 'offsets', label: 'Lump sum payment in arrears tax offset (app estimate, provisional)', amountCents: offset, ruleId: `${fy}.lspia`, inputs, formula: `[tax(${i.taxableCents / 100}) ${taxWith / 100} - tax(${(i.taxableCents - i.lumpSumECents) / 100}) ${taxWithout / 100} = ${currentDiff / 100}] - notional ${notional / 100} [${parts.join('; ')}]`, provisional: true, note: 'Heuristic estimate: gross tax on the resident scale only; the ATO calculates the actual offset.', detail: { currentYearExtraTaxCents: currentDiff, notionalTaxCents: notional } });
  return offset;
}
