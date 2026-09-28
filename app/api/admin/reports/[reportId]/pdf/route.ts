import { NextResponse } from 'next/server';
import { getAccess } from '@/src/lib/access';
import { createAdminClient } from '@/src/lib/supabase/admin';
import { audit } from '@/src/lib/db/repo';

/**
 * Admin download of any user's report. Uses the service role to read the immutable report row
 * and return a short-lived signed URL for the stored PDF. Only accounts with viewAllReports
 * may call it; the download is written to the audit log.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  let access;
  try {
    access = await getAccess();
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  if (!access.can.viewAllReports) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createAdminClient();
  const report = await admin.from('reports').select('id, owner_id, pdf_path').eq('id', reportId).maybeSingle();
  if (report.error || !report.data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await audit(access.supabase, access.user.id, 'report', reportId, 'admin_download', { owner_id: report.data.owner_id });

  if (report.data.pdf_path) {
    const signed = await admin.storage.from('case-documents').createSignedUrl(report.data.pdf_path as string, 300);
    if (!signed.error && signed.data?.signedUrl) return NextResponse.redirect(signed.data.signedUrl, 302);
  }
  // No stored PDF: render from the frozen snapshot.
  const full = await admin.from('reports').select('snapshot').eq('id', reportId).single();
  if (full.error) return NextResponse.json({ error: full.error.message }, { status: 500 });
  const { renderReportPdf } = await import('@/src/report/render');
  const buffer = await renderReportPdf(full.data.snapshot as never);
  return new NextResponse(new Uint8Array(buffer), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="report-${reportId}.pdf"` },
  });
}
