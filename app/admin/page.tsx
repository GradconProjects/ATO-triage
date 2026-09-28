import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { getAccess } from '@/src/lib/access';
import { listTeamUsers } from '@/src/lib/access/admin';
import { RESTRICTION_LEVELS, seedUsers } from '@/src/lib/access/seed-users';
import { AddUserForm, ResetCodeForm, RestrictionSelect } from './user-forms';
import { deleteTeamUserAction } from './actions';
import { ConfirmButton } from '@/components/layout/confirm-button';

export const metadata = { title: 'Admin · Users' };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  let access;
  try {
    access = await getAccess();
  } catch {
    redirect('/login?next=/admin');
  }
  if (!access.can.manageUsers) redirect('/dashboard');

  let users: Awaited<ReturnType<typeof listTeamUsers>> = [];
  let error: string | null = null;
  try {
    users = await listTeamUsers();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not load users';
  }
  const seeds = seedUsers();
  const pendingSeeds = seeds.filter((s) => !users.some((u) => u.username === s.username));

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Users and access</h1>
          <p className="text-sm text-muted">You are signed in as {access.user.email} with no restriction.</p>
        </div>
        <Link href="/admin/reports" className={buttonVariants({ variant: 'secondary' })}>
          All reports
        </Link>
      </div>

      {error ? (
        <Card className="mt-6 border-red-200 bg-red-50">
          <CardTitle>Service role key not configured</CardTitle>
          <CardDescription>User management needs SUPABASE_SERVICE_ROLE_KEY on the server. Error: {error}</CardDescription>
        </Card>
      ) : null}

      <section className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardTitle>Team users</CardTitle>
          <CardDescription>Each user signs in with a username and code. Set what each one may do.</CardDescription>
          <ul className="mt-4 divide-y divide-border">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">
                    {u.display_name} <span className="text-xs text-muted">@{u.username}</span>
                  </p>
                  <p className="text-xs text-muted">Added {new Date(u.created_at).toLocaleDateString('en-AU')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RestrictionSelect userId={u.id} current={u.restriction_level} />
                  <ResetCodeForm userId={u.id} />
                  <form action={deleteTeamUserAction.bind(null, u.id)}>
                    <ConfirmButton label="Remove" message={`Remove ${u.display_name} and everything they created? This cannot be undone.`} variant="ghost" />
                  </form>
                </div>
              </li>
            ))}
            {users.length === 0 && !error ? <li className="py-3 text-sm text-muted">No team users yet.</li> : null}
          </ul>
          {pendingSeeds.length ? (
            <p className="mt-3 text-xs text-muted">
              Configured in TEAM_SEED_USERS but not yet created (they are created on their first sign-in): {pendingSeeds.map((s) => s.username).join(', ')}.
            </p>
          ) : null}
        </Card>
        <div className="space-y-6">
          <Card>
            <CardTitle>Add a user</CardTitle>
            <AddUserForm />
          </Card>
          <Card>
            <CardTitle>Restriction levels</CardTitle>
            <ul className="mt-3 space-y-2 text-sm">
              {RESTRICTION_LEVELS.map((l) => (
                <li key={l.value}>
                  <Badge className="mr-2">{l.label}</Badge>
                  <span className="text-muted">{l.description}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>
    </AppShell>
  );
}
