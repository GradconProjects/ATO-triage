import Decimal from 'decimal.js';
import type { CalcContext } from '../context';
import { daysBetween, fyBounds, parseIsoDate } from '../context';
import { lineId } from '../explain';

/**
 * Diminishing value decline for the first year of use:
 *   cost x (200% / effectiveLifeYears) x daysHeld / 365 x workPct / 100
 * rounded half-up to the cent at the end.
 */
export function diminishingValue(costCents: number, effectiveLifeYears: number, daysHeld: number, workPct = 100): number {
  if (effectiveLifeYears <= 0 || daysHeld <= 0) return 0;
  return new Decimal(costCents)
    .mul(2)
    .div(effectiveLifeYears)
    .mul(Math.min(daysHeld, 365))
    .div(365)
    .mul(workPct)
    .div(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/** Days held from the date first used to the end of the FY (inclusive of both days); undefined outside the FY. */
export function daysHeldInFy(dateFirstUsed: string, fy: Parameters<typeof fyBounds>[0]): number | undefined {
  const d = parseIsoDate(dateFirstUsed);
  if (!d) return undefined;
  const { from, to } = fyBounds(fy);
  const start = parseIsoDate(from)!;
  const end = parseIsoDate(to)!;
  if (d > end) return 0;
  if (d < start) return daysBetween(start, end) + 1;
  return daysBetween(d, end) + 1;
}

export interface DeclineArgs {
  idPrefix: string;
  itemId: string | null;
  label: string;
  category: string;
  costCents: number;
  workPct: number;
  /** question ids that feed this line (amount question, paid, work pct...). */
  inputs: string[];
  /** `${base}.effective_life` and `${base}.date` question ids. */
  effectiveLifeQ: string;
  dateQ: string;
  /** Key of the amount answer (for uncertainInputs). */
  key: string;
}

/**
 * Capital item -> decline in value line. Effective life from `${base}.effective_life` (else review);
 * pro-rata from `${base}.date` (else a full year with an assumption note).
 * Returns the deductible cents (0 when routed to review).
 */
export function declineInValueLine(cx: CalcContext, a: DeclineArgs): number {
  const life = cx.scopedNumber(a.effectiveLifeQ, a.itemId);
  const id = lineId(a.idPrefix, a.itemId);
  if (life === undefined || life <= 0) {
    cx.setStatus('decline_in_value', 'manual_review');
    cx.review('decline_in_value', `${a.label}: effective life not answered, so the decline in value cannot be worked out.`, [a.effectiveLifeQ], a.costCents);
    cx.markUncertain(a.key);
    cx.lines.review({
      id,
      section: 'deductions',
      label: `${a.label} (decline in value)`,
      amountCents: a.costCents,
      ruleId: `${cx.rules.fy}.declineInValue`,
      inputs: [...a.inputs, a.effectiveLifeQ],
      formula: `cost ${a.costCents / 100} >= $${cx.rules.instantDeductionThreshold}: decline in value needs an effective life`,
      note: 'Item costs $300 or more: it is written off over its effective life. Answer the effective life to compute it.',
      category: a.category,
      itemId: a.itemId,
      detail: { costCents: a.costCents, workPct: a.workPct },
    });
    return 0;
  }
  const date = cx.scopedString(a.dateQ, a.itemId);
  let days = date ? daysHeldInFy(date, cx.fy) : undefined;
  let dateNote = '';
  if (days === undefined) {
    days = 365;
    dateNote = date ? ' (date not recognised: full year assumed)' : ' (no date answered: full year assumed)';
    cx.assume(`${a.label}: date first used not answered; decline in value computed for a full year.`);
  }
  const amount = diminishingValue(a.costCents, life, days, a.workPct);
  cx.setStatus('decline_in_value', 'computed');
  cx.lines.computed({
    id,
    section: 'deductions',
    label: `${a.label} (decline in value)`,
    amountCents: amount,
    ruleId: `${cx.rules.fy}.declineInValue`,
    inputs: [...a.inputs, a.effectiveLifeQ, a.dateQ],
    formula: `${a.costCents / 100} x (200% / ${life} yrs) x ${days}/365 days x ${a.workPct}% work use${dateNote}`,
    category: a.category,
    itemId: a.itemId,
    detail: { costCents: a.costCents, effectiveLifeYears: life, daysHeld: days, workPct: a.workPct, method: 'diminishing_value' },
  });
  return amount;
}
