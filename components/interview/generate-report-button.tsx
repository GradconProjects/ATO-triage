'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

interface Props {
  caseId: string;
  /** Hide the "final" option (for example when the case is already final). */
  allowFinal?: boolean;
}

/** Generates a draft or final report snapshot via POST /api/cases/[caseId]/snapshot and refreshes the list. */
export function GenerateReportButton({ caseId, allowFinal = true }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'draft' | 'final' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);

  async function generate(final: boolean) {
    setBusy(final ? 'final' : 'draft');
    setError(null);
    setBlockers([]);
    setDone(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; blockers?: string[]; reportId?: string; pdfPath?: string | null };
      if (res.status === 409) {
        setError(body.error ?? 'This case cannot be finalised yet.');
        setBlockers(body.blockers ?? []);
        return;
      }
      if (!res.ok) {
        setError(body.error ?? `Could not generate the report (${res.status}).`);
        return;
      }
      setDone(final ? 'Final report generated. The case is now read-only.' : 'Draft report generated.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy !== null} onClick={() => generate(false)}>
          {busy === 'draft' ? 'Generating…' : 'Generate draft report'}
        </Button>
        {allowFinal ? (
          <Button disabled={busy !== null} onClick={() => generate(true)}>
            {busy === 'final' ? 'Generating…' : 'Generate final report'}
          </Button>
        ) : null}
      </div>
      {done ? <Alert tone="success">{done}</Alert> : null}
      {error ? (
        <Alert tone={blockers.length ? 'warning' : 'danger'}>
          <p className="font-medium">{error}</p>
          {blockers.length ? (
            <ul className="mt-2 list-disc pl-5">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}
    </div>
  );
}
