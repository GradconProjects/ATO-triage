import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { AdminNav } from '@/components/admin/admin-nav';
import { LiveCase } from '@/components/admin/live-case';
import { getAccess } from '@/src/lib/access';
import { caseLive } from '@/src/lib/admin/live';

export const dynamic = 'force-dynamic';

export default async function AdminCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const access = await getAccess().catch(() => null);
  if (!access) redirect('/login?next=/admin');
  if (!access.can.viewAllReports) redirect('/dashboard');
  const data = await caseLive(access.supabase, caseId);
  if (!data) notFound();
  return (
    <AppShell>
      <AdminNav
        active="live"
        crumbs={[
          { href: '/admin', label: 'Live activity' },
          { href: `/admin/users/${data.ownerId}`, label: data.userLabel },
          { label: `${data.profileName} · ${data.fy}` },
        ]}
      />
      <LiveCase caseId={caseId} initial={data} />
    </AppShell>
  );
}
