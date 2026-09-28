import { describe, expect, it } from 'vitest';
import { centsToDollars, dollarsToCents, floorToDollar, formatCents, mulRate, pct, sumCents } from '@/src/calc/money';

describe('money helpers', () => {
  it('dollarsToCents rounds half-up to the cent', () => {
    expect(dollarsToCents(1234.56)).toBe(123456);
    expect(dollarsToCents(0.1 + 0.2)).toBe(30);
    expect(dollarsToCents(1.005)).toBe(101);
    expect(dollarsToCents(18200)).toBe(1820000);
  });
  it('centsToDollars', () => {
    expect(centsToDollars(123456)).toBe(1234.56);
    expect(centsToDollars(0)).toBe(0);
  });
  it('mulRate rounds half-up', () => {
    expect(mulRate(100000, 0.16)).toBe(16000);
    expect(mulRate(1, 0.5)).toBe(1);
    expect(mulRate(3, 0.5)).toBe(2);
    expect(mulRate(1516600, 0.015)).toBe(22749);
    expect(mulRate(2166700, 0.015)).toBe(32501);
    expect(mulRate(0, 0.45)).toBe(0);
  });
  it('pct uses a 0-100 percentage', () => {
    expect(pct(25000, 33.33)).toBe(8333);
    expect(pct(100000, 50)).toBe(50000);
    expect(pct(100000, 100)).toBe(100000);
    expect(pct(100000, 0)).toBe(0);
  });
  it('floorToDollar rounds down to the whole dollar (towards -infinity)', () => {
    expect(floorToDollar(123456)).toBe(123400);
    expect(floorToDollar(123400)).toBe(123400);
    expect(floorToDollar(99)).toBe(0);
    expect(floorToDollar(-150)).toBe(-200);
  });
  it('formatCents', () => {
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(-5)).toBe('-$0.05');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(100000000)).toBe('$1,000,000.00');
    expect(formatCents(7)).toBe('$0.07');
  });
  it('sumCents ignores undefined', () => {
    expect(sumCents(1, undefined, 2, null)).toBe(3);
    expect(sumCents()).toBe(0);
  });
  it('rejects non-finite input', () => {
    expect(() => dollarsToCents(Number.NaN)).toThrow();
    expect(() => mulRate(Number.POSITIVE_INFINITY, 0.1)).toThrow();
  });
});
