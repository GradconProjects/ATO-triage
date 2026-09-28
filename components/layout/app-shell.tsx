import Link from 'next/link';
import { createClient } from '@/src/lib/supabase/server';
import { listProfiles } from '@/src/lib/db/repo';
import { ProfileSwitcher } from './profile-switcher';
import { signOut } from '@/app/(auth)/login/actions';
import { DisclaimerFooter } from './disclaimer';

export async function AppShell({ children, currentProfileId }: { children: React.ReactNode; currentProfileId?: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profiles = user ? await listProfiles(supabase) : [];

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/dashboard" className="text-base font-semibold">
            Tax Intake Adviser
          </Link>
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Indicative estimates only</span>
          <div className="ml-auto flex items-center gap-3">
            <ProfileSwitcher profiles={profiles.map((p) => ({ id: p.id, name: p.display_name }))} currentProfileId={currentProfileId} />
            {user ? (
              <form action={signOut}>
                <button type="submit" className="text-sm text-muted underline-offset-2 hover:underline">
                  Sign out
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-6">
        {children}
      </main>
      <DisclaimerFooter />
    </div>
  );
}
