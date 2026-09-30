import type { SupabaseClient } from '@supabase/supabase-js';
import { QUESTION_BANK } from '@/src/questions';
import { getRuleSet } from '@/src/rules';
import { appendAnswers, audit, createItem, getCase, listCasesForProfile } from '@/src/lib/db/repo';
import type { CaseRow } from '@/src/lib/db/types';
import { loadCaseState } from '@/src/lib/case-state';
import { runCalculation } from '@/src/lib/calc-run';
import { buildDocumentPreview, buildPrefillPreview, sourceRefFor, type PrefillProposal } from './prefill';
import { ExtractedPriorYear } from '../documents/extract';

export interface PrefillLoad {
  /** Where the values come from: an earlier case, or an uploaded prior-year document. */
  source: { caseId?: string; documentId?: string; fy: string; label: string; documentName?: string };
  proposals: PrefillProposal[];
}
export type PrefillSourceChoice = { from: string } | { documentId: string };

/** Earlier cases of the same profile (a prior year is always the same person's earlier year). */
export async function earlierCases(db: SupabaseClient, caseRow: CaseRow): Promise<CaseRow[]> {
  const all = await listCasesForProfile(db, caseRow.profile_id);
  return all.filter((c) => c.id !== caseRow.id && c.financial_year < caseRow.financial_year).sort((a, b) => b.financial_year.localeCompare(a.financial_year));
}

export async function loadPrefill(db: SupabaseClient, userId: string, caseId: string, choice: PrefillSourceChoice): Promise<PrefillLoad | { error: string }> {
  const caseRow = await getCase(db, caseId);
  if (!caseRow) return { error: 'Not found' };
  const tgt = await loadCaseState(db, userId, caseId);
  if (!tgt) return { error: 'Not found' };
  const target = { fy: caseRow.financial_year, view: tgt.view, items: tgt.items, questions: QUESTION_BANK, capitalThresholdCents: getRuleSet(tgt.ctx.fy).instantDeductionThreshold * 100 };

  if ('documentId' in choice) {
    const doc = await db.from('documents').select('id, original_name, extracted, doc_type').eq('id', choice.documentId).eq('case_id', caseId).maybeSingle();
    if (!doc.data || doc.data.doc_type !== 'prior_year_record') return { error: 'Upload a prior-year document first.' };
    const parsed = ExtractedPriorYear.safeParse(doc.data.extracted);
    if (!parsed.success) return { error: 'That document has no readable balances.' };
    const fileName = (doc.data.original_name as string | null) ?? 'document';
    return {
      source: { documentId: doc.data.id as string, fy: parsed.data.financialYear ?? 'earlier year', label: `${fileName} (${parsed.data.financialYear ?? 'year not shown'})`, documentName: fileName },
      proposals: buildDocumentPreview(parsed.data, { fileName }, target),
    };
  }

  const earlier = await earlierCases(db, caseRow);
  const from = earlier.find((c) => c.id === choice.from);
  if (!from) return { error: 'Choose an earlier year of the same profile.' };
  const src = await loadCaseState(db, userId, from.id);
  if (!src) return { error: 'Not found' };
  // Recalculate the earlier year from its current answers, so amendments since its report count.
  const { estimate } = runCalculation(src);
  const proposals = buildPrefillPreview({ caseId: from.id, fy: from.financial_year, status: from.status, view: src.view, items: src.items, estimate }, target);
  return { source: { caseId: from.id, fy: from.financial_year, label: `${from.financial_year} case` }, proposals };
}

/**
 * Write the ticked proposals as `imported` answers carrying their source. Items that did not
 * match a current item are created once per earlier item. The preview is rebuilt here from the
 * database, so the client can only choose which proposals to accept, never their values.
 */
export async function applyPrefill(db: SupabaseClient, userId: string, caseId: string, choice: PrefillSourceChoice, keys: string[]): Promise<{ written: number } | { error: string }> {
  const caseRow = await getCase(db, caseId);
  if (!caseRow) return { error: 'Not found' };
  if (caseRow.status === 'final') return { error: 'This case is final and read-only' };
  const loaded = await loadPrefill(db, userId, caseId, choice);
  if ('error' in loaded) return loaded;
  const chosen = new Set(keys);
  const picked = loaded.proposals.filter((p) => chosen.has(p.key));
  const newItems = new Map<string, string>();
  const tgt = await loadCaseState(db, userId, caseId);
  let order = tgt?.items.length ?? 0;
  for (const p of picked) {
    if (!p.groupId || !p.sourceItemId || p.targetItemId || newItems.has(p.sourceItemId)) continue;
    const item = await createItem(db, caseRow.owner_id, caseId, p.groupId, order++);
    newItems.set(p.sourceItemId, item.id);
  }
  const rows = picked.map((p) => ({
    questionId: p.questionId,
    repeaterItemId: p.groupId ? (p.targetItemId ?? newItems.get(p.sourceItemId!) ?? null) : null,
    value: p.value,
    state: 'imported' as const,
    source: 'document' as const,
    sourceRef: sourceRefFor(p, loaded.source),
  }));
  await appendAnswers(db, caseRow.owner_id, caseId, rows);
  await audit(db, caseRow.owner_id, 'case', caseId, 'prior_year_prefill', { source: loaded.source, keys: picked.map((p) => p.key) });
  return { written: rows.length };
}
