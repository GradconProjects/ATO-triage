import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/src/lib/supabase/server';
import { accessForUser } from '@/src/lib/access';
import { applyPrefill, loadPrefill } from '@/src/lib/prior-year/service';

const bodySchema = z.object({ from: z.string().uuid().optional(), documentId: z.string().uuid().optional(), keys: z.array(z.string().max(300)).max(500) }).refine((b) => Boolean(b.from) !== Boolean(b.documentId), 'Give either from or documentId');

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Preview what an earlier year would prefill. Read-only. */
export async function GET(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const { supabase, user } = await session();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const sp = new URL(request.url).searchParams;
  const doc = sp.get('doc');
  const res = await loadPrefill(supabase, user.id, caseId, doc ? { documentId: doc } : { from: sp.get('from') ?? '' });
  if ('error' in res) return NextResponse.json(res, { status: 400 });
  return NextResponse.json(res);
}

/** Apply the ticked proposals as imported (unconfirmed) answers with their source recorded. */
export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const { supabase, user } = await session();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const access = await accessForUser(supabase, user);
  if (!access.can.editAnswers) return NextResponse.json({ error: 'Your access level is view only' }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const choice = parsed.data.documentId ? { documentId: parsed.data.documentId } : { from: parsed.data.from! };
  const res = await applyPrefill(supabase, user.id, caseId, choice, parsed.data.keys);
  if ('error' in res) return NextResponse.json(res, { status: 400 });
  return NextResponse.json({ ok: true, ...res });
}
