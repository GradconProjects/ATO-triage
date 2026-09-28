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
}

export function LiveEstimatePanel({ caseId, summary, loading }: { caseId: string; summary: LiveEstimateSummary | null; loading: boolean }) {
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
