import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { ModulePage } from '@/components/interview/module-page';
import { createClient } from '@/src/lib/supabase/server';
import { loadCaseState, serializeCaseState } from '@/src/lib/case-state';
import { MODULE_ORDER, type ModuleId } from '@/src/engine/types';

export const dynamic = 'force-dynamic';

export default async function InterviewModulePage({ params }: { params: Promise<{ caseId: string; module: string }> }) {
  const { caseId, module } = await params;
  if (module === 'review') redirect(`/cases/${caseId}/review`);
  if (module === 'estimate') redirect(`/cases/${caseId}/estimate`);
  if (!MODULE_ORDER.includes(module as ModuleId)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const state = await loadCaseState(supabase, user.id, caseId);
  if (!state) notFound();
  return (
    <AppShell currentProfileId={state.profile.id}>
      <ModulePage initial={serializeCaseState(state)} module={module as ModuleId} />
    </AppShell>
  );
}
