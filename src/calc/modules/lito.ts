import type { RuleSet } from '../../rules/schema';
import { dollarsToCents, mulRate } from '../money';
import type { CalcContext } from '../context';

/**
 * Low income tax offset (cents). Reductions are cumulative:
 *   taxable <= taper1.from            -> max
 *   taper1.from < taxable <= taper1.to -> max - taper1.rate x (taxable - taper1.from)
 *   taper2.from < taxable <= taper2.to -> max - taper1.rate x (taper1.to - taper1.from) - taper2.rate x (taxable - taper2.from)
 *   above                              -> 0
 * Never negative.
 */
export function lito(taxableCents: number, rules: Pick<RuleSet, 'lito'>): number {
  const { max, taper1, taper2 } = rules.lito;
  const maxC = dollarsToCents(max);
  const t1From = dollarsToCents(taper1.from);
  const t1To = dollarsToCents(taper1.to);
  const t2From = dollarsToCents(taper2.from);
  const t2To = dollarsToCents(taper2.to);
  if (taxableCents <= t1From) return maxC;
  if (taxableCents <= t1To) return Math.max(0, maxC - mulRate(taxableCents - t1From, taper1.rate));
  const afterT1 = maxC - mulRate(t1To - t1From, taper1.rate);
  if (taxableCents <= t2To) return Math.max(0, afterT1 - mulRate(taxableCents - t2From, taper2.rate));
  return 0;
}

export function computeLito(cx: CalcContext, taxableCents: number, isResident: boolean): number {
  if (!isResident) {
    cx.setStatus('lito', 'not_applicable');
    return 0;
  }
  const amount = lito(taxableCents, cx.rules);
  cx.setStatus('lito', 'computed');
  cx.lines.computed({
    id: 'offset.lito',
    section: 'offsets',
    label: 'Low income tax offset',
    amountCents: amount,
    ruleId: `${cx.rules.fy}.lito`,
    inputs: [],
    formula: `LITO up to ${cx.rules.lito.max}, reduced ${cx.rules.lito.taper1.rate * 100}c/$ between ${cx.rules.lito.taper1.from} and ${cx.rules.lito.taper1.to}, then ${cx.rules.lito.taper2.rate * 100}c/$ to ${cx.rules.lito.taper2.to}; taxable income ${taxableCents / 100}`,
  });
  return amount;
}
