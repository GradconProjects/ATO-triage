import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { AdminNav } from '@/components/admin/admin-nav';
import { Badge } from '@/components/ui/badge';
import { getAccess } from '@/src/lib/access';
import { userDetail } from '@/src/lib/admin/live';
import { findOccupation } from '@/src/occupations/registry';
import { PURPOSE_LABELS, type CasePurpose } from '@/src/lib/db/types';
import { formatMoney } from '@/src/lib/utils';
import { AutoRefresh } from '@/components/admin/auto-refresh';

export const dynamic = 'force-dynamic';

export default async function AdminUserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const access = await getAccess().catch(() => null);
  if (!access) redirect('/login?next=/admin');
  if (!access.can.viewAllReports) redirect('/dashboard');
  const d = await userDetail(access.supabase, userId);
  return (
    <AppShell>
      <AdminNav active="live" crumbs={[{ href: '/admin', label: 'Live activity' }, { label: d.label }]} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{d.label}</h1>
        <AutoRefresh ms={8000} />
      </div>
      {d.profiles.length === 0 ? <p className="mt-4 text-sm text-muted">This user hasn&apos;t created a profile yet.</p> : null}
      <div className="mt-4 space-y-4">
        {d.profiles.map((p) => (
          <section key={p.id} className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <p className="text-sm text-muted">{p.occupations.map((o) => findOccupation(o)?.label ?? o).join(', ') || 'No occupation set'}</p>
            <ul className="mt-3 space-y-2">
              {p.cases.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/cases/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 hover:border-primary">
                    <span>
                      <span className="font-medium">{c.fy}</span> <Badge>{c.status}</Badge>
                      <span className="block text-xs text-muted">
                        {PURPOSE_LABELS[c.purpose as CasePurpose] ?? c.purpose} · {c.answers} answers
                        {c.lastActivity ? ` · last change ${new Date(c.lastActivity).toLocaleString('en-AU')}` : ''}
                      </span>
                    </span>
                    <span className="text-sm font-medium">
                      {c.resultCents === null ? 'View answers →' : `${c.resultCents < 0 ? 'Debt' : 'Refund'} ${formatMoney(Math.abs(c.resultCents))} →`}
                    </span>
                  </Link>
                </li>
              ))}
              {p.cases.length === 0 ? <li className="text-sm text-muted">No tax year started.</li> : null}
            </ul>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
