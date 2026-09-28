import { describe, expect, it } from 'vitest';
import { formatCents, fyDateBounds, isValidIsoDate, parseMoneyToCents, validateAnswer } from '@/src/engine/validation';
import { ctx, q, yesNo } from './fixtures';

const ok = { errors: [], warnings: [] };

describe('validateAnswer', () => {
  it('money must be an integer number of cents and non-negative unless allowNegative', () => {
    const m = q({ id: 'a.m', type: 'money' });
    expect(validateAnswer(m, 12345, ctx())).toEqual(ok);
    expect(validateAnswer(m, 0, ctx())).toEqual(ok);
    expect(validateAnswer(m, 12.5, ctx()).errors).toHaveLength(1);
    expect(validateAnswer(m, '123', ctx()).errors).toHaveLength(1);
    expect(validateAnswer(m, Number.NaN, ctx()).errors).toHaveLength(1);
    expect(validateAnswer(m, -1, ctx()).errors[0]).toMatch(/negative/);
    expect(validateAnswer(q({ id: 'a.m', type: 'money', allowNegative: true }), -1, ctx())).toEqual(ok);
  });

  it('number must be finite', () => {
    const n = q({ id: 'a.n', type: 'number' });
    expect(validateAnswer(n, 1.5, ctx())).toEqual(ok);
    expect(validateAnswer(n, Number.POSITIVE_INFINITY, ctx()).errors).toHaveLength(1);
    expect(validateAnswer(n, 'x', ctx()).errors).toHaveLength(1);
  });

  it('percent is 0-100', () => {
    const p = q({ id: 'a.p', type: 'percent' });
    expect(validateAnswer(p, 0, ctx())).toEqual(ok);
    expect(validateAnswer(p, 100, ctx())).toEqual(ok);
    expect(validateAnswer(p, 100.5, ctx()).errors).toHaveLength(1);
    expect(validateAnswer(p, -0.1, ctx()).errors).toHaveLength(1);
  });

  it('km is a non-negative integer', () => {
    const k = q({ id: 'a.k', type: 'km' });
    expect(validateAnswer(k, 5000, ctx())).toEqual(ok);
    expect(validateAnswer(k, 12.5, ctx()).errors).toHaveLength(1);
    expect(validateAnswer(k, -3, ctx()).errors).toHaveLength(1);
  });

  it('date must be a real ISO date', () => {
    const d = q({ id: 'a.d', type: 'date' });
    expect(validateAnswer(d, '2025-08-15', ctx())).toEqual(ok);
    expect(validateAnswer(d, '2025-02-30', ctx()).errors).toHaveLength(1);
    expect(validateAnswer(d, '15/08/2025', ctx()).errors).toHaveLength(1);
    expect(validateAnswer(d, '2025-8-1', ctx()).errors).toHaveLength(1);
  });

  it('date inFinancialYear enforces the case FY bounds', () => {
    const d = q({ id: 'a.d', type: 'date', validation: [{ kind: 'inFinancialYear' }] });
    expect(validateAnswer(d, '2025-07-01', ctx({ fy: '2025-26' }))).toEqual(ok);
    expect(validateAnswer(d, '2026-06-30', ctx({ fy: '2025-26' }))).toEqual(ok);
    expect(validateAnswer(d, '2025-06-30', ctx({ fy: '2025-26' })).errors[0]).toMatch(/2025-07-01/);
    expect(validateAnswer(d, '2026-07-01', ctx({ fy: '2025-26' })).errors).toHaveLength(1);
    // without the rule, any date in any year is fine (prior-year losses, LSE accrual years)
    expect(validateAnswer(q({ id: 'a.d', type: 'date' }), '2019-01-01', ctx())).toEqual(ok);
    const custom = q({ id: 'a.d', type: 'date', validation: [{ kind: 'inFinancialYear', message: 'Custom' }] });
    expect(validateAnswer(custom, '2019-01-01', ctx()).errors).toEqual(['Custom']);
  });

  it('date_range requires from <= to and both within FY when asked', () => {
    const r = q({ id: 'a.r', type: 'date_range' });
    expect(validateAnswer(r, { from: '2025-07-01', to: '2025-07-01' }, ctx())).toEqual(ok);
    expect(validateAnswer(r, { from: '2025-08-01', to: '2025-07-01' }, ctx()).errors).toHaveLength(1);
    expect(validateAnswer(r, { from: 'x', to: '2025-07-01' }, ctx()).errors).toHaveLength(1);
    expect(validateAnswer(r, '2025-07-01', ctx()).errors).toHaveLength(1);
    const fyRange = q({ id: 'a.r', type: 'date_range', validation: [{ kind: 'inFinancialYear' }] });
    expect(validateAnswer(fyRange, { from: '2025-07-01', to: '2026-06-30' }, ctx())).toEqual(ok);
    expect(validateAnswer(fyRange, { from: '2025-06-01', to: '2026-07-30' }, ctx()).errors).toHaveLength(2);
  });

  it('single must be one of the options', () => {
    const s = q({ id: 'a.s', type: 'single', options: yesNo });
    expect(validateAnswer(s, 'yes', ctx())).toEqual(ok);
    expect(validateAnswer(s, 'maybe', ctx()).errors).toHaveLength(1);
    expect(validateAnswer(s, ['yes'], ctx()).errors).toHaveLength(1);
  });

  it('yes_no_unsure accepts only yes / no / not_sure', () => {
    const y = q({ id: 'a.y', type: 'yes_no_unsure' });
    expect(validateAnswer(y, 'not_sure', ctx())).toEqual(ok);
    expect(validateAnswer(y, 'unsure', ctx()).errors).toHaveLength(1);
  });

  it('multi must be an array of option values with no exclusive mixing', () => {
    const m = q({
      id: 'a.multi',
      type: 'multi',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
        { value: 'none', label: 'None', exclusive: true },
        { value: 'not_sure', label: 'Not sure', exclusive: true },
      ],
    });
    expect(validateAnswer(m, ['a', 'b'], ctx())).toEqual(ok);
    expect(validateAnswer(m, ['none'], ctx())).toEqual(ok);
    expect(validateAnswer(m, ['a', 'none'], ctx()).errors[0]).toMatch(/none/);
    expect(validateAnswer(m, ['not_sure', 'b'], ctx()).errors).toHaveLength(1);
    expect(validateAnswer(m, ['zzz'], ctx()).errors).toHaveLength(1);
    expect(validateAnswer(m, 'a', ctx()).errors).toHaveLength(1);
    expect(validateAnswer(m, ['a', 'a'], ctx()).errors).toHaveLength(1);
  });

  it('text honours maxLength and pattern', () => {
    const t = q({ id: 'a.t', type: 'text', validation: [{ kind: 'maxLength', value: 3 }, { kind: 'pattern', value: '^[0-9]+$', message: 'Digits only' }] });
    expect(validateAnswer(t, '123', ctx())).toEqual(ok);
    expect(validateAnswer(t, '1234', ctx()).errors).toEqual(['Must be 3 characters or fewer']);
    expect(validateAnswer(t, 'ab', ctx()).errors).toEqual(['Digits only']);
    expect(validateAnswer(t, 12, ctx()).errors).toHaveLength(1);
  });

  it('min / max are errors, warnAbove is only ever a warning', () => {
    const m = q({
      id: 'a.m',
      type: 'money',
      validation: [
        { kind: 'min', value: 100 },
        { kind: 'max', value: 1_000_000 },
        { kind: 'warnAbove', value: 200_000, message: 'That is a lot for one uniform item' },
      ],
    });
    expect(validateAnswer(m, 50, ctx()).errors).toEqual(['Must be at least $1.00']);
    expect(validateAnswer(m, 2_000_000, ctx()).errors).toEqual(['Must be no more than $10,000.00']);
    const warned = validateAnswer(m, 250_000, ctx());
    expect(warned.errors).toEqual([]);
    expect(warned.warnings).toEqual(['That is a lot for one uniform item']);
    expect(validateAnswer(m, 150_000, ctx())).toEqual(ok);
    const custom = q({ id: 'a.n', type: 'number', validation: [{ kind: 'min', value: 1, message: 'At least one' }] });
    expect(validateAnswer(custom, 0, ctx()).errors).toEqual(['At least one']);
  });

  it('null / undefined is an error; repeater questions have nothing to validate', () => {
    expect(validateAnswer(q({ id: 'a.m' }), undefined, ctx()).errors).toHaveLength(1);
    expect(validateAnswer(q({ id: 'a.m' }), null, ctx()).errors).toHaveLength(1);
    expect(validateAnswer(q({ id: 'a.r', type: 'repeater' }), undefined, ctx())).toEqual(ok);
  });
});

describe('parseMoneyToCents', () => {
  it.each([
    ['$1,234.56', 123456],
    ['1234', 123400],
    ['1,234', 123400],
    ['0', 0],
    ['0.5', 50],
    ['.5', 50],
    ['12.', 1200],
    ['$ 99.99', 9999],
    ['-12.50', -1250],
    ['-$1,000', -100000],
    ['+7', 700],
  ])('parses %s -> %i', (text, cents) => {
    expect(parseMoneyToCents(text)).toBe(cents);
  });

  it.each(['', '   ', '$', 'abc', '12.345', '1..2', '1,2,3.4.5', '--5', '1e3', '.'])('rejects %j', (text) => {
    expect(parseMoneyToCents(text)).toBeNull();
  });
});

describe('formatCents', () => {
  it('formats cents as dollars with commas', () => {
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(100000000)).toBe('$1,000,000.00');
    expect(formatCents(-1250)).toBe('-$12.50');
  });
  it('round-trips with parseMoneyToCents', () => {
    for (const c of [0, 1, 99, 100, 123456, 99999999, -4321]) expect(parseMoneyToCents(formatCents(c))).toBe(c);
  });
});

describe('fyDateBounds / isValidIsoDate', () => {
  it('maps a FY to its July-June bounds', () => {
    expect(fyDateBounds('2025-26')).toEqual({ from: '2025-07-01', to: '2026-06-30' });
    expect(fyDateBounds('2023-24')).toEqual({ from: '2023-07-01', to: '2024-06-30' });
  });
  it('validates calendar dates', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2023-02-29')).toBe(false);
    expect(isValidIsoDate('2025-13-01')).toBe(false);
    expect(isValidIsoDate(20250101)).toBe(false);
  });
});
