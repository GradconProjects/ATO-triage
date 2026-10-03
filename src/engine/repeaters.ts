/**
 * Repeater helpers (CONTRACT "Repeaters"). A `type: 'repeater'` question declares the group;
 * child questions carry `repeaterGroup` and are asked once per item.
 */
import type { AnswerView } from './answers';
import type { Question, RepeaterItem, RepeaterSpec } from './types';

export function repeaterSpecs(questions: readonly Question[]): RepeaterSpec[] {
  const specs: RepeaterSpec[] = [];
  for (const q of questions) if (q.type === 'repeater' && q.repeater) specs.push(q.repeater);
  return specs;
}

export function childQuestions(questions: readonly Question[], groupId: string): Question[] {
  return questions.filter((q) => q.repeaterGroup === groupId);
}

export function repeaterQuestionForGroup(questions: readonly Question[], groupId: string): Question | undefined {
  return questions.find((q) => q.type === 'repeater' && q.repeater?.groupId === groupId);
}

/**
 * Card label for an item: the `labelFrom` answer when present, else the stored item label,
 * else `${itemLabel} ${index + 1}` by the item's position in its group.
 */
export function itemLabel(spec: RepeaterSpec, answers: AnswerView, item: RepeaterItem, questions?: readonly Question[]): string {
  if (spec.labelFrom) {
    const v = answers.string(spec.labelFrom, item.id)?.trim();
    // A choice question names the card by its option label, not its stored code.
    const option = v ? questions?.find((q) => q.id === spec.labelFrom)?.options?.find((o) => o.value === v) : undefined;
    if (option) return option.label;
    if (v) return v;
  }
  if (item.label && item.label.trim()) return item.label.trim();
  const list = answers.items(spec.groupId);
  const index = list.findIndex((i) => i.id === item.id);
  const n = index >= 0 ? index + 1 : item.sortOrder + 1;
  return `${spec.itemLabel} ${n}`;
}
