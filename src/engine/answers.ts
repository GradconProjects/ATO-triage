import type { AnswerRecord, AnswerState, RepeaterItem } from './types';

/** Answer states whose value may feed a calculation or count as complete. */
export const USABLE_STATES: readonly AnswerState[] = ['answered'] as const;

export function answerKey(questionId: string, repeaterItemId: string | null | undefined): string {
  return repeaterItemId ? `${questionId}@${repeaterItemId}` : questionId;
}

/**
 * Read-only view over the latest version of every answer in a case.
 * Only `answered` values are usable; `imported` values must be confirmed first.
 */
export class AnswerView {
  private readonly latest = new Map<string, AnswerRecord>();
  private readonly itemsByGroup = new Map<string, RepeaterItem[]>();

  constructor(answers: Iterable<AnswerRecord>, items: Iterable<RepeaterItem> = []) {
    for (const a of answers) {
      const key = answerKey(a.questionId, a.repeaterItemId);
      const prev = this.latest.get(key);
      if (!prev || a.version >= prev.version) this.latest.set(key, a);
    }
    for (const it of items) {
      const list = this.itemsByGroup.get(it.groupId) ?? [];
      list.push(it);
      this.itemsByGroup.set(it.groupId, list);
    }
    for (const list of this.itemsByGroup.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /** Latest record for a question (any state). */
  get(questionId: string, repeaterItemId?: string | null): AnswerRecord | undefined {
    return this.latest.get(answerKey(questionId, repeaterItemId));
  }

  state(questionId: string, repeaterItemId?: string | null): AnswerState | undefined {
    return this.get(questionId, repeaterItemId)?.state;
  }

  /** Usable value (state answered) or undefined. Never infers. */
  value<T = unknown>(questionId: string, repeaterItemId?: string | null): T | undefined {
    const rec = this.get(questionId, repeaterItemId);
    if (!rec || !USABLE_STATES.includes(rec.state)) return undefined;
    return rec.value as T;
  }

  string(questionId: string, repeaterItemId?: string | null): string | undefined {
    const v = this.value(questionId, repeaterItemId);
    return typeof v === 'string' ? v : undefined;
  }

  number(questionId: string, repeaterItemId?: string | null): number | undefined {
    const v = this.value(questionId, repeaterItemId);
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  }

  /** Integer cents or undefined. */
  cents(questionId: string, repeaterItemId?: string | null): number | undefined {
    const n = this.number(questionId, repeaterItemId);
    return n === undefined ? undefined : Math.trunc(n);
  }

  list(questionId: string, repeaterItemId?: string | null): string[] | undefined {
    const v = this.value(questionId, repeaterItemId);
    return Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as string[]) : undefined;
  }

  has(questionId: string, repeaterItemId?: string | null): boolean {
    return this.value(questionId, repeaterItemId) !== undefined;
  }

  isNotSure(questionId: string, repeaterItemId?: string | null): boolean {
    return this.state(questionId, repeaterItemId) === 'not_sure';
  }

  items(groupId: string): RepeaterItem[] {
    return this.itemsByGroup.get(groupId) ?? [];
  }

  allItems(): RepeaterItem[] {
    return [...this.itemsByGroup.values()].flat();
  }

  /** Every latest record (any state), for progress, flags and report snapshots. */
  records(): AnswerRecord[] {
    return [...this.latest.values()];
  }

  /** Records for a question across all repeater items. */
  recordsFor(questionId: string): AnswerRecord[] {
    return this.records().filter((r) => r.questionId === questionId);
  }
}
