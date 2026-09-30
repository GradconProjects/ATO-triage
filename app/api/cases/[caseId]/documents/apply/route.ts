import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/src/lib/supabase/server';
import { appendAnswers, createItem, getCase } from '@/src/lib/db/repo';
import { accessForUser } from '@/src/lib/access';
import { loadCaseState, serializeCaseState } from '@/src/lib/case-state';
import { QUESTIONS_BY_ID } from '@/src/questions';
import { GROUPS } from '@/src/questions/ids';
import { validateAnswer } from '@/src/engine';
import type { FY } from '@/src/engine/types';
import { ExtractedStatement } from '@/src/lib/documents/extract';
import { allowanceScreenWrites, allowanceWrites, employerWrites, matchEmployerItem, type PrefillWrite } from '@/src/lib/documents/prefill';

const bodySchema = z.object({ employers: ExtractedStatement.shape.employers.max(20) });

/** Write the reviewed statement figures into the interview, as prefilled answers the user confirmed. */
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

  let employerCount = state.view.items(GROUPS.employer).length;
  let allowanceCount = state.view.items(GROUPS.allowance).length;
  const taken = new Set<string>();
  const writes: PrefillWrite[] = [];
  for (const e of parsed.data.employers) {
    let itemId = matchEmployerItem(state.view, e.name, taken);
    if (!itemId) itemId = (await createItem(supabase, caseRow.owner_id, caseId, GROUPS.employer, employerCount++)).id;
    taken.add(itemId);
    writes.push(...employerWrites(e, itemId));
    for (const a of e.allowances) {
      if (!(a.amount > 0)) continue;
      const item = await createItem(supabase, caseRow.owner_id, caseId, GROUPS.allowance, allowanceCount++);
      writes.push(...allowanceWrites(a, item.id, e.name));
    }
  }
  if (parsed.data.employers.some((e) => e.allowances.some((a) => a.amount > 0))) writes.push(...allowanceScreenWrites());

  const fy = caseRow.financial_year as FY;
  const valid = writes.filter((wr) => {
    const q = QUESTIONS_BY_ID.get(wr.questionId);
    return q !== undefined && validateAnswer(q, wr.value, { fy, profileOccupations: [] }).errors.length === 0;
  });
  await appendAnswers(supabase, caseRow.owner_id, caseId, valid);
  const next = await loadCaseState(supabase, user.id, caseId);
  return NextResponse.json({ ok: true, written: valid.length, state: next ? serializeCaseState(next) : null });
}
