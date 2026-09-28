import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { createClient } from '@/src/lib/supabase/server';
import { loadCaseState } from '@/src/lib/case-state';
import { runCalculation } from '@/src/lib/calc-run';
import { formatMoney } from '@/src/lib/utils';
import type { EstimateSection } from '@/src/calc/types';
import { GenerateReportButton } from '@/components/interview/generate-report-button';

export const dynamic = 'force-dynamic';

const SECTION_LABELS: Record<EstimateSection, string> = {
  income: 'Assessable income',
  deductions: 'Deductions',
  taxable_income: 'Taxable income',
  gross_tax: 'Gross tax',
  offsets: 'Non-refundable offsets',
  medicare: 'Medicare levy',
  mls: 'Medicare levy surcharge',
  study_loan: 'Study and training loan repayment',
  credits: 'Credits and tax already paid',
  result: 'Result',
};
const SECTION_ORDER: EstimateSection[] = ['income', 'deductions', 'taxable_income', 'gross_tax', 'offsets', 'medicare', 'mls', 'study_loan', 'credits', 'result'];

export default async function EstimatePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const state = await loadCaseState(supabase, user.id, caseId);
  if (!state) notFound();
  const { estimate, intelligence } = runCalculation(state);
  const t = estimate.totals;
  const assessed = state.view.cents('core.assessed_result');
  const isRefund = t.resultCents >= 0;
  const tone = intelligence.confidence.level === 'high' ? 'success' : intelligence.confidence.level === 'medium' ? 'warning' : 'danger';

  return (
    <AppShell currentProfileId={state.profile.id}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Estimate</h1>
          <p className="text-sm text-muted">
            {state.profile.display_name} · {state.ctx.fy} · rules {estimate.ruleSetVersion}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/cases/${caseId}/review`} className={buttonVariants({ variant: 'secondary' })}>
            Review flags
          </Link>
          <Link href={`/cases/${caseId}/reports`} className={buttonVariants({ variant: 'secondary' })}>
            Reports
          </Link>
        </div>
      </div>

      <Card className="mt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardDescription>Indicative {isRefund ? 'refund' : 'debt'}</CardDescription>
            <p className="text-3xl font-semibold">{formatMoney(Math.abs(t.resultCents))}</p>
            {estimate.range && estimate.range.lowCents !== estimate.range.highCents ? (
              <p className="mt-1 text-sm text-muted">
                Between {formatMoney(Math.abs(estimate.range.lowCents))} and {formatMoney(Math.abs(estimate.range.highCents))} depending on the uncertain items below.
              </p>
            ) : null}
            {assessed !== undefined ? (
              <p className="mt-2 text-sm">
                Your notice of assessment showed {assessed >= 0 ? 'a refund of' : 'a debt of'} {formatMoney(Math.abs(assessed))}. Difference: {formatMoney(t.resultCents - assessed)}.
              </p>
            ) : null}
          </div>
          <div className="space-y-2 text-right">
            <Badge tone={tone}>Confidence: {intelligence.confidence.level}</Badge>
            <p className="text-xs text-muted">{intelligence.completeness.pct}% complete</p>
            <GenerateReportButton caseId={caseId} allowFinal={intelligence.canFinalise} />
          </div>
        </div>
        <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          <li>Taxable income: <strong>{formatMoney(t.taxableIncomeCents)}</strong></li>
          <li>Tax and levies: <strong>{formatMoney(t.taxAfterOffsetsCents + t.medicareLevyCents + t.mlsCents + t.studyLoanCents)}</strong></li>
          <li>Credits: <strong>{formatMoney(t.creditsCents)}</strong></li>
        </ul>
        {intelligence.confidence.reasons.length ? (
          <p className="mt-3 text-xs text-muted">Confidence notes: {intelligence.confidence.reasons.join(' ')}</p>
        ) : null}
      </Card>

      <section className="mt-8" aria-labelledby="working">
        <h2 id="working" className="text-lg font-semibold">
          How this was worked out
        </h2>
        <p className="mt-1 text-sm text-muted">Every line shows the rule and the formula behind it. Excluded lines are shown so nothing disappears silently.</p>
        {SECTION_ORDER.map((section) => {
          const lines = estimate.lines.filter((l) => l.section === section);
          if (lines.length === 0) return null;
          return (
            <div key={section} className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <caption className="px-4 py-2 text-left font-medium">{SECTION_LABELS[section]}</caption>
                <thead className="bg-slate-50 text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2">Item</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2">Rule and formula</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className={l.status !== 'computed' ? 'text-muted' : ''}>
                      <td className="px-4 py-2 align-top">
                        {l.label}
                        {l.status === 'manual_review' ? <Badge tone="warning" className="ml-2">manual review</Badge> : null}
                        {l.status === 'excluded' ? <Badge className="ml-2">excluded</Badge> : null}
                        {l.note ? <p className="text-xs text-muted">{l.note}</p> : null}
                      </td>
                      <td className="px-4 py-2 text-right align-top tabular-nums">{formatMoney(l.amountCents)}</td>
                      <td className="px-4 py-2 align-top text-xs text-muted">
                        <span className="font-mono">{l.ruleId}</span>
                        <br />
                        {l.formula}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </section>

      {estimate.manualReview.length ? (
        <section className="mt-8" aria-labelledby="manual">
          <h2 id="manual" className="text-lg font-semibold">
            Routed to manual review
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {estimate.manualReview.map((m, i) => (
              <li key={i}>
                <strong>{m.module}:</strong> {m.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {estimate.assumptions.length ? (
        <section className="mt-8" aria-labelledby="assumptions">
          <h2 id="assumptions" className="text-lg font-semibold">
            Assumptions and simplifications
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {estimate.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
