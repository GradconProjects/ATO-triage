import { NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { loadCaseState } from '@/src/lib/case-state';
import { runCalculation, summarise } from '@/src/lib/calc-run';
import { saveEstimate } from '@/src/lib/db/repo';
import { rateLimit } from '@/src/lib/rate-limit';

/**
 * Recalculate the estimate for a case and persist the run (estimates + flags are regenerated,
 * never edited). Returns the full estimate, the intelligence result and a compact summary for
 * the live panel.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!rateLimit(`calc:${user.id}`, 60, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const state = await loadCaseState(supabase, user.id, caseId);
  if (!state) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const run = runCalculation(state);
  if (state.caseRow.status !== 'final') {
    await saveEstimate(
      supabase,
      user.id,
      caseId,
      {
        rule_set_version: run.estimate.ruleSetVersion,
        result: run.estimate,
        confidence: run.intelligence.confidence.level,
        completeness_pct: run.intelligence.completeness.pct,
      },
      run.intelligence.flags.map((f) => ({ kind: f.kind, severity: f.severity, code: f.code, message: f.message, question_ids: f.questionIds })),
    );
  }
  return NextResponse.json({ estimate: run.estimate, intelligence: run.intelligence, summary: summarise(run) });
}
