import { NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { audit, getReport } from '@/src/lib/db/repo';
import { rateLimit } from '@/src/lib/rate-limit';
import { isReportSnapshot } from '@/src/report/snapshot';
import { renderReportPdf, reportFileName, REPORTS_BUCKET, SIGNED_URL_TTL_SECONDS } from '@/src/report/render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Download a report PDF. Ownership is enforced by RLS on `reports` and by the Storage
 * path policy ({uid}/...). Prefers a short-lived signed URL to the stored file; when no
 * file was stored, renders from the frozen snapshot. The snapshot is never regenerated.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!rateLimit(`report-pdf:${user.id}`, 30, 60_000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const report = await getReport(supabase, reportId);
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (report.pdf_path) {
    const signed = await supabase.storage.from(REPORTS_BUCKET).createSignedUrl(report.pdf_path, SIGNED_URL_TTL_SECONDS);
    if (!signed.error && signed.data?.signedUrl) {
      await audit(supabase, user.id, 'report', report.id, 'download', { via: 'signed_url' });
      return NextResponse.redirect(signed.data.signedUrl, 302);
    }
    console.error('signed url failed, rendering from snapshot', signed.error?.message);
  }

  if (!isReportSnapshot(report.snapshot)) return NextResponse.json({ error: 'Stored snapshot is not readable' }, { status: 500 });
  const pdf = await renderReportPdf(report.snapshot);
  await audit(supabase, user.id, 'report', report.id, 'download', { via: 'render' });
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdf.byteLength),
      'Content-Disposition': `attachment; filename="${reportFileName(report.snapshot)}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
