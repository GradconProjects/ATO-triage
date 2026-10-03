import { QUESTIONS_BY_ID } from '@/src/questions';
import { MODULE_LABELS } from '@/src/engine/types';

/** DOM id of a question card (one per question, per repeater item). */
export function questionAnchor(questionId: string, itemId?: string | null): string {
  return `q-${questionId.replace(/[^a-zA-Z0-9_-]/g, '_')}${itemId ? `--${itemId}` : ''}`;
}

/**
 * Link to the interview page that holds a question, scrolled to its card. Accepts an id with an
 * optional `@itemId` suffix (as used in review items and line inputs).
 */
export function questionLink(caseId: string, ref: string): { href: string; label: string } | null {
  const at = ref.indexOf('@');
  const id = at === -1 ? ref : ref.slice(0, at);
  const itemId = at === -1 ? null : ref.slice(at + 1);
  const q = QUESTIONS_BY_ID.get(id);
  if (!q) return null;
  const prompt = q.prompt.length > 70 ? `${q.prompt.slice(0, 70)}…` : q.prompt;
  return { href: `/cases/${caseId}/interview/${q.module}#${questionAnchor(id, itemId)}`, label: `${MODULE_LABELS[q.module]}: ${prompt}` };
}
