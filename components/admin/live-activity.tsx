'use client';

import Link from 'next/link';
import type { ActivityRow, UserSummary } from '@/src/lib/admin/live';
import { usePoll } from './use-poll';
import { LiveDot } from './live-dot';

function ago(iso: string | null) {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-AU');
}

export function LiveActivity({ initial }: { initial: { activity: ActivityRow[]; users: UserSummary[] } }) {
  const { data, error, at } = usePoll<{ activity: ActivityRow[]; users: UserSummary[] }>('/api/admin/activity', 4000, initial);
  const activity = data?.activity ?? [];
  const users = data?.users ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <section aria-labelledby="people">
        <div className="flex items-center justify-between">
          <h2 id="people" className="text-lg font-semibold">
            People
          </h2>
          <LiveDot at={at} error={error} />
        </div>
        <ul className="mt-3 space-y-2">
          {users.map((u) => (
            <li key={u.id}>
              <Link href={`/admin/users/${u.id}`} className="flex items-center justify-between rounded-lg border border-border bg-card p-3 hover:border-primary">
                <span>
                  <span className="block font-medium">{u.label}</span>
                  <span className="block text-xs text-muted">
                    {u.profiles} profile{u.profiles === 1 ? '' : 's'} · {u.cases} tax year{u.cases === 1 ? '' : 's'} · {u.answers} answers
                  </span>
                </span>
                <span className="text-right text-xs text-muted">
                  last active
                  <span className="block font-medium text-foreground">{ago(u.lastActivity)}</span>
                </span>
              </Link>
            </li>
          ))}
          {users.length === 0 ? <li className="text-sm text-muted">No users yet.</li> : null}
        </ul>
      </section>

      <section aria-labelledby="feed">
        <h2 id="feed" className="text-lg font-semibold">
          Latest answers
        </h2>
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
          {activity.map((a, i) => (
            <li key={`${a.at}-${i}`}>
              <Link href={`/admin/cases/${a.caseId}`} className="block p-3 hover:bg-slate-50">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">
                    {a.userLabel} <span className="font-normal text-muted">· {a.profileName} · {a.fy}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{ago(a.at)}</span>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {a.module}: {a.prompt}
                </p>
                <p className={`mt-0.5 text-sm font-medium ${a.state === 'not_sure' ? 'text-amber-700' : ''}`}>{a.value}</p>
              </Link>
            </li>
          ))}
          {activity.length === 0 ? <li className="p-3 text-sm text-muted">Nothing entered yet. Answers appear here within seconds of being typed.</li> : null}
        </ul>
      </section>
    </div>
  );
}
