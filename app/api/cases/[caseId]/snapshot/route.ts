import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/src/lib/supabase/server';
import { audit, updateCaseStatus } from '@/src/lib/db/repo';
import type { ReportRow } from '@/src/lib/db/types';
import { loadCaseState } from '@/src/lib/case-state';
import { runCalculation } from '@/src/lib/calc-run';
import { rateLimit } from '@/src/lib/rate-limit';
import { buildSnapshot } from '@/src/report/snapshot';
import { DEFAULT_TIMEZONE } from '@/src/report/format';
import { renderReportPdf, reportPdfPath, REPORTS_BUCKET } from '@/src/report/render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ final: z.boolean().optional() });

/**
 * Generate an immutable report snapshot (+ PDF) for a case.
 *
 * Order matters because `reports` has no update policy: the PDF is rendered and
 * uploaded first under a pre-generated report id, then the row is inserted once with
 * `pdf_path` already set. If the upload fails the row is still inserted (pdf_path null)
 * and the PDF route renders on the fly from the stored snapshot.
 */
export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!rateLimit(`snapshot:${user.id}`, 10, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const parsed = bodySchema.safeParse((await request.json().catch(() => ({}))) ?? {});
  if (!parsed.success) return NextResponse.json({ error: 'Bad request', issues: parsed.error.issues }, { status: 400 });
  const wantFinal = parsed.data.final === true;

  const state = await loadCaseState(supabase, user.id, caseId);
  if (!state) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { estimate, intelligence } = runCalculation(state);
  if (wantFinal && !intelligence.canFinalise) {
    return NextResponse.json(
      { error: 'This case cannot be finalised yet', blockers: intelligence.finaliseBlockers, canFinalise: false },
      { status: 409 },
    );
  }

  const timezone = process.env.REPORT_TIMEZONE || DEFAULT_TIMEZONE;
  const snapshot = buildSnapshot(state, estimate, intelligence, { isFinal: wantFinal, timezone });

  // Render + upload BEFORE the immutable insert so pdf_path can be written once.
  const reportId = crypto.randomUUID();
  const pdfPath = reportPdfPath(user.id, caseId, reportId);
  let storedPath: string | null = null;
  try {
    const pdf = await renderReportPdf(snapshot);
    const upload = await supabase.storage.from(REPORTS_BUCKET).upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: false });
    if (!upload.error) storedPath = pdfPath;
    else console.error('report pdf upload failed', upload.error.message);
  } catch (err) {
    console.error('report pdf render failed', err instanceof Error ? err.message : err);
  }

  const inserted = await supabase
    .from('reports')
    .insert({ id: reportId, case_id: caseId, owner_id: user.id, snapshot, pdf_path: storedPath, is_final: wantFinal })
    .select('*')
    .single();
  if (inserted.error) {
    // Do not leave an orphaned PDF behind when the row could not be written.
    if (storedPath) await supabase.storage.from(REPORTS_BUCKET).remove([storedPath]);
    return NextResponse.json({ error: inserted.error.message }, { status: 500 });
  }
  const row = inserted.data as ReportRow;

  if (wantFinal) await updateCaseStatus(supabase, user.id, caseId, 'final', snapshot.ruleSetVersion);
  await audit(supabase, user.id, 'report', row.id, 'generate', {
    is_final: wantFinal,
    rule_set_version: snapshot.ruleSetVersion,
    pdf_stored: storedPath !== null,
  });

  return NextResponse.json({ reportId: row.id, pdfPath: storedPath, isFinal: wantFinal });
}
