import { describe, expect, it } from 'vitest';
import { lito } from '@/src/calc/modules/lito';
import { RULES, c } from './fixture';

describe('LITO (700 max, 5c 37,500-45,000, 1.5c 45,000-66,667, cumulative)', () => {
  const cases: Array<[number, number]> = [
    [0, c(700)],
    [18200, c(700)],
    [37500, c(700)],
    [37501, c(699.95)],
    [41250, c(512.5)],
    [45000, c(325)],
    [45001, c(324.98)],
    [60166, c(97.51)],
    [66666, 1], // 325 - 21,666 x 1.5c (324.99) = 0.01
    [66667, 0],
    [66668, 0],
    [100000, 0],
  ];
  for (const [income, expected] of cases) {
    it(`$${income} -> ${expected} cents`, () => {
      expect(lito(c(income), RULES)).toBe(expected);
    });
  }
});
