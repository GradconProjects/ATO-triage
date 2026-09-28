import { describe, expect, it } from 'vitest';
import type { Progress } from '@/src/engine/progress';
import { completenessFrom, confidence } from '@/src/intelligence/scoring';
import type { Flag } from '@/src/intelligence/types';
import { estimate } from './fixtures';

const flag = (over: Partial<Flag> = {}): Flag => ({ code: 'X', kind: 'review', severity: 'warning', message: 'm', questionIds: [], ...over });

describe('completenessFrom', () => {
  it('uses the weighted percentage and copies module rows', () => {
    const progress: Progress = { overall: 50, weightedPct: 75, incomeModulesPct: 100, byModule: [{ module: 'core', required: 1, answered: 1, pct: 100 }] };
    const c = completenessFrom(progress);
    expect(c).toEqual({ pct: 75, incomeModulesPct: 100, byModule: [{ module: 'core', required: 1, answered: 1, pct: 100 }] });
    expect(c.byModule[0]).not.toBe(progress.byModule[0]);
  });
});

describe('confidence', () => {
  it('is high at 100% with no review flags and no manual review', () => {
    const c = confidence(estimate(), [flag({ kind: 'opportunity', severity: 'info' })], { pct: 100 });
    expect(c.level).toBe('high');
    expect(c.reasons.length).toBeGreaterThan(0);
  });
  it('is medium at 100% with a warning review flag, and at 90% with a warning', () => {
    expect(confidence(estimate(), [flag()], { pct: 100 }).level).toBe('medium');
    const c = confidence(estimate(), [flag()], { pct: 90 });
    expect(c.level).toBe('medium');
    expect(c.reasons.join(' ')).toContain('90%');
    expect(c.reasons.join(' ')).toContain('need review');
  });
  it('is medium at 100% when a module is routed to manual review', () => {
    expect(confidence(estimate({ manualReview: [{ module: 'etp', reason: 'r', questionIds: [] }] }), [], { pct: 100 }).level).toBe('medium');
  });
  it('is low at 89%', () => {
    expect(confidence(estimate(), [], { pct: 89 }).level).toBe('low');
  });
  it('is low with any blocker, even at 100%', () => {
    const c = confidence(estimate(), [flag({ code: 'SUPER_NOI_MISSING', kind: 'missing', severity: 'blocker' })], { pct: 100 });
    expect(c.level).toBe('low');
    expect(c.reasons[0]).toContain('SUPER_NOI_MISSING');
  });
});
