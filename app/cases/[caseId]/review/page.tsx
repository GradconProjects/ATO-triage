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
import { GateChecklist } from '@/components/interview/gate-checklist';
import { formatMoney } from '@/src/lib/utils';
import { questionLink } from '@/src/lib/question-links';
import type { EstimateLine, ManualReviewItem } from '@/src/calc/types';

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
  // Each review item, matched to the estimate line it affects (when there is one), with links to
  // the exact questions to check.
  const reviewLines = estimate.lines.filter((l) => l.status === 'manual_review');
  const lineFor = (r: ManualReviewItem): EstimateLine | undefined =>
    reviewLines.find((l) => r.questionIds.some((qid) => l.inputs.includes(qid.split('@')[0]!) && (!qid.includes('@') || l.itemId === qid.split('@')[1])));
  const linksFor = (r: ManualReviewItem, l: EstimateLine | undefined) => {
    const refs = r.questionIds.length ? r.questionIds : (l?.inputs ?? []);
    const seen = new Set<string>();
    return refs
      .map((ref) => (ref.includes('@') || !l?.itemId ? ref : `${ref}@${l.itemId}`))
      .map((ref) => questionLink(caseId, ref))
      .filter((x): x is { href: string; label: string } => x !== null && !seen.has(x.href) && (seen.add(x.href), true))
      .slice(0, 3);
  };
  const provisional = Math.abs(estimate.totals.provisionalIncomeCents ?? 0) + Math.abs(estimate.totals.provisionalDeductionsCents ?? 0);
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
          {intelligence.flags.length} flags · {estimate.manualReview.length} items need review
          {provisional ? ` · ${formatMoney(provisional)} counted provisionally as entered` : ''}. Every “Not sure” answer appears below.
        </CardDescription>
      </Card>

      {estimate.manualReview.length ? (
        <section className="mt-6" aria-labelledby="needs-review" id="needs-review">
          <h2 id="needs-review-title" className="text-lg font-semibold">
            Needs review <Badge tone="warning">{estimate.manualReview.length}</Badge>
          </h2>
          <p className="mt-1 text-sm text-muted">The estimate already uses what you entered. Open each item to check or correct the answer; the estimate updates as you do.</p>
          <ul className="mt-3 space-y-3">
            {estimate.manualReview.map((r, i) => {
              const l = lineFor(r);
              const links = linksFor(r, l);
              const counted = l?.provisional ? 'Counted provisionally' : l?.heldOut ? 'Not counted until checked' : l ? 'Not counted' : null;
              return (
                <li key={`${r.module}-${i}`} className="rounded-lg border border-amber-200 bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {l ? <p className="text-sm font-medium">{l.label}</p> : null}
                      <p className="text-sm">{r.reason}</p>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      {r.amountCents ? <p className="font-medium">{formatMoney(Math.abs(r.amountCents))}</p> : null}
                      {counted ? <Badge tone={l?.provisional ? 'warning' : 'neutral'}>{counted}</Badge> : null}
                    </div>
                  </div>
                  {links.length ? (
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {links.map((x) => (
                        <Link key={x.href} href={x.href} className="text-primary underline">
                          Go to: {x.label}
                        </Link>
                      ))}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

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
                      const link = questionLink(caseId, qid);
                      if (!link) return null;
                      return (
                        <Link key={qid} href={link.href} className="mr-3 underline">
                          {link.label}
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
