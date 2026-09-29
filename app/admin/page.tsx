import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { AdminNav } from '@/components/admin/admin-nav';
import { LiveActivity } from '@/components/admin/live-activity';
import { getAccess } from '@/src/lib/access';
import { recentActivity, userSummaries } from '@/src/lib/admin/live';

export const metadata = { title: 'Admin · Live activity' };
export const dynamic = 'force-dynamic';

export default async function AdminLivePage() {
  const access = await getAccess().catch(() => null);
  if (!access) redirect('/login?next=/admin');
  if (!access.can.viewAllReports) redirect('/dashboard');
  const [activity, users] = await Promise.all([recentActivity(access.supabase), userSummaries(access.supabase)]);
  return (
    <AppShell>
      <AdminNav active="live" />
      <LiveActivity initial={{ activity, users }} />
    </AppShell>
  );
}
