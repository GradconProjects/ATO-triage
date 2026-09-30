import type { AnswerView } from '../../engine/answers';
import type { SourceRef } from '../../engine/types';
import { GROUPS, Q } from '../../questions/ids';
import type { ExtractedStatement } from './extract';

export type ExtractedEmployer = ExtractedStatement['employers'][number];
export type ExtractedAllowance = ExtractedEmployer['allowances'][number];

export interface PrefillWrite {
  questionId: string;
  repeaterItemId: string | null;
  value: unknown;
  state: 'answered';
  source: 'prefill_confirmed';
  sourceRef?: SourceRef;
}

const toCents = (dollars: number) => Math.round(dollars * 100);
const norm = (s: string) => s.toLowerCase().replace(/pty|ltd|limited|the|[^a-z0-9]/g, '');

function w(questionId: string, repeaterItemId: string | null, value: unknown): PrefillWrite {
  return { questionId, repeaterItemId, value, state: 'answered', source: 'prefill_confirmed' };
}

/**
 * Pick the employer item a statement row should fill: an existing item with the same employer
 * name (ignoring "Pty Ltd", case and punctuation), else an item with no name yet, else null
 * (the caller creates a new one). `taken` stops two rows filling the same item.
 */
export function matchEmployerItem(view: AnswerView, name: string, taken: Set<string>): string | null {
  const items = view.items(GROUPS.employer).filter((i) => !taken.has(i.id));
  const target = norm(name);
  const same = items.find((i) => {
    const n = view.string(Q.emp.name, i.id);
    return n !== undefined && target.length > 0 && norm(n) === target;
  });
  if (same) return same.id;
  const blank = items.find((i) => !view.has(Q.emp.name, i.id));
  return blank?.id ?? null;
}

/** Answers for one employer item. Only figures that were printed are written. */
export function employerWrites(e: ExtractedEmployer, itemId: string): PrefillWrite[] {
  const out: PrefillWrite[] = [w(Q.emp.name, itemId, e.name.trim())];
  const abn = e.abn?.replace(/\D/g, '');
  if (abn && abn.length === 11) out.push(w(Q.emp.abn, itemId, abn));
  const money: [string, number | null][] = [
    [Q.emp.gross, e.gross],
    [Q.emp.withheld, e.withheld],
    [Q.emp.rfb, e.rfb],
    [Q.emp.resc, e.resc],
    [Q.emp.lumpA, e.lumpA],
    [Q.emp.lumpB, e.lumpB],
    [Q.emp.lumpD, e.lumpD],
    [Q.emp.lumpE, e.lumpE],
  ];
  for (const [qid, v] of money) if (v !== null && v >= 0) out.push(w(qid, itemId, toCents(v)));
  if (e.lumpA !== null && e.lumpA > 0 && e.lumpAType) out.push(w(Q.emp.lumpAType, itemId, e.lumpAType));
  if (e.taxReady !== null) out.push(w(Q.emp.taxReady, itemId, e.taxReady ? 'yes' : 'no'));
  return out;
}

/** Answers for one allowance item, linked to its employer by name. */
export function allowanceWrites(a: ExtractedAllowance, itemId: string, employerName: string): PrefillWrite[] {
  const out = [
    w(Q.allow.type, itemId, a.type),
    w(Q.allow.amount, itemId, toCents(a.amount)),
    w(Q.allow.onStatement, itemId, 'yes'),
    w(Q.allow.job, itemId, employerName.trim()),
  ];
  if (a.type === 'other') out.push(w('allow.item.other_text', itemId, a.description.slice(0, 200)));
  return out;
}

/** Top-level screening answers so the prefilled allowance items are shown. */
export function allowanceScreenWrites(): PrefillWrite[] {
  // Construction workers answer con.allowances instead of allow.any; the hidden one is reconciled away.
  return [w(Q.allow.any, null, 'yes'), w('con.allowances', null, 'yes')];
}
