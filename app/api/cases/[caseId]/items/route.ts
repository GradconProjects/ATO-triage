import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/src/lib/supabase/server';
import { createItem, deleteItem, getCase, listItems } from '@/src/lib/db/repo';
import { repeaterSpecs } from '@/src/engine';
import { QUESTION_BANK } from '@/src/questions';
import { loadCaseState, serializeCaseState } from '@/src/lib/case-state';
import { accessForUser } from '@/src/lib/access';

const createSchema = z.object({ groupId: z.string().min(1) });
const deleteSchema = z.object({ itemId: z.string().uuid() });

async function auth(caseId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) };
  const access = await accessForUser(supabase, user);
  if (!access.can.editAnswers) return { error: NextResponse.json({ error: 'Your access level is view only' }, { status: 403 }) };
  const caseRow = await getCase(supabase, caseId);
  if (!caseRow) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (caseRow.status === 'final') return { error: NextResponse.json({ error: 'This case is final and read-only' }, { status: 409 }) };
  return { supabase, user, caseRow };
}

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const a = await auth(caseId);
  if ('error' in a) return a.error;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const spec = repeaterSpecs(QUESTION_BANK).find((s) => s.groupId === parsed.data.groupId);
  if (!spec) return NextResponse.json({ error: 'Unknown group' }, { status: 400 });
  const existing = (await listItems(a.supabase, caseId)).filter((i) => i.groupId === spec.groupId);
  if (spec.maxItems && existing.length >= spec.maxItems) return NextResponse.json({ error: 'Maximum items reached' }, { status: 400 });
  const item = await createItem(a.supabase, a.user.id, caseId, spec.groupId, existing.length);
  const state = await loadCaseState(a.supabase, a.user.id, caseId);
  return NextResponse.json({ ok: true, item, state: state ? serializeCaseState(state) : null });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const a = await auth(caseId);
  if ('error' in a) return a.error;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  await deleteItem(a.supabase, a.user.id, parsed.data.itemId);
  const state = await loadCaseState(a.supabase, a.user.id, caseId);
  return NextResponse.json({ ok: true, state: state ? serializeCaseState(state) : null });
}
