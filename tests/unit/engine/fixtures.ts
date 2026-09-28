import type { AnswerRecord, AnswerState, CaseContext, Question, RepeaterItem } from '@/src/engine/types';
import { AnswerView } from '@/src/engine/answers';

export function q(partial: Partial<Question> & { id: string }): Question {
  return {
    module: 'deductions',
    type: 'money',
    prompt: `Prompt for ${partial.id}?`,
    required: true,
    ...partial,
  };
}

export const yesNo = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'not_sure', label: 'Not sure' },
];

export function rec(
  questionId: string,
  value: unknown,
  opts: { item?: string | null; state?: AnswerState; version?: number; source?: AnswerRecord['source'] } = {},
): AnswerRecord {
  return {
    questionId,
    repeaterItemId: opts.item ?? null,
    value,
    state: opts.state ?? 'answered',
    source: opts.source ?? 'user',
    version: opts.version ?? 1,
  };
}

export function notSure(questionId: string, item: string | null = null, multi = false): AnswerRecord {
  return rec(questionId, multi ? ['not_sure'] : 'not_sure', { item, state: 'not_sure' });
}

export function item(id: string, groupId: string, sortOrder = 0, label: string | null = null): RepeaterItem {
  return { id, groupId, sortOrder, label };
}

export function view(answers: AnswerRecord[] = [], items: RepeaterItem[] = []): AnswerView {
  return new AnswerView(answers, items);
}

export const ctx = (over: Partial<CaseContext> = {}): CaseContext => ({ fy: '2025-26', profileOccupations: [], ...over });
