/**
 * Server-only PDF rendering. `@react-pdf/renderer` is imported dynamically so it never
 * lands in a client bundle and only loads when a report is actually rendered.
 */
import { createElement } from 'react';
import type { ReportSnapshot } from './snapshot';

export async function renderReportPdf(snapshot: ReportSnapshot): Promise<Buffer> {
  const [{ renderToBuffer }, { ReportDocument }] = await Promise.all([import('@react-pdf/renderer'), import('./ReportDocument')]);
  return renderToBuffer(createElement(ReportDocument, { snapshot }));
}

/** Storage path for a report PDF (Section 11): {uid}/{caseId}/reports/{reportId}.pdf */
export function reportPdfPath(ownerId: string, caseId: string, reportId: string): string {
  return `${ownerId}/${caseId}/reports/${reportId}.pdf`;
}

export const REPORTS_BUCKET = 'case-documents';
export const SIGNED_URL_TTL_SECONDS = 300;

export function reportFileName(snapshot: ReportSnapshot): string {
  const safeName = snapshot.profile.displayName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';
  return `tax-estimate-${safeName}-${snapshot.fy}-${snapshot.isFinal ? 'final' : 'draft'}.pdf`;
}
