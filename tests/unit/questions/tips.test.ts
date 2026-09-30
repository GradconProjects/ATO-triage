import { describe, expect, it } from 'vitest';
import { QUESTIONS_BY_ID } from '@/src/questions';
import { questionTip } from '@/src/questions/tips';
import { Q } from '@/src/questions/ids';

describe('question tips', () => {
  it('private health tier tip shows that year’s thresholds', () => {
    expect(questionTip(Q.phi.policyTier, '2025-26')).toContain('$101,000');
    expect(questionTip(Q.phi.policyTier, '2023-24')).toContain('$93,000');
  });
  it('every tip is for a real question and renders for every year', () => {
    for (const id of [Q.phi.policyTier, Q.phi.cover, Q.ded.carMethod, Q.ded.wfhMethod, Q.emp.lumpA, Q.fam.dependantsCount]) {
      expect(QUESTIONS_BY_ID.has(id), id).toBe(true);
      for (const fy of ['2023-24', '2024-25', '2025-26', '2026-27'] as const) expect(questionTip(id, fy)).toMatch(/\w/);
    }
    expect(questionTip('no.such.question', '2025-26')).toBeUndefined();
  });
});
