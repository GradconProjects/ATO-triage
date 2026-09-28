import { describe, expect, it } from 'vitest';
import type { CalcInput, Estimate } from '@/src/calc/types';
import { rangeEstimate } from '@/src/intelligence/range';
import { Q } from '@/src/questions/ids';
import { build, estimate, q } from './fixtures';

describe('rangeEstimate', () => {
  const questions = [q({ id: Q.ded.phoneAmount, prompt: 'Phone costs?' })];

  it('returns undefined without uncertain inputs or without recalc', () => {
    const { input } = build({ questions });
    expect(rangeEstimate(input, estimate(), () => estimate())).toBeUndefined();
    expect(rangeEstimate(input, estimate({ uncertainInputs: [Q.ded.phoneAmount] }))).toBeUndefined();
  });

  it('passes through a range the calc already provided when it cannot recalc', () => {
    const { input } = build({ questions });
    const est = estimate({ uncertainInputs: [Q.ded.phoneAmount], range: { lowCents: 1, highCents: 2, reasons: ['r'] } });
    expect(rangeEstimate(input, est)).toEqual({ lowCents: 1, highCents: 2, reasons: ['r'] });
  });

  it('recalculates with every uncertain input excluded and orders low/high by result', () => {
    const { input } = build({ questions });
    const est = estimate({ uncertainInputs: [Q.ded.phoneAmount, 'ded.tool.cost@t1'], totals: { resultCents: 114_000 } });
    const seen: CalcInput[] = [];
    const recalc = (i: CalcInput): Estimate => {
      seen.push(i);
      return estimate({ totals: { resultCents: 82_000 } });
    };
    const r = rangeEstimate(input, est, recalc);
    expect(r).toEqual({
      lowCents: 82_000,
      highCents: 114_000,
      reasons: ['Result may change depending on "Phone costs?" (uncertain or unsupported amount).', 'Result may change depending on ded.tool.cost@t1 (uncertain or unsupported amount).'],
    });
    expect(seen).toHaveLength(1);
    expect([...seen[0]!.excludeInputs!].sort()).toEqual([Q.ded.phoneAmount, 'ded.tool.cost@t1']);
    expect(seen[0]!.answers).toBe(input.answers);
  });

  it('keeps existing excludeInputs and returns undefined when the result does not move', () => {
    const { input } = build({ questions });
    const est = estimate({ uncertainInputs: [Q.ded.phoneAmount], totals: { resultCents: 100 } });
    let excluded: Set<string> | undefined;
    const r = rangeEstimate({ ...input, excludeInputs: new Set(['x']) }, est, (i) => {
      excluded = i.excludeInputs;
      return estimate({ totals: { resultCents: 100 } });
    });
    expect(r).toBeUndefined();
    expect([...excluded!].sort()).toEqual([Q.ded.phoneAmount, 'x']);
  });

  it('puts the higher result on top when excluding the uncertain amount increases the refund', () => {
    const { input } = build({ questions });
    const est = estimate({ uncertainInputs: [Q.ded.phoneAmount], totals: { resultCents: -5_000 } });
    const r = rangeEstimate(input, est, () => estimate({ totals: { resultCents: 3_000 } }));
    expect(r?.lowCents).toBe(-5_000);
    expect(r?.highCents).toBe(3_000);
  });
});
