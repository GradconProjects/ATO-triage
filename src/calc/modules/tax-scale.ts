import type { Bracket, RuleSet } from '../../rules/schema';
import { Q } from '../../questions/ids';
import type { FY } from '../../engine/types';
import { dollarsToCents, mulRate } from '../money';
import { CalcContext, fyBounds, parseIsoDate } from '../context';

/**
 * Gross tax from a bracket scale.
 *
 * Bracket convention (rules/schema.ts): `from` inclusive, `to` inclusive (null = open), `rate` is
 * marginal on every dollar above `from - 1`, `base` is the tax at `from - 1`. Internally each
 * bracket becomes { lower, upper, rate, base } in cents where the bracket covers lower < T <= upper.
 */
export interface CentsBracket {
  lower: number;          // cents; tax in this bracket = base + rate x (T - lower)
  upper: number | null;   // cents inclusive; null = open
  rate: number;
  base: number;           // cents
}

export function toCentsScale(scale: Bracket[]): CentsBracket[] {
  return scale.map((b) => ({
    lower: b.from === 0 ? 0 : dollarsToCents(b.from - 1),
    upper: b.to === null ? null : dollarsToCents(b.to),
    rate: b.rate,
    base: dollarsToCents(b.base),
  }));
}

function pickBracket(taxableCents: number, scale: CentsBracket[]): CentsBracket {
  let chosen = scale[0];
  if (!chosen) throw new Error('Empty tax scale');
  for (const b of scale) if (b.lower < taxableCents) chosen = b;
  return chosen;
}

/** Gross tax (cents) on a taxable income (cents) using a cents scale. */
export function grossTaxCents(taxableCents: number, scale: CentsBracket[]): number {
  if (taxableCents <= 0) return 0;
  const b = pickBracket(taxableCents, scale);
  return b.base + mulRate(taxableCents - b.lower, b.rate);
}

/** Gross tax (cents) on a taxable income (cents) using a rule-table scale. */
export function grossTax(taxableCents: number, scale: Bracket[]): number {
  return grossTaxCents(taxableCents, toCentsScale(scale));
}

/**
 * Part-year residents: the tax-free threshold shrinks to `thresholdCents`. Implemented by moving
 * the boundary between the first (zero-rate) bracket and the second one, then recomputing every
 * later base cumulatively:
 *   base[i] = base[i-1] + rate[i-1] x (lower[i] - lower[i-1]).
 * Formula for the threshold (rules.partYearThreshold): threshold = base + perMonth x monthsResident.
 */
export function partYearScale(scale: Bracket[], thresholdCents: number): CentsBracket[] {
  const cents = toCentsScale(scale);
  const first = cents[0];
  const second = cents[1];
  if (!first || !second) return cents;
  const out: CentsBracket[] = [{ ...first, upper: thresholdCents }, { ...second, lower: thresholdCents, base: first.base }];
  for (let i = 2; i < cents.length; i++) {
    const prev = out[i - 1]!;
    const cur = cents[i]!;
    out.push({ ...cur, base: prev.base + mulRate(cur.lower - prev.lower, prev.rate) });
  }
  return out;
}

export type ResidencyKind = 'resident' | 'foreign' | 'whm' | 'temporary' | 'unknown';

/** Residency category from Q.res.status (part-year residents count as resident). */
export function residencyKind(cx: CalcContext): ResidencyKind {
  const s = cx.a.string(Q.res.status);
  switch (s) {
    case 'resident_full':
    case 'became_resident':
    case 'ceased_resident':
      return 'resident';
    case 'foreign_full':
      return 'foreign';
    case 'whm':
      return 'whm';
    case 'temporary':
      return 'temporary';
    default:
      return 'unknown';
  }
}

/** Months of residency in the FY, counting the month of arrival / the month of departure. */
export function monthsResident(status: string, arrival: string | undefined, departure: string | undefined, fy: FY): number | undefined {
  const { from, to } = fyBounds(fy);
  const start = parseIsoDate(from)!;
  const end = parseIsoDate(to)!;
  if (status === 'became_resident') {
    const d = parseIsoDate(arrival);
    if (!d) return undefined;
    if (d < start) return 12;
    if (d > end) return 0;
    const idx = (d.getUTCMonth() - 6 + 12) % 12; // July = 0 ... June = 11
    return 12 - idx;
  }
  if (status === 'ceased_resident') {
    const d = parseIsoDate(departure);
    if (!d) return undefined;
    if (d > end) return 12;
    if (d < start) return 0;
    const idx = (d.getUTCMonth() - 6 + 12) % 12;
    return idx + 1;
  }
  return 12;
}

export function partYearThresholdCents(rules: RuleSet, months: number): number {
  return dollarsToCents(rules.partYearThreshold.base + (rules.partYearThreshold.perMonth * months));
}

export interface GrossTaxResult {
  grossTaxCents: number;
  scale: 'resident' | 'foreign' | 'whm+resident' | 'resident_part_year';
}

/**
 * Step 4 of the pipeline: gross tax on taxable income by residency.
 * - resident_full / became / ceased -> resident scale (part-year: pro-rated tax-free threshold)
 * - foreign_full -> foreign resident scale
 * - whm -> WHM scale on WHM income, remainder on the resident scale (WHM income unanswered -> review)
 * - temporary / unknown -> resident scale with an assumption note
 */
export function computeGrossTax(cx: CalcContext, taxableCents: number): GrossTaxResult {
  const { rules, lines } = cx;
  const kind = residencyKind(cx);
  const status = cx.a.string(Q.res.status);
  cx.setStatus('tax_scale', 'computed');

  if (kind === 'foreign') {
    const tax = grossTax(taxableCents, rules.foreignResidentScale);
    lines.computed({
      id: 'tax.gross',
      section: 'gross_tax',
      label: 'Gross tax (foreign resident scale)',
      amountCents: tax,
      ruleId: `${rules.fy}.foreignResidentScale`,
      inputs: [Q.res.status],
      formula: `foreign resident scale on taxable income ${taxableCents / 100}`,
    });
    return { grossTaxCents: tax, scale: 'foreign' };
  }

  if (kind === 'whm') {
    const whmIncome = cx.a.cents(Q.res.whmIncome);
    if (whmIncome === undefined) {
      const tax = grossTax(taxableCents, rules.residentScale);
      lines.review({
        id: 'tax.gross',
        section: 'gross_tax',
        label: 'Gross tax (working holiday maker: WHM income not answered)',
        amountCents: tax,
        ruleId: `${rules.fy}.whmScale`,
        inputs: [Q.res.status, Q.res.whmIncome],
        formula: `resident scale on taxable income ${taxableCents / 100} (placeholder)`,
        note: 'Working holiday maker income is taxed on its own scale; answer the WHM income question to split it.',
      });
      cx.review('tax_scale', 'Working holiday maker income not answered; WHM scale cannot be applied.', [Q.res.whmIncome], tax);
      cx.setStatus('tax_scale', 'manual_review');
      return { grossTaxCents: tax, scale: 'whm+resident' };
    }
    const whmPart = Math.min(Math.max(whmIncome, 0), taxableCents);
    const rest = taxableCents - whmPart;
    const taxWhm = grossTax(whmPart, rules.whmScale);
    // Other income is taxed at the rates for the person's residency, stacked above the WHM income
    // (no second tax-free threshold): scale(total) - scale(WHM part).
    const whmRes = cx.a.string(Q.res.whmResident);
    const otherScale = whmRes === 'yes' ? rules.residentScale : rules.foreignResidentScale;
    const taxRest = rest > 0 ? grossTax(taxableCents, otherScale) - grossTax(whmPart, otherScale) : 0;
    if (rest > 0 && whmRes !== 'yes' && whmRes !== 'no') cx.review('tax_scale', 'Working holiday maker with other income: confirm tax residency. Other income is taxed at foreign resident rates until confirmed.', [Q.res.whmResident], taxRest);
    lines.computed({
      id: 'tax.gross.whm',
      section: 'gross_tax',
      label: 'Gross tax on working holiday maker income',
      amountCents: taxWhm,
      ruleId: `${rules.fy}.whmScale`,
      inputs: [Q.res.status, Q.res.whmIncome],
      formula: `WHM scale on ${whmPart / 100}`,
    });
    lines.computed({
      id: 'tax.gross.other',
      section: 'gross_tax',
      label: `Gross tax on other income (${whmRes === 'yes' ? 'resident' : 'foreign resident'} scale)`,
      amountCents: taxRest,
      ruleId: `${rules.fy}.${whmRes === 'yes' ? 'residentScale' : 'foreignResidentScale'}`,
      inputs: [Q.res.status, Q.res.whmResident],
      formula: `${whmRes === 'yes' ? 'resident' : 'foreign resident'} scale on ${taxableCents / 100} - same scale on WHM income ${whmPart / 100}`,
    });
    return { grossTaxCents: taxWhm + taxRest, scale: 'whm+resident' };
  }

  if (kind === 'temporary') cx.assume('Temporary resident taxed on the resident scale; foreign-sourced income and CGT need review.');
  if (kind === 'unknown') cx.assume('Residency status not answered: resident tax scale assumed.');

  // Part-year resident: pro-rated tax-free threshold.
  if (status === 'became_resident' || status === 'ceased_resident') {
    const months = monthsResident(status, cx.a.string(Q.res.arrivalDate), cx.a.string(Q.res.departureDate), cx.fy);
    if (months === undefined) {
      const tax = grossTax(taxableCents, rules.residentScale);
      const dateQ = status === 'became_resident' ? Q.res.arrivalDate : Q.res.departureDate;
      lines.review({
        id: 'tax.gross',
        section: 'gross_tax',
        label: 'Gross tax (part-year resident, date missing)',
        amountCents: tax,
        ruleId: `${rules.fy}.partYearThreshold`,
        inputs: [Q.res.status, dateQ],
        formula: `resident scale on ${taxableCents / 100} with the full-year threshold (placeholder)`,
        note: 'The tax-free threshold is pro-rated for part-year residents; answer the arrival/departure date.',
      });
      cx.review('tax_scale', 'Part-year residency date missing; tax-free threshold could not be pro-rated.', [dateQ], tax);
      cx.setStatus('tax_scale', 'manual_review');
      return { grossTaxCents: tax, scale: 'resident_part_year' };
    }
    const threshold = partYearThresholdCents(rules, months);
    const scale = partYearScale(rules.residentScale, threshold);
    const tax = grossTaxCents(taxableCents, scale);
    lines.computed({
      id: 'tax.gross',
      section: 'gross_tax',
      label: `Gross tax (part-year resident, ${months} months)`,
      amountCents: tax,
      ruleId: `${rules.fy}.partYearThreshold`,
      inputs: [Q.res.status, status === 'became_resident' ? Q.res.arrivalDate : Q.res.departureDate],
      formula: `tax-free threshold = ${rules.partYearThreshold.base} + ${rules.partYearThreshold.perMonth} x ${months} months = ${threshold / 100}; resident scale above it on ${taxableCents / 100}`,
    });
    return { grossTaxCents: tax, scale: 'resident_part_year' };
  }

  const tax = grossTax(taxableCents, rules.residentScale);
  lines.computed({
    id: 'tax.gross',
    section: 'gross_tax',
    label: 'Gross tax (resident scale)',
    amountCents: tax,
    ruleId: `${rules.fy}.residentScale`,
    inputs: [Q.res.status],
    formula: `resident scale on taxable income ${taxableCents / 100}`,
  });
  return { grossTaxCents: tax, scale: 'resident' };
}
