import { describe, expect, it } from 'vitest';
import { AnswerView } from '@/src/engine/answers';
import { GROUPS, Q } from '@/src/questions/ids';
import { QUESTIONS_BY_ID } from '@/src/questions';
import { validateAnswer } from '@/src/engine';
import { allowanceWrites, employerWrites, matchEmployerItem, type ExtractedEmployer } from '@/src/lib/documents/prefill';

const emp: ExtractedEmployer = {
  name: 'Acme Care Pty Ltd', abn: '12 345 678 901', gross: 62000.5, withheld: 11000, rfb: null, resc: 0,
  lumpA: null, lumpAType: null, lumpB: null, lumpD: null, lumpE: 1200, taxReady: true,
  allowances: [{ description: 'Tool allowance', type: 'tool', amount: 520 }],
};
const rec = (questionId: string, repeaterItemId: string | null, value: unknown) => ({ questionId, repeaterItemId, value, state: 'answered' as const, source: 'user' as const, version: 1 });

describe('statement prefill', () => {
  it('maps employer figures to cents and only writes printed values', () => {
    const w = new Map(employerWrites(emp, 'i1').map((x) => [x.questionId, x.value]));
    expect(w.get(Q.emp.gross)).toBe(6200050);
    expect(w.get(Q.emp.withheld)).toBe(1100000);
    expect(w.get(Q.emp.abn)).toBe('12345678901');
    expect(w.get(Q.emp.lumpE)).toBe(120000);
    expect(w.get(Q.emp.taxReady)).toBe('yes');
    expect(w.has(Q.emp.rfb)).toBe(false);
    expect(w.has(Q.emp.lumpA)).toBe(false);
  });
  it('every write passes the question bank validation', () => {
    for (const x of [...employerWrites(emp, 'i1'), ...allowanceWrites(emp.allowances[0]!, 'a1', emp.name)]) {
      const q = QUESTIONS_BY_ID.get(x.questionId);
      expect(q, x.questionId).toBeDefined();
      expect(validateAnswer(q!, x.value, { fy: '2025-26', profileOccupations: [] }).errors, x.questionId).toEqual([]);
    }
  });
  it('matches an existing employer by name, else a blank item, else none', () => {
    const items = [{ id: 'a', groupId: GROUPS.employer, sortOrder: 0 }, { id: 'b', groupId: GROUPS.employer, sortOrder: 1 }];
    const view = new AnswerView([rec(Q.emp.name, 'b', 'ACME CARE')], items);
    expect(matchEmployerItem(view, 'Acme Care Pty Ltd', new Set())).toBe('b');
    expect(matchEmployerItem(view, 'Other Co', new Set())).toBe('a');
    expect(matchEmployerItem(view, 'Other Co', new Set(['a']))).toBeNull();
  });
});
