import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/src/lib/supabase/server';
import { appendAnswers, createItem, getCase } from '@/src/lib/db/repo';
import { accessForUser } from '@/src/lib/access';
import { loadCaseState, serializeCaseState } from '@/src/lib/case-state';
import { QUESTIONS_BY_ID } from '@/src/questions';
import { GROUPS } from '@/src/questions/ids';
import { validateAnswer } from '@/src/engine';
import type { FY, SourceRef } from '@/src/engine/types';
import { ExtractedStatement } from '@/src/lib/documents/extract';
import { allowanceScreenWrites, allowanceWrites, type PrefillWrite } from '@/src/lib/documents/prefill';
import { planStatementImport, planWrites } from '@/src/lib/documents/plan';

const bodySchema = z.object({
  employers: ExtractedStatement.shape.employers.max(20),
  documentId: z.string().uuid().nullable().optional(),
  dryRun: z.boolean().optional(),
});

/**
 * Write reviewed statement figures into the interview (or, with dryRun, only return the plan).
 * The plan decides per employer and allowance: add, update, link this document to a matching
 * record, or hold back a possible duplicate. Importing the same statement again adds nothing.
 */
export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const access = await accessForUser(supabase, user);
  if (!access.can.editAnswers) return NextResponse.json({ error: 'Your access level is view only' }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const caseRow = await getCase(supabase, caseId);
  if (!caseRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (caseRow.status === 'final') return NextResponse.json({ error: 'This case is final and read-only' }, { status: 409 });
  const state = await loadCaseState(supabase, user.id, caseId);
  if (!state) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const plan = planStatementImport(state.view, parsed.data.employers);
  if (parsed.data.dryRun) return NextResponse.json({ ok: true, plan });

  let sourceRef: SourceRef | undefined;
  if (parsed.data.documentId) {
    const doc = await supabase.from('documents').select('id, original_name').eq('id', parsed.data.documentId).eq('case_id', caseId).maybeSingle();
    if (doc.data) sourceRef = { kind: 'document', documentId: doc.data.id, ...(doc.data.original_name ? { fileName: doc.data.original_name } : {}) };
  }

  let employerCount = state.view.items(GROUPS.employer).length;
  let allowanceCount = state.view.items(GROUPS.allowance).length;
  const writes: PrefillWrite[] = [];
  let addedAllowances = 0;
  for (const p of plan) {
    const e = parsed.data.employers[p.index]!;
    const itemId = p.targetItemId ?? (await createItem(supabase, caseRow.owner_id, caseId, GROUPS.employer, employerCount++)).id;
    writes.push(...planWrites(p, e, itemId));
    for (const ap of p.allowances) {
      if (ap.action !== 'add' || !(ap.amountCents > 0)) continue;
      const a = e.allowances[ap.index]!;
      const item = await createItem(supabase, caseRow.owner_id, caseId, GROUPS.allowance, allowanceCount++);
      writes.push(...allowanceWrites(a, item.id, e.name));
      addedAllowances++;
    }
  }
  if (addedAllowances) writes.push(...allowanceScreenWrites());

  const fy = caseRow.financial_year as FY;
  const valid = writes
    .filter((wr) => {
      const q = QUESTIONS_BY_ID.get(wr.questionId);
      return q !== undefined && validateAnswer(q, wr.value, { fy, profileOccupations: [] }).errors.length === 0;
    })
    .map((wr) => (sourceRef ? { ...wr, sourceRef } : wr));
  await appendAnswers(supabase, caseRow.owner_id, caseId, valid);
  const next = await loadCaseState(supabase, user.id, caseId);
  return NextResponse.json({ ok: true, plan, written: valid.length, state: next ? serializeCaseState(next) : null });
}
