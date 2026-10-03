import { describe, expect, it } from 'vitest';
import { AnswerView, activeTagSet, hiddenAnswerUpdates, restoredAnswerUpdates, visibleQuestions, validateAnswer } from '@/src/engine';
import type { AnswerRecord, CaseContext, Question } from '@/src/engine/types';
import { QUESTION_BANK } from '@/src/questions';
import { Q } from '@/src/questions/ids';

const ctx: CaseContext = { fy: '2025-26', profileOccupations: [] };
const rec = (questionId: string, value: unknown, version: number, state: AnswerRecord['state'] = 'answered'): AnswerRecord => ({ questionId, repeaterItemId: null, value, state, source: 'user', version });
const visibleFor = (records: AnswerRecord[]) => {
  const view = new AnswerView(records, []);
  const qs = [...QUESTION_BANK] as Question[];
  return { view, visible: visibleQuestions(qs, view, ctx, activeTagSet(ctx, view, qs)) };
};

describe('hidden answers come back when their question is shown again', () => {
  it('tax agent fees: yes -> no hides the amount; yes again restores it', () => {
    const history: AnswerRecord[] = [rec('ded.tax_affairs.any', 'yes', 1), rec('ded.tax_affairs.amount', 15000, 1)];
    // Parent changed to no: the amount is hidden and marked not applicable.
    history.push(rec('ded.tax_affairs.any', 'no', 2));
    let s = visibleFor(history);
    const hidden = hiddenAnswerUpdates(QUESTION_BANK, s.view, s.visible).filter((h) => h.questionId === 'ded.tax_affairs.amount');
    expect(hidden).toHaveLength(1);
    history.push(...hidden);
    // Parent back to yes: the amount is restored with its value and state.
    history.push(rec('ded.tax_affairs.any', 'yes', 3));
    s = visibleFor(history);
    const restored = restoredAnswerUpdates(QUESTION_BANK, history, s.view, s.visible).filter((h) => h.questionId === 'ded.tax_affairs.amount');
    expect(restored).toEqual([expect.objectContaining({ value: 15000, state: 'answered', version: 3 })]);
  });
  it('an empty multi-choice answer is rejected', () => {
    const q = QUESTION_BANK.find((x) => x.id === Q.ded.carException)!;
    expect(validateAnswer(q, [], ctx).errors.length).toBeGreaterThan(0);
  });
});
