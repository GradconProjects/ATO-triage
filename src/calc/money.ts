import Decimal from 'decimal.js';

/**
 * Integer-cent money helpers. Every amount that flows through the calculation engine is an
 * integer number of cents; rates from the rule tables are decimal fractions (0.16).
 * Rounding is always half-up to the cent (the ATO rounds tax to the nearest cent).
 */

const HALF_UP = Decimal.ROUND_HALF_UP;

function assertFinite(n: number, what: string): void {
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new TypeError(`${what} must be a finite number, got ${String(n)}`);
}

/** Whole or fractional dollars -> integer cents (half-up to the cent). */
export function dollarsToCents(dollars: number): number {
  assertFinite(dollars, 'dollars');
  return new Decimal(dollars).mul(100).toDecimalPlaces(0, HALF_UP).toNumber();
}

/** Integer cents -> dollars as a JS number (may have two decimals). */
export function centsToDollars(cents: number): number {
  assertFinite(cents, 'cents');
  return new Decimal(cents).div(100).toNumber();
}

/** cents x rate (decimal fraction, e.g. 0.16), rounded half-up to the cent. */
export function mulRate(cents: number, rate: number): number {
  assertFinite(cents, 'cents');
  assertFinite(rate, 'rate');
  return new Decimal(cents).mul(rate).toDecimalPlaces(0, HALF_UP).toNumber();
}

/** cents x (percent / 100) where percent is 0-100, rounded half-up to the cent. */
export function pct(cents: number, percent0to100: number): number {
  assertFinite(cents, 'cents');
  assertFinite(percent0to100, 'percent');
  return new Decimal(cents).mul(percent0to100).div(100).toDecimalPlaces(0, HALF_UP).toNumber();
}

/** Round cents DOWN to the whole dollar (towards negative infinity), returned in cents. */
export function floorToDollar(cents: number): number {
  assertFinite(cents, 'cents');
  return new Decimal(cents).div(100).floor().mul(100).toNumber();
}

/** Sum of integer cents; ignores undefined/null entries. */
export function sumCents(...values: Array<number | undefined | null>): number {
  let total = 0;
  for (const v of values) {
    if (v === undefined || v === null) continue;
    assertFinite(v, 'cents');
    total += v;
  }
  return total;
}

/** "$1,234.56"; negatives as "-$1,234.56". */
export function formatCents(cents: number): string {
  assertFinite(cents, 'cents');
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const withCommas = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = `$${withCommas}.${rem.toString().padStart(2, '0')}`;
  return cents < 0 && abs !== 0 ? `-${body}` : body;
}

/** Whole dollars from a rule table -> cents (thresholds are stored as whole dollars). */
export function dollars(wholeDollars: number): number {
  return dollarsToCents(wholeDollars);
}
