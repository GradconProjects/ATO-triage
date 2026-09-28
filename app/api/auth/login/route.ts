import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/src/lib/supabase/server';
import { codeToPassword, ensureSeedUser } from '@/src/lib/access';
import { teamEmail } from '@/src/lib/access/seed-users';
import { rateLimit } from '@/src/lib/rate-limit';
import { recordServerError } from '@/src/lib/record-error';

const bodySchema = z.object({
  identifier: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
  next: z.string().max(500).optional(),
});

/**
 * Standard login. One identifier field: an email address signs in with an email account;
 * anything else is a team username whose password is the team code. A plain JSON route
 * (not a server action) so a page loaded before a redeploy can still sign in.
 */
export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!rateLimit(`login:${ip}`, 20, 60_000)) {
      return NextResponse.json({ error: 'Too many attempts. Wait a minute and try again.' }, { status: 429 });
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter your username or email, and your password.' }, { status: 400 });

    const { identifier, password } = parsed.data;
    const next = parsed.data.next && parsed.data.next.startsWith('/') && !parsed.data.next.startsWith('//') ? parsed.data.next : '/dashboard';
    const isEmail = identifier.includes('@');
    const username = identifier.toLowerCase();

    if (!isEmail) await ensureSeedUser(username).catch(() => false);

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(
      isEmail ? { email: identifier, password } : { email: teamEmail(username), password: codeToPassword(username, password) },
    );
    if (error) {
      const msg = /invalid login credentials/i.test(error.message)
        ? 'That username or password is not right.'
        : /email not confirmed/i.test(error.message)
          ? 'Confirm your email address first, then sign in.'
          : 'Sign-in failed. Try again in a moment.';
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    return NextResponse.json({ ok: true, redirect: next });
  } catch (e) {
    await recordServerError(e, 'POST', '/api/auth/login');
    return NextResponse.json({ error: 'Something went wrong signing in. It has been recorded.' }, { status: 500 });
  }
}
