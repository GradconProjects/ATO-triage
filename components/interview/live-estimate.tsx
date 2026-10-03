'use client';

import Link from 'next/link';
import { formatMoney } from '@/src/lib/utils';
import { Badge } from '@/components/ui/badge';

export interface LiveEstimateSummary {
  resultCents: number;
  rangeLow?: number;
  rangeHigh?: number;
  confidence: 'high' | 'medium' | 'low';
  openFlags: number;
  blockers: number;
  completenessPct: number;
  manualReviewCount: number;
  notCountedCents?: number;
  provisionalCents?: number;
  nilTax?: boolean;
}

export function LiveEstimatePanel({ caseId, summary, loading, previous, updating, failed }: { caseId: string; summary: LiveEstimateSummary | null; loading: boolean; previous?: LiveEstimateSummary | null; updating?: boolean; failed?: boolean }) {
  // Change since the estimate before the last saved answer, and why an answer may not move it.
  const delta = summary && previous ? summary.resultCents - previous.resultCents : undefined;
  const notes: string[] = [];
  if (summary?.nilTax) notes.push('Tax is $0 at this income, so more deductions will not change the result. Only tax withheld and refundable offsets do.');
  if (summary?.notCountedCents) notes.push(`${formatMoney(summary.notCountedCents)} under review is not counted, because counting it as entered would likely be wrong (for example a possible duplicate).`);
  const tone = summary?.confidence === 'high' ? 'success' : summary?.confidence === 'medium' ? 'warning' : 'danger';
  return (
    <aside
      aria-live="polite"
      aria-label="Live estimate"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card p-3 shadow-lg lg:static lg:rounded-lg lg:border lg:shadow-sm"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 lg:flex-col lg:items-stretch">
        <div>
          <p className="text-xs text-muted">Indicative {summary && summary.resultCents < 0 ? 'debt' : 'refund'}</p>
          <p className="text-xl font-semibold">
            {loading && !summary ? 'Calculating…' : summary ? formatMoney(Math.abs(summary.resultCents)) : '—'}
          </p>
          {summary?.rangeLow !== undefined && summary.rangeHigh !== undefined && summary.rangeLow !== summary.rangeHigh ? (
            <p className="text-xs text-muted">
              Between {formatMoney(Math.abs(summary.rangeLow))} and {formatMoney(Math.abs(summary.rangeHigh))}
            </p>
          ) : null}
          {updating ? <p className="text-xs text-muted">Updating…</p> : failed ? <p className="text-xs text-danger">Could not update; showing the last estimate.</p> : delta !== undefined ? (
            <p className="text-xs text-muted">{delta === 0 ? 'No change from your last answer' : `${delta > 0 ? '+' : '−'}${formatMoney(Math.abs(delta))} from your last answer`}</p>
          ) : null}
          {summary && summary.manualReviewCount > 0 ? (
            <p className="mt-1 text-xs text-warning">
              Includes {summary.provisionalCents ? `${formatMoney(summary.provisionalCents)} counted provisionally, ` : ''}
              <Link href={`/cases/${caseId}/review#needs-review`} className="underline">
                {summary.manualReviewCount} {summary.manualReviewCount === 1 ? 'item needs' : 'items need'} review
              </Link>
            </p>
          ) : null}
          {delta === 0 && notes.length ? <ul className="mt-1 hidden max-w-xs list-disc pl-4 text-xs italic text-muted lg:block">{notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {summary ? <Badge tone={tone}>Confidence: {summary.confidence}</Badge> : null}
          {summary ? <Badge tone={summary.blockers ? 'danger' : summary.openFlags ? 'warning' : 'neutral'}>{summary.openFlags} to review</Badge> : null}
          {summary ? <Badge>{summary.completenessPct}% complete</Badge> : null}
          <Link href={`/cases/${caseId}/estimate`} className="underline">
            Details
          </Link>
        </div>
      </div>
    </aside>
  );
}
