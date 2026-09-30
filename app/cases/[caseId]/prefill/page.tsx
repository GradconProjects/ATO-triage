import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { createClient } from '@/src/lib/supabase/server';
import { getCase, getProfile } from '@/src/lib/db/repo';
import { earlierCases, loadPrefill } from '@/src/lib/prior-year/service';
import { PrefillReview, PriorYearUpload } from '@/components/interview/prefill-review';

export const dynamic = 'force-dynamic';

export default async function PrefillPage({ params, searchParams }: { params: Promise<{ caseId: string }>; searchParams: Promise<{ from?: string; doc?: string }> }) {
  const { caseId } = await params;
  const { from, doc } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const caseRow = await getCase(supabase, caseId);
  if (!caseRow) notFound();
  const profile = await getProfile(supabase, caseRow.profile_id);
  if (!profile) notFound();
  const earlier = await earlierCases(supabase, caseRow);
  const chosen = from && earlier.some((c) => c.id === from) ? from : earlier[0]?.id;
  const loaded = doc ? await loadPrefill(supabase, user.id, caseId, { documentId: doc }) : chosen ? await loadPrefill(supabase, user.id, caseId, { from: chosen }) : null;

  return (
    <AppShell currentProfileId={profile.id} editingFor={caseRow.owner_id !== user.id ? { name: profile.display_name, adminHref: `/admin/cases/${caseRow.id}` } : undefined}>
      <h1 className="text-2xl font-semibold">Prefill {caseRow.financial_year} from an earlier year</h1>
      <p className="mt-1 text-sm text-muted">
        {profile.display_name}. Nothing here is final: every value is added as a suggestion you must confirm in the interview before it counts.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>From an earlier year in this app</CardTitle>
          {earlier.length === 0 ? (
            <CardDescription>This profile has no earlier tax year here.</CardDescription>
          ) : (
            <form className="mt-3 flex flex-wrap items-end gap-2" method="get">
              <label className="text-sm">
                <span className="block text-xs text-muted">Copy from</span>
                <select name="from" defaultValue={doc ? undefined : chosen} className="min-h-10 rounded-md border border-border bg-card px-3">
                  {earlier.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.financial_year} ({c.status})
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                Show
              </button>
            </form>
          )}
        </Card>
        <Card>
          <CardTitle>From last year&apos;s notice or return</CardTitle>
          <CardDescription>Upload the notice of assessment, a copy of the return, or an activity statement to read its closing balances.</CardDescription>
          <PriorYearUpload caseId={caseId} />
        </Card>
      </div>
      {loaded && 'error' in loaded ? <p className="mt-4 text-sm text-danger">{loaded.error}</p> : null}
      {loaded && !('error' in loaded) ? (
        <>
          <p className="mt-6 text-sm">
            Showing values from <strong>{loaded.source.label}</strong>.
          </p>
          <PrefillReview caseId={caseId} source={loaded.source.documentId ? { documentId: loaded.source.documentId } : { from: loaded.source.caseId! }} sourceLabel={loaded.source.label} proposals={loaded.proposals} />
        </>
      ) : null}
      <p className="mt-6">
        <Link href={`/cases/${caseId}/interview/core`} className="text-sm text-primary underline-offset-2 hover:underline">
          Skip and go to the interview
        </Link>
      </p>
    </AppShell>
  );
}
