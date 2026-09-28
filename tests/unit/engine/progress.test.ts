import { describe, expect, it } from 'vitest';
import type { OccupationTag, Question } from '@/src/engine/types';
import { MODULE_ORDER } from '@/src/engine/types';
import { computeProgress } from '@/src/engine/progress';
import { visibleQuestions } from '@/src/engine/visibility';
import { ctx, item, notSure, q, rec, view, yesNo } from './fixtures';

const noTags = new Set<OccupationTag>();

const bank: Question[] = [
  q({ id: 'core.fy', module: 'core', type: 'single', options: [{ value: '2025-26', label: '2025-26' }] }),
  q({ id: 'core.optional', module: 'core', type: 'text', required: false }),
  q({ id: 'emp.employer', module: 'employment', type: 'repeater', repeater: { groupId: 'employer', itemLabel: 'Employer', addLabel: 'Add', minItems: 1 } }),
  q({ id: 'emp.employer.gross', module: 'employment', repeaterGroup: 'employer' }),
  q({ id: 'emp.employer.withheld', module: 'employment', repeaterGroup: 'employer' }),
  q({ id: 'ded.car.any', module: 'deductions', type: 'yes_no_unsure' }),
  q({ id: 'ded.car.km', module: 'deductions', type: 'km', showIf: { q: 'ded.car.any', eq: 'yes' } }),
  q({ id: 'off.zone', module: 'offsets', type: 'single', options: yesNo }),
];

const byModule = (p: ReturnType<typeof computeProgress>, m: string) => p.byModule.find((x) => x.module === m);

describe('computeProgress', () => {
  it('lists every module in MODULE_ORDER and treats a module with nothing required as 100%', () => {
    const p = computeProgress(visibleQuestions(bank, view(), ctx(), noTags), view());
    expect(p.byModule.map((m) => m.module)).toEqual([...MODULE_ORDER]);
    expect(byModule(p, 'rental')).toEqual({ module: 'rental', required: 0, answered: 0, pct: 100 });
  });

  it('counts only visible required non-repeater questions; only state answered counts', () => {
    const a = view([
      rec('core.fy', '2025-26'),
      notSure('ded.car.any'),
      rec('off.zone', 'yes', { state: 'imported', source: 'document' }),
    ]);
    const p = computeProgress(visibleQuestions(bank, a, ctx(), noTags), a);
    expect(byModule(p, 'core')).toEqual({ module: 'core', required: 1, answered: 1, pct: 100 });
    expect(byModule(p, 'employment')).toEqual({ module: 'employment', required: 0, answered: 0, pct: 100 });
    expect(byModule(p, 'deductions')).toEqual({ module: 'deductions', required: 1, answered: 0, pct: 0 });
    expect(byModule(p, 'offsets')).toEqual({ module: 'offsets', required: 1, answered: 0, pct: 0 });
    expect(p.overall).toBe(33); // 1 of 3, rounded down
    expect(p.incomeModulesPct).toBe(100); // nothing required in income modules
  });

  it('recomputes with visibility: answering yes reveals a new required question', () => {
    const before = view([rec('core.fy', '2025-26'), rec('ded.car.any', 'no'), rec('off.zone', 'yes')]);
    expect(computeProgress(visibleQuestions(bank, before, ctx(), noTags), before).overall).toBe(100);
    const after = view([rec('core.fy', '2025-26'), rec('ded.car.any', 'yes'), rec('off.zone', 'yes')]);
    const p = computeProgress(visibleQuestions(bank, after, ctx(), noTags), after);
    expect(byModule(p, 'deductions')).toEqual({ module: 'deductions', required: 2, answered: 1, pct: 50 });
    expect(p.overall).toBe(75);
  });

  it('counts repeater children per item and reports incomeModulesPct over income modules only', () => {
    const items = [item('e1', 'employer', 0), item('e2', 'employer', 1)];
    const a = view([rec('emp.employer.gross', 100, { item: 'e1' }), rec('emp.employer.withheld', 10, { item: 'e1' }), rec('emp.employer.gross', 5, { item: 'e2' })], items);
    const p = computeProgress(visibleQuestions(bank, a, ctx(), noTags), a);
    expect(byModule(p, 'employment')).toEqual({ module: 'employment', required: 4, answered: 3, pct: 75 });
    expect(p.incomeModulesPct).toBe(75);
    // overall: core 0/1, employment 3/4, deductions 0/1, offsets 0/1 -> 3/7 = 42.8 -> 42
    expect(p.overall).toBe(42);
  });

  it('weightedPct weights modules by MODULE_WEIGHTS', () => {
    // core (w1): 1/1 answered; employment (w3): 0/1 answered -> (1*1 + 3*0) / (1*1 + 3*1) = 25%
    const a = view([rec('core.fy', '2025-26'), rec('ded.car.any', 'no'), rec('off.zone', 'yes')], [item('e1', 'employer')]);
    const vis = visibleQuestions(bank, a, ctx(), noTags).filter((v) => v.key !== 'emp.employer.withheld@e1');
    const p = computeProgress(vis, a);
    // required: core 1 (w1), employment 1 (w3), deductions 1 (w2), offsets 1 (w1) ; answered all except employment
    expect(p.overall).toBe(75);
    expect(p.weightedPct).toBe(Math.floor(((1 + 0 + 2 + 1) / (1 + 3 + 2 + 1)) * 100));
    expect(p.incomeModulesPct).toBe(0);
  });

  it('is 100 everywhere when nothing is required', () => {
    const p = computeProgress([], view());
    expect(p.overall).toBe(100);
    expect(p.weightedPct).toBe(100);
    expect(p.incomeModulesPct).toBe(100);
  });
});
