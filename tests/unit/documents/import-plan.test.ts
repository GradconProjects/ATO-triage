import { describe, expect, it } from 'vitest';
import { AnswerView } from '@/src/engine/answers';
import type { AnswerRecord, RepeaterItem } from '@/src/engine/types';
import { GROUPS, Q } from '@/src/questions/ids';
import { QUESTION_BANK } from '@/src/questions';
import { allowanceWrites, employerWrites, type ExtractedEmployer } from '@/src/lib/documents/prefill';
import { planStatementImport, planWrites } from '@/src/lib/documents/plan';
import { POSSIBLE_DUPLICATE } from '@/src/intelligence/consistency';
import type { IntelligenceContext } from '@/src/intelligence/types';
import { calculate } from '@/src/calc/pipeline';
import { mkInput } from '../calc/fixture';

const emp: ExtractedEmployer = {
  name: 'Sunrise Disability Services Pty Ltd', abn: '51 824 753 556', gross: 58420, withheld: 9874, rfb: 0, resc: 2500,
  lumpA: 0, lumpAType: null, lumpB: null, lumpD: null, lumpE: 0, taxReady: true,
  allowances: [{ description: 'Car allowance', type: 'car_km', amount: 1200 }],
};

/** The state after importing `emp` once: one employer item and one allowance item. */
function afterFirstImport(): { view: AnswerView; items: RepeaterItem[]; records: AnswerRecord[] } {
  const items: RepeaterItem[] = [{ id: 'e1', groupId: GROUPS.employer, sortOrder: 0 }, { id: 'a1', groupId: GROUPS.allowance, sortOrder: 0 }];
  const writes = [...employerWrites(emp, 'e1'), ...allowanceWrites(emp.allowances[0]!, 'a1', emp.name), { questionId: Q.allow.any, repeaterItemId: null, value: 'yes' }];
  const records = writes.map((w, i) => ({ questionId: w.questionId, repeaterItemId: w.repeaterItemId, value: w.value, state: 'answered' as const, source: 'prefill_confirmed' as const, version: i + 1 }));
  return { view: new AnswerView(records, items), items, records };
}

describe('importing the same statement twice', () => {
  it('plans no new records: the employer and allowance only link the document', () => {
    const [plan] = planStatementImport(afterFirstImport().view, [emp]);
    expect(plan!.action).toBe('link');
    expect(plan!.targetItemId).toBe('e1');
    expect(plan!.allowances[0]!.action).toBe('link');
    expect(planWrites(plan!, emp, 'e1').map((w) => w.questionId)).toEqual([Q.emp.name]);
  });

  it('does not double income: salary and withholding are unchanged after a second import', () => {
    const { records, items } = afterFirstImport();
    const once = calculate({ ...mkInput([]), answers: new AnswerView(records, items), questions: QUESTION_BANK, visible: new Set(records.map((r) => (r.repeaterItemId ? `${r.questionId}@${r.repeaterItemId}` : r.questionId))) });
    const [plan] = planStatementImport(new AnswerView(records, items), [emp]);
    const again = planWrites(plan!, emp, 'e1').map((w, i) => ({ ...w, state: 'answered' as const, version: 100 + i }));
    const all = [...records, ...again];
    const twice = calculate({ ...mkInput([]), answers: new AnswerView(all, items), questions: QUESTION_BANK, visible: new Set(all.map((r) => (r.repeaterItemId ? `${r.questionId}@${r.repeaterItemId}` : r.questionId))) });
    expect(twice.totals.assessableIncomeCents).toBe(once.totals.assessableIncomeCents);
    expect(twice.totals.creditsCents).toBe(once.totals.creditsCents);
  });

  it('holds back an allowance of the same type with a different amount as a possible duplicate', () => {
    const changed = { ...emp, allowances: [{ description: 'Car allowance', type: 'car_km' as const, amount: 1300 }] };
    const [plan] = planStatementImport(afterFirstImport().view, [changed]);
    expect(plan!.allowances[0]!.action).toBe('review_duplicate');
  });

  it('matches on ABN even when the name is written differently, and updates changed figures', () => {
    const renamed = { ...emp, name: 'SUNRISE DISABILITY SERVICES', gross: 60000 };
    const [plan] = planStatementImport(afterFirstImport().view, [renamed]);
    expect(plan!.targetItemId).toBe('e1');
    expect(plan!.action).toBe('update');
    expect(plan!.changes.map((c) => c.questionId)).toContain(Q.emp.gross);
  });

  it('adds a genuinely new employer', () => {
    const other = { ...emp, name: 'Other Co', abn: '12345678901', allowances: [] };
    expect(planStatementImport(afterFirstImport().view, [other])[0]!.action).toBe('add');
  });
});

describe('possible duplicates across sources', () => {
  it('flags the same amount as a work deduction and a business-activity expense, without removing it', () => {
    const items: RepeaterItem[] = [{ id: 'b1', groupId: GROUPS.businessActivity, sortOrder: 0 }];
    const recs: AnswerRecord[] = [
      { questionId: Q.bus.activityName, repeaterItemId: 'b1', value: 'Trading signals', state: 'answered', source: 'user', version: 1 },
      { questionId: Q.bus.activityExpSubscriptions, repeaterItemId: 'b1', value: 150000, state: 'answered', source: 'user', version: 1 },
      { questionId: 'ded.subscriptions.amount', repeaterItemId: null, value: 150000, state: 'answered', source: 'user', version: 1 },
    ];
    const a = new AnswerView(recs, items);
    const ctx = { answers: a, questions: QUESTION_BANK, visible: new Set<string>() } as unknown as IntelligenceContext;
    const found = POSSIBLE_DUPLICATE.instances!(a, ctx);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain('$1,500.00');
  });
});
