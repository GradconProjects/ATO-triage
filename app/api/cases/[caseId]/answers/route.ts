import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/src/lib/supabase/server';
import { appendAnswers, getCase } from '@/src/lib/db/repo';
import { loadCaseState, serializeCaseState } from '@/src/lib/case-state';
import { QUESTIONS_BY_ID } from '@/src/questions';
import { validateAnswer } from '@/src/engine';
import type { FY } from '@/src/engine/types';
import { rateLimit } from '@/src/lib/rate-limit';
import { accessForUser } from '@/src/lib/access';

const writeSchema = z.object({
  questionId: z.string().min(1),
  repeaterItemId: z.string().uuid().nullable(),
  value: z.unknown(),
  state: z.enum(['answered', 'not_sure', 'skipped']),
  source: z.enum(['user', 'prefill_confirmed']),
});
const bodySchema = z.object({ writes: z.array(writeSchema).max(200) });

/**
 * Append answer versions. The server re-validates every write against the question bank,
 * refuses writes to final cases and to unknown questions, then reconciles hidden answers.
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
  if (!rateLimit(`answers:${user.id}`, 120, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const caseRow = await getCase(supabase, caseId);
  if (!caseRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (caseRow.status === 'final') return NextResponse.json({ error: 'This case is final and read-only' }, { status: 409 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request', issues: parsed.error.issues }, { status: 400 });

  const fy = caseRow.financial_year as FY;
  const rejected: { questionId: string; errors: string[] }[] = [];
  const accepted = parsed.data.writes.filter((w) => {
    const q = QUESTIONS_BY_ID.get(w.questionId);
    if (!q) {
      rejected.push({ questionId: w.questionId, errors: ['Unknown question'] });
      return false;
    }
    if (w.state !== 'answered') return true;
    const { errors } = validateAnswer(q, w.value, { fy, profileOccupations: [] });
    if (errors.length) {
      rejected.push({ questionId: w.questionId, errors });
      return false;
    }
    return true;
  });

  await appendAnswers(
    supabase,
    user.id,
    caseId,
    accepted.map((w) => ({ ...w, value: w.state === 'answered' ? w.value : w.state === 'not_sure' ? (w.value ?? 'not_sure') : null })),
  );
  const state = await loadCaseState(supabase, user.id, caseId);
  if (!state) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, rejected, state: serializeCaseState(state) });
}
