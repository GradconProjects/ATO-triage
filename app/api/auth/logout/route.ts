import { NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';

/** Sign out and return to the landing page. Plain form POST, no server action. */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut().catch(() => undefined);
  return NextResponse.redirect(new URL('/', request.url), 303);
}
