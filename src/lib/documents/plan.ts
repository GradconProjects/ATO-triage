/**
 * Import plan for an income statement: before anything is written, decide per employer and per
 * allowance whether the import adds a record, updates one, only links this document as evidence
 * to a record that already matches, or needs review as a possible duplicate. Repeated payments
 * that are genuinely separate are never deleted; a suspected duplicate is simply not added.
 */
import type { AnswerView } from '../../engine/answers';
import { GROUPS, Q } from '../../questions/ids';
import { employerWrites, type ExtractedEmployer, type PrefillWrite } from './prefill';

export type ImportAction = 'add' | 'update' | 'link' | 'review_duplicate';

export interface AllowancePlan {
  index: number;
  description: string;
  type: string;
  amountCents: number;
  action: ImportAction;
  reason?: string;
}

export interface EmployerPlan {
  index: number;
  name: string;
  action: ImportAction;
  targetItemId: string | null;
  /** Fields whose value would change (update) or be set (add). */
  changes: { questionId: string; from: unknown; to: unknown }[];
  allowances: AllowancePlan[];
}

const norm = (s: unknown) => (typeof s === 'string' ? s.toLowerCase().replace(/pty|ltd|limited|the|[^a-z0-9]/g, '') : '');

export function planStatementImport(view: AnswerView, employers: ExtractedEmployer[]): EmployerPlan[] {
  const items = view.items(GROUPS.employer);
  const taken = new Set<string>();
  const allowanceItems = view.items(GROUPS.allowance).map((it) => ({
    job: norm(view.get(Q.allow.job, it.id)?.value),
    type: view.get(Q.allow.type, it.id)?.value,
    amount: view.get(Q.allow.amount, it.id)?.value,
  }));
  return employers.map((e, index) => {
    const abn = e.abn?.replace(/\D/g, '') ?? '';
    // Match on ABN first (a source identifier), then on the normalised name, then an empty entry.
    const target =
      items.find((i) => !taken.has(i.id) && abn.length === 11 && String(view.get(Q.emp.abn, i.id)?.value ?? '').replace(/\D/g, '') === abn) ??
      items.find((i) => !taken.has(i.id) && norm(e.name) && norm(view.get(Q.emp.name, i.id)?.value) === norm(e.name)) ??
      items.find((i) => !taken.has(i.id) && !view.has(Q.emp.name, i.id) && view.get(Q.emp.name, i.id) === undefined);
    if (target) taken.add(target.id);
    const writes = employerWrites(e, target?.id ?? 'new');
    const changes = writes
      .map((w) => ({ questionId: w.questionId, from: target ? view.get(w.questionId, target.id)?.value : undefined, to: w.value }))
      .filter((c) => JSON.stringify(c.from) !== JSON.stringify(c.to));
    const action: ImportAction = !target ? 'add' : changes.length ? 'update' : 'link';
    const allowances = e.allowances.map((a, j): AllowancePlan => {
      const amountCents = Math.round(a.amount * 100);
      const same = allowanceItems.filter((x) => x.job === norm(e.name) && x.type === a.type);
      if (same.some((x) => x.amount === amountCents)) return { index: j, description: a.description, type: a.type, amountCents, action: 'link', reason: 'Already entered with the same amount.' };
      if (same.length) return { index: j, description: a.description, type: a.type, amountCents, action: 'review_duplicate', reason: 'An allowance of this type from this employer is already entered with a different amount. Not added; check which figure is right.' };
      return { index: j, description: a.description, type: a.type, amountCents, action: 'add' };
    });
    return { index, name: e.name, action, targetItemId: target?.id ?? null, changes, allowances };
  });
}

/** Only the writes a plan calls for: nothing for unchanged values, nothing for suspected duplicates. */
export function planWrites(plan: EmployerPlan, e: ExtractedEmployer, itemId: string): PrefillWrite[] {
  const changed = new Set(plan.changes.map((c) => c.questionId));
  const writes = employerWrites(e, itemId);
  if (plan.action === 'link') return writes.filter((w) => w.questionId === Q.emp.name); // re-states the name with this document as evidence
  return writes.filter((w) => changed.has(w.questionId));
}
