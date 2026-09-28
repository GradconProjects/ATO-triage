/**
 * Groups snapshot answers by module for the "Your answers" section (Section 11, item 8).
 * Every answered question appears, including Not sure and Skipped; answers with state
 * `not_applicable_by_rule` go to a separate "Answers no longer used" bucket per module.
 */
import { MODULE_ORDER } from '@/src/engine/types';
import type { SnapshotAnswer } from './snapshot';

export interface AnswerGroup {
  module: string;
  moduleLabel: string;
  /** Answers currently part of the interview: answered, imported, not sure, skipped. */
  used: SnapshotAnswer[];
  /** Answers hidden by a later rule change (`not_applicable_by_rule`). */
  noLongerUsed: SnapshotAnswer[];
}

const rank = new Map<string, number>(MODULE_ORDER.map((m, i) => [m, i]));

export function groupAnswers(answers: SnapshotAnswer[]): AnswerGroup[] {
  const groups = new Map<string, AnswerGroup>();
  for (const a of answers) {
    let g = groups.get(a.module);
    if (!g) {
      g = { module: a.module, moduleLabel: a.moduleLabel, used: [], noLongerUsed: [] };
      groups.set(a.module, g);
    }
    if (a.state === 'not_applicable_by_rule') g.noLongerUsed.push(a);
    else g.used.push(a);
  }
  return [...groups.values()]
    .filter((g) => g.used.length || g.noLongerUsed.length)
    .sort((x, y) => (rank.get(x.module) ?? 999) - (rank.get(y.module) ?? 999));
}

/** "Item label: prompt" when the answer belongs to a repeater item. */
export function answerLabel(a: SnapshotAnswer): string {
  return a.itemLabel ? `${a.itemLabel} — ${a.prompt}` : a.prompt;
}

/** Display text with the state made explicit for the reader. */
export function answerDisplay(a: SnapshotAnswer): string {
  if (a.state === 'not_sure') return 'Not sure (flagged for review)';
  if (a.state === 'skipped') return 'Skipped (not answered)';
  if (a.state === 'imported') return `${a.display} (imported, not yet confirmed)`;
  return a.display;
}
