import { NextResponse } from 'next/server';
import { getAccess } from '@/src/lib/access';
import { audit } from '@/src/lib/db/repo';

/**
 * Admin download of any user's report. Reads through the admin row-level security policy and
 * returns a short-lived signed URL for the stored PDF. Only accounts with viewAllReports may
 * call it; every download is written to the audit log.
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

  const db = access.supabase;
  const report = await db.from('reports').select('id, owner_id, pdf_path, snapshot').eq('id', reportId).maybeSingle();
  if (report.error || !report.data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await audit(db, access.user.id, 'report', reportId, 'admin_download', { owner_id: report.data.owner_id });

  if (report.data.pdf_path) {
    const signed = await db.storage.from('case-documents').createSignedUrl(report.data.pdf_path as string, 300);
    if (!signed.error && signed.data?.signedUrl) return NextResponse.redirect(signed.data.signedUrl, 302);
  }
  // No stored PDF: render from the frozen snapshot.
  const { renderReportPdf } = await import('@/src/report/render');
  const buffer = await renderReportPdf(report.data.snapshot as never);
  return new NextResponse(new Uint8Array(buffer), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="report-${reportId}.pdf"` },
  });
}
