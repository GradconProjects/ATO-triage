import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { GenerateReportButton } from '@/components/interview/generate-report-button';
import { createClient } from '@/src/lib/supabase/server';
import { loadCaseState } from '@/src/lib/case-state';
import { listReports } from '@/src/lib/db/repo';
import { STATUS_LABELS } from '@/src/lib/db/types';
import { formatDateTimeMelbourne, formatMoney } from '@/src/lib/utils';
import { isReportSnapshot, type ReportSnapshot } from '@/src/report/snapshot';

export const metadata = { title: 'Reports' };
export const dynamic = 'force-dynamic';

function resultText(s: ReportSnapshot): string {
  const range = s.estimate.range ?? s.intelligence.range;
  if (range && range.lowCents !== range.highCents) {
    const lo = Math.min(range.lowCents, range.highCents);
    const hi = Math.max(range.lowCents, range.highCents);
    if (lo >= 0) return `Refund between ${formatMoney(lo)} and ${formatMoney(hi)}`;
    if (hi <= 0) return `Debt between ${formatMoney(Math.abs(hi))} and ${formatMoney(Math.abs(lo))}`;
    return `Between a debt of ${formatMoney(Math.abs(lo))} and a refund of ${formatMoney(hi)}`;
  }
  const r = s.estimate.totals.resultCents;
  if (r === 0) return 'No refund or debt';
  return `${r < 0 ? 'Debt' : 'Refund'} of ${formatMoney(Math.abs(r))}`;
}

const CONFIDENCE_TONE = { high: 'success', medium: 'warning', low: 'danger' } as const;

export default async function ReportsPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const state = await loadCaseState(supabase, user.id, caseId);
  if (!state) notFound();
  const reports = await listReports(supabase, caseId);
  const isFinalCase = state.caseRow.status === 'final';

  return (
    <AppShell currentProfileId={state.profile.id}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted">
            {state.profile.display_name} · {state.ctx.fy} · {STATUS_LABELS[state.caseRow.status]}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/cases/${caseId}/review`} className={buttonVariants({ variant: 'secondary' })}>
            Review
          </Link>
          <Link href={`/cases/${caseId}/estimate`} className={buttonVariants({ variant: 'secondary' })}>
            Estimate
          </Link>
        </div>
      </div>

      <Card className="mt-6">
        <CardTitle>Generate a report</CardTitle>
        <CardDescription>
          A report is an immutable snapshot of your answers, the estimate and every flag at the moment it is generated. It never changes when
          rules or answers change later. Draft reports carry a DRAFT watermark; a final report locks the case.
        </CardDescription>
        <div className="mt-4">
          <GenerateReportButton caseId={caseId} allowFinal={!isFinalCase} />
        </div>
      </Card>

      <section className="mt-8" aria-labelledby="report-list">
        <h2 id="report-list" className="text-lg font-semibold">
          Generated reports
        </h2>
        {reports.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No reports yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {reports.map((r) => {
              const snap = isReportSnapshot(r.snapshot) ? r.snapshot : null;
              const conf = snap?.intelligence.confidence.level;
              return (
                <li key={r.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{formatDateTimeMelbourne(r.created_at)}</p>
                      <p className="mt-1 text-sm">{snap ? resultText(snap) : 'Snapshot unavailable'}</p>
                      <p className="mt-1 text-xs text-muted">
                        Rule set {snap?.ruleSetVersion ?? '—'}
                        {snap ? ` · ${snap.intelligence.completeness.pct}% complete` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={r.is_final ? 'success' : 'neutral'}>{r.is_final ? 'Final' : 'Draft'}</Badge>
                      {conf ? <Badge tone={CONFIDENCE_TONE[conf]}>Confidence: {conf}</Badge> : null}
                      <a href={`/api/reports/${r.id}/pdf`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                        Download PDF
                      </a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
