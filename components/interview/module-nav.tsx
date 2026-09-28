'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MODULE_LABELS, type ModuleId } from '@/src/engine/types';
import { cn } from '@/src/lib/utils';

export interface ModuleNavEntry {
  module: ModuleId;
  pct: number;
  required: number;
  active: boolean;
}

export function ModuleNav({ caseId, entries, current }: { caseId: string; entries: ModuleNavEntry[]; current: ModuleId }) {
  const router = useRouter();
  const shown = entries.filter((e) => e.active);
  return (
    <>
      {/* Mobile: drop-down */}
      <div className="lg:hidden">
        <label className="block text-xs text-muted" htmlFor="module-select">
          Section
        </label>
        <select
          id="module-select"
          className="mt-1 min-h-11 w-full rounded-md border border-border bg-card px-3"
          value={current}
          onChange={(e) => router.push(`/cases/${caseId}/interview/${e.target.value}`)}
        >
          {shown.map((e) => (
            <option key={e.module} value={e.module}>
              {MODULE_LABELS[e.module]} · {e.pct}%
            </option>
          ))}
          <option value="review">Review and flags</option>
          <option value="estimate">Estimate</option>
        </select>
      </div>
      {/* Desktop: left rail */}
      <nav aria-label="Interview sections" className="hidden lg:block">
        <ol className="space-y-1">
          {shown.map((e, i) => (
            <li key={e.module}>
              <Link
                href={`/cases/${caseId}/interview/${e.module}`}
                aria-current={e.module === current ? 'step' : undefined}
                className={cn('flex items-center justify-between rounded-md px-3 py-2 text-sm', e.module === current ? 'bg-accent font-medium text-primary' : 'hover:bg-slate-100')}
              >
                <span>
                  <span className="mr-2 text-muted">{i + 1}.</span>
                  {MODULE_LABELS[e.module]}
                </span>
                <span className={cn('text-xs', e.pct === 100 ? 'text-success' : 'text-muted')} aria-label={`${e.pct} percent complete`}>
                  {e.pct}%
                </span>
              </Link>
            </li>
          ))}
          <li className="mt-2 border-t border-border pt-2">
            <Link href={`/cases/${caseId}/review`} className="block rounded-md px-3 py-2 text-sm hover:bg-slate-100">
              Review and flags
            </Link>
          </li>
          <li>
            <Link href={`/cases/${caseId}/estimate`} className="block rounded-md px-3 py-2 text-sm hover:bg-slate-100">
              Estimate and report
            </Link>
          </li>
        </ol>
      </nav>
    </>
  );
}
