'use client';

import Link from 'next/link';
import type { CaseLive } from '@/src/lib/admin/live';
import { formatMoney } from '@/src/lib/utils';
import { usePoll } from './use-poll';
import { LiveDot } from './live-dot';

export function LiveCase({ caseId, initial }: { caseId: string; initial: CaseLive }) {
  const { data, error, at } = usePoll<CaseLive>(`/api/admin/cases/${caseId}`, 4000, initial);
  const c = data ?? initial;
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-border bg-card p-4">
        <div>
          <h1 className="text-xl font-semibold">
            {c.profileName} · {c.fy}
          </h1>
          <p className="text-sm text-muted">
            Entered by {c.userLabel} · {c.status}
            {c.updatedAt ? ` · last change ${new Date(c.updatedAt).toLocaleString('en-AU')}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">Indicative {c.resultCents !== null && c.resultCents < 0 ? 'debt' : 'refund'}</p>
          <p className="text-2xl font-semibold">{c.resultCents === null ? '—' : formatMoney(Math.abs(c.resultCents))}</p>
          {c.confidence ? <p className="text-xs text-muted">confidence {c.confidence}</p> : null}
          <LiveDot at={at} error={error} />
        </div>
        <div className="flex w-full flex-wrap gap-2 border-t border-border pt-3">
          <Link href={`/cases/${caseId}/interview/core`} className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-blue-800">
            Edit answers
          </Link>
          <Link href={`/cases/${caseId}/review`} className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm hover:bg-slate-50">
            Review flags
          </Link>
          <Link href={`/cases/${caseId}/estimate`} className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm hover:bg-slate-50">
            Estimate
          </Link>
          <Link href={`/cases/${caseId}/reports`} className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm hover:bg-slate-50">
            Reports
          </Link>
        </div>
      </div>
      {c.modules.length === 0 ? <p className="mt-6 text-sm text-muted">No answers yet. They appear here as they are typed.</p> : null}
      <div className="mt-6 space-y-5">
        {c.modules.map((m) => (
          <section key={m.module} className="rounded-lg border border-border bg-card">
            <h2 className="border-b border-border px-4 py-2 text-sm font-semibold">{m.label}</h2>
            <dl className="divide-y divide-border">
              {m.answers.map((a) => (
                <div key={a.key} className="grid gap-1 px-4 py-2 text-sm sm:grid-cols-[1.4fr_1fr]">
                  <dt className="text-muted">
                    {a.prompt}
                    {a.item ? <span className="ml-1 text-xs capitalize">({a.item})</span> : null}
                  </dt>
                  <dd className={`font-medium ${a.state === 'not_sure' ? 'text-amber-700' : a.state === 'not_applicable_by_rule' || a.state === 'skipped' ? 'text-muted' : ''}`}>{a.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
