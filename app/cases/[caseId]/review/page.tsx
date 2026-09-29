import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { createClient } from '@/src/lib/supabase/server';
import { loadCaseState } from '@/src/lib/case-state';
import { runCalculation } from '@/src/lib/calc-run';
import { QUESTIONS_BY_ID } from '@/src/questions';
import { Q } from '@/src/questions/ids';
import { MODULE_LABELS } from '@/src/engine/types';
import { GateChecklist } from '@/components/interview/gate-checklist';
import { formatMoney } from '@/src/lib/utils';

export const dynamic = 'force-dynamic';

const KIND_LABELS = { review: 'Items to review', missing: 'Missing information', consistency: 'Consistency checks', opportunity: 'Potential opportunities' } as const;
const KIND_ORDER = ['review', 'missing', 'consistency', 'opportunity'] as const;

export default async function ReviewPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const state = await loadCaseState(supabase, user.id, caseId);
  if (!state) notFound();
  const run = runCalculation(state);
  const { intelligence, estimate } = run;
  const gateQuestion = QUESTIONS_BY_ID.get(Q.gate.checks);
  const ticked = state.view.list(Q.gate.checks) ?? [];

  return (
    <AppShell currentProfileId={state.profile.id} editingFor={state.caseRow.owner_id !== user.id ? { name: state.profile.display_name, adminHref: `/admin/cases/${state.caseRow.id}` } : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Review</h1>
          <p className="text-sm text-muted">
            {state.profile.display_name} · {state.ctx.fy} · {intelligence.completeness.pct}% complete · confidence {intelligence.confidence.level}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/cases/${caseId}/interview/core`} className={buttonVariants({ variant: 'secondary' })}>
            Back to interview
          </Link>
          <Link href={`/cases/${caseId}/estimate`} className={buttonVariants()}>
            See estimate
          </Link>
        </div>
      </div>

      <Card className="mt-6">
        <CardTitle>
          Indicative {estimate.totals.resultCents < 0 ? 'debt' : 'refund'}: {formatMoney(Math.abs(estimate.totals.resultCents))}
        </CardTitle>
        <CardDescription>
          {intelligence.flags.length} flags · {estimate.manualReview.length} items routed to manual review. Every “Not sure” answer appears below.
        </CardDescription>
      </Card>

      {KIND_ORDER.map((kind) => {
        const flags = intelligence.flags.filter((f) => f.kind === kind);
        if (flags.length === 0) return null;
        return (
          <section key={kind} className="mt-6" aria-labelledby={`kind-${kind}`}>
            <h2 id={`kind-${kind}`} className="text-lg font-semibold">
              {KIND_LABELS[kind]} <Badge>{flags.length}</Badge>
            </h2>
            <ul className="mt-3 space-y-3">
              {flags.map((f, i) => (
                <li key={`${f.code}-${i}`} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm">{f.message}</p>
                    <Badge tone={f.severity === 'blocker' ? 'danger' : f.severity === 'warning' ? 'warning' : 'info'}>{f.severity}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {f.questionIds.map((qid) => {
                      const q = QUESTIONS_BY_ID.get(qid);
                      if (!q) return null;
                      return (
                        <Link key={qid} href={`/cases/${caseId}/interview/${q.module}#${qid}`} className="mr-3 underline">
                          {MODULE_LABELS[q.module]}: {q.prompt.slice(0, 60)}
                          {q.prompt.length > 60 ? '…' : ''}
                        </Link>
                      );
                    })}
                    {f.atoRef ? (
                      <a className="underline" href={f.atoRef} target="_blank" rel="noreferrer noopener">
                        ATO information
                      </a>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {intelligence.flags.length === 0 ? <p className="mt-6 text-sm text-muted">No flags. Nice work.</p> : null}

      <section className="mt-8" aria-labelledby="gate">
        <h2 id="gate" className="text-lg font-semibold">
          Completeness gate
        </h2>
        <p className="mt-1 text-sm text-muted">A report can only be marked Final when every item below is confirmed and no blocker remains. Until then reports carry a Draft watermark.</p>
        {gateQuestion ? (
          <GateChecklist caseId={caseId} question={gateQuestion} ticked={ticked} readOnly={state.caseRow.status === 'final'} fy={state.ctx.fy} />
        ) : null}
        <div className="mt-4 rounded-lg border border-border bg-card p-4 text-sm">
          {intelligence.canFinalise ? (
            <p className="text-success">Ready to finalise.</p>
          ) : (
            <>
              <p className="font-medium">Not ready to finalise:</p>
              <ul className="mt-1 list-disc pl-5">
                {intelligence.finaliseBlockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    </AppShell>
  );
}
