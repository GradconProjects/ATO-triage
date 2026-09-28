import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { createClient } from '@/src/lib/supabase/server';
import { listCases, listProfiles } from '@/src/lib/db/repo';
import { RELATIONSHIP_LABELS, STATUS_LABELS } from '@/src/lib/db/types';
import { findOccupation } from '@/src/occupations/registry';
import { formatMoney } from '@/src/lib/utils';
import { accessForUser } from '@/src/lib/access';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const access = user ? await accessForUser(supabase, user) : null;
  const [profiles, cases] = await Promise.all([listProfiles(supabase), listCases(supabase)]);
  const latestEstimates = await supabase.from('estimates').select('case_id, result, created_at').order('created_at', { ascending: false });
  const estimateByCase = new Map<string, { resultCents: number }>();
  for (const e of (latestEstimates.data ?? []) as { case_id: string; result: { totals?: { resultCents?: number } } }[]) {
    if (!estimateByCase.has(e.case_id)) estimateByCase.set(e.case_id, { resultCents: e.result?.totals?.resultCents ?? 0 });
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Profiles</h1>
        <div className="flex gap-2">
          <a href="/api/export" className={buttonVariants({ variant: 'secondary' })}>
            Export my data
          </a>
          {access?.can.createProfile ? (
            <Link href="/profiles/new" className={buttonVariants()}>
              Add profile
            </Link>
          ) : null}
        </div>
      </div>
      {profiles.length === 0 ? (
        <Card className="mt-6">
          <CardTitle>No profiles yet</CardTitle>
          <CardDescription>Add a profile for yourself, a family member or a client to start an interview for a tax year.</CardDescription>
        </Card>
      ) : null}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {profiles.map((p) => {
          const pc = cases.filter((c) => c.profile_id === p.id);
          const latest = pc[0];
          const est = latest ? estimateByCase.get(latest.id) : undefined;
          return (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle>
                    <Link href={`/profiles/${p.id}`} className="hover:underline">
                      {p.display_name}
                    </Link>
                  </CardTitle>
                  <CardDescription>{RELATIONSHIP_LABELS[p.relationship]}</CardDescription>
                </div>
                <Badge>{pc.length} {pc.length === 1 ? 'year' : 'years'}</Badge>
              </div>
              <p className="mt-2 text-sm">
                {p.occupations.length ? p.occupations.map((o) => findOccupation(o)?.label ?? o).join(', ') : 'No occupation set'}
              </p>
              {latest ? (
                <p className="mt-2 text-sm text-muted">
                  Latest: {latest.financial_year} · {STATUS_LABELS[latest.status]}
                  {est ? ` · ${est.resultCents >= 0 ? 'refund' : 'debt'} ${formatMoney(Math.abs(est.resultCents))} (indicative)` : ''}
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted">No tax year started</p>
              )}
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
