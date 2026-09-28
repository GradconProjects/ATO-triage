import { NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { audit } from '@/src/lib/db/repo';

/** "Export my data": every row the signed-in user owns, as JSON. RLS scopes each query. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const tables = ['profiles', 'fy_cases', 'repeater_items', 'answers', 'documents', 'estimates', 'flags', 'reports'] as const;
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), userId: user.id, email: user.email };
  for (const t of tables) {
    const res = await supabase.from(t).select('*');
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
    out[t] = res.data;
  }
  await audit(supabase, user.id, 'account', null, 'export');
  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="tax-intake-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
