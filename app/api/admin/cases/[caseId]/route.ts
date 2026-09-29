import { NextResponse } from 'next/server';
import { getAccess } from '@/src/lib/access';
import { caseLive } from '@/src/lib/admin/live';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const access = await getAccess().catch(() => null);
  if (!access) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!access.can.viewAllReports) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const data = await caseLive(access.supabase, caseId);
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ...data, at: new Date().toISOString() });
}
