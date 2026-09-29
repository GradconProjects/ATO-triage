import { NextResponse } from 'next/server';
import { getAccess } from '@/src/lib/access';
import { recentActivity, userSummaries } from '@/src/lib/admin/live';

export const dynamic = 'force-dynamic';

export async function GET() {
  const access = await getAccess().catch(() => null);
  if (!access) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!access.can.viewAllReports) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const [activity, users] = await Promise.all([recentActivity(access.supabase), userSummaries(access.supabase)]);
  return NextResponse.json({ activity, users, at: new Date().toISOString() });
}
