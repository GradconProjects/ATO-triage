import Link from 'next/link';
import { createClient } from '@/src/lib/supabase/server';
import { listProfiles } from '@/src/lib/db/repo';
import { ProfileSwitcher } from './profile-switcher';
import { DisclaimerFooter } from './disclaimer';
import { accessForUser } from '@/src/lib/access';
import { RESTRICTION_LEVELS } from '@/src/lib/access/seed-users';

export async function AppShell({ children, currentProfileId, editingFor }: { children: React.ReactNode; currentProfileId?: string; editingFor?: { name: string; adminHref: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profiles = user ? await listProfiles(supabase, user.id) : [];
  const access = user ? await accessForUser(supabase, user) : null;
  const levelLabel = access ? (RESTRICTION_LEVELS.find((l) => l.value === access.level)?.label ?? access.level) : null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/dashboard" className="text-base font-semibold">
            Tax Intake Adviser
          </Link>
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Indicative estimates only</span>
          <div className="ml-auto flex items-center gap-3">
            {access?.isAdmin ? (
              <Link href="/admin" className="text-sm text-primary underline-offset-2 hover:underline">
                Admin
              </Link>
            ) : null}
            {access && !access.isAdmin && levelLabel ? (
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700" title="Your access level">
                {access.displayName} · {levelLabel}
              </span>
            ) : null}
            <ProfileSwitcher profiles={profiles.map((p) => ({ id: p.id, name: p.display_name }))} currentProfileId={currentProfileId} />
            {user ? (
              <form action="/api/auth/logout" method="post">
                <button type="submit" className="text-sm text-muted underline-offset-2 hover:underline">
                  Sign out
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </header>
      {editingFor ? (
        <div className="border-b border-amber-300 bg-amber-50">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm text-amber-900">
            <span>
              <strong>Admin:</strong> you are filling in <strong>{editingFor.name}</strong>. Changes save to their profile and they will see them.
            </span>
            <Link href={editingFor.adminHref} className="font-medium underline">
              Back to admin view
            </Link>
          </div>
        </div>
      ) : null}
      <main id="main" className="mx-auto max-w-5xl px-4 py-6">
        {children}
      </main>
      <DisclaimerFooter />
    </div>
  );
}
