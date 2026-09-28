import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label, Select } from '@/components/ui/input';
import { createClient } from '@/src/lib/supabase/server';
import { getProfile, listCasesForProfile } from '@/src/lib/db/repo';
import { PURPOSE_LABELS, STATUS_LABELS, type CasePurpose } from '@/src/lib/db/types';
import { FINANCIAL_YEARS } from '@/src/engine/types';
import { ProfileForm } from '../profile-form';
import { createCaseAction, deleteCaseAction, deleteProfileAction, updateProfileAction } from '../actions';
import { ConfirmButton } from '@/components/layout/confirm-button';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const supabase = await createClient();
  const profile = await getProfile(supabase, profileId);
  if (!profile) notFound();
  const cases = await listCasesForProfile(supabase, profileId);
  const createCase = createCaseAction.bind(null, profileId);
  const updateProfile = updateProfileAction.bind(null, profileId);
  const deleteProfile = deleteProfileAction.bind(null, profileId);

  return (
    <AppShell currentProfileId={profileId}>
      <h1 className="text-2xl font-semibold">{profile.display_name}</h1>
      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Tax years</CardTitle>
          <CardDescription>Each year is assessed separately. Start a new year to run the interview for it.</CardDescription>
          <ul className="mt-4 space-y-3">
            {cases.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
                <div>
                  <p className="font-medium">
                    {c.financial_year} <Badge tone={c.status === 'final' ? 'success' : c.status === 'in_review' ? 'warning' : 'neutral'}>{STATUS_LABELS[c.status]}</Badge>
                  </p>
                  <p className="text-xs text-muted">{PURPOSE_LABELS[c.purpose]}</p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/cases/${c.id}/interview/core`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    Open
                  </Link>
                  <Link href={`/cases/${c.id}/estimate`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                    Estimate
                  </Link>
                  {c.status !== 'final' ? (
                    <form action={deleteCaseAction.bind(null, profileId, c.id)}>
                      <ConfirmButton label="Delete" message={`Delete the ${c.financial_year} case and all its answers?`} />
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
            {cases.length === 0 ? <li className="text-sm text-muted">No tax years yet.</li> : null}
          </ul>
          <form action={createCase} className="mt-5 space-y-3 rounded-md bg-accent p-3">
            <p className="text-sm font-medium">Start a new year</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="financial_year">Financial year</Label>
                <Select id="financial_year" name="financial_year" required defaultValue="" className="mt-1">
                  <option value="" disabled>
                    Choose
                  </option>
                  {FINANCIAL_YEARS.map((fy) => (
                    <option key={fy} value={fy}>
                      {fy}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="purpose">Purpose</Label>
                <Select id="purpose" name="purpose" required defaultValue="" className="mt-1">
                  <option value="" disabled>
                    Choose
                  </option>
                  {(Object.keys(PURPOSE_LABELS) as CasePurpose[]).map((p) => (
                    <option key={p} value={p}>
                      {PURPOSE_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {cases.length ? (
              <div>
                <Label htmlFor="copy_from">Copy stable facts from an earlier year (optional)</Label>
                <Select id="copy_from" name="copy_from" defaultValue="" className="mt-1">
                  <option value="">Do not copy</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.financial_year} · {PURPOSE_LABELS[c.purpose]}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-muted">Copied answers arrive marked “imported” and you must confirm each one before it counts.</p>
              </div>
            ) : null}
            <Button type="submit">Start year</Button>
          </form>
        </Card>
        <Card>
          <CardTitle>Profile details</CardTitle>
          <ProfileForm
            action={updateProfile}
            submitLabel="Save changes"
            initial={{ display_name: profile.display_name, relationship: profile.relationship, birth_year: profile.birth_year, occupations: profile.occupations }}
          />
          <form action={deleteProfile} className="mt-6 border-t border-border pt-4">
            <p className="text-sm text-muted">Deleting removes this profile, every tax year, all answers, documents and reports. This cannot be undone.</p>
            <ConfirmButton label="Delete profile" message={`Delete ${profile.display_name} and everything under it?`} variant="danger" />
          </form>
        </Card>
      </section>
    </AppShell>
  );
}
