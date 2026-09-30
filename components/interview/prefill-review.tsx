'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PrefillCategory, PrefillProposal } from '@/src/lib/prior-year/prefill';
import { Button } from '@/components/ui/button';

const SECTIONS: { category: PrefillCategory; title: string; note: string }[] = [
  { category: 'opening_balance', title: 'Opening balances', note: 'Worked out from that year\'s closing records (losses used, assets written down), not copied from its opening figures.' },
  { category: 'reusable', title: 'Details that usually stay the same', note: 'Names, ABNs, platforms and assets already bought. Purchase dates and costs are kept, never claimed again.' },
  { category: 'annual_fact', title: 'Last year\'s answers to check again', note: 'Suggestions only. Circumstances change, so confirm each one for this year.' },
];

export function PrefillReview({ caseId, source, sourceLabel, proposals }: { caseId: string; source: { from: string } | { documentId: string }; sourceLabel: string; proposals: PrefillProposal[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState(() => new Set(proposals.filter((p) => p.selected).map((p) => p.key)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = (k: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  async function apply() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/cases/${caseId}/prefill`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...source, keys: [...picked] }) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? 'Could not add the suggestions.');
      setBusy(false);
      return;
    }
    router.push(`/cases/${caseId}/interview/core`);
  }

  if (proposals.length === 0) return <p className="mt-6 text-sm text-muted">Nothing from {sourceLabel} can be carried into this year, or it is already here.</p>;
  return (
    <div className="mt-6 space-y-6">
      {SECTIONS.map((s) => {
        const rows = proposals.filter((p) => p.category === s.category);
        if (!rows.length) return null;
        return (
          <section key={s.category} className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-base font-semibold">{s.title}</h2>
              <p className="text-sm italic text-slate-500">{s.note}</p>
            </div>
            <ul className="divide-y divide-border">
              {rows.map((p) => (
                <li key={p.key} className="px-4 py-3 text-sm">
                  <label className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1 h-5 w-5" checked={picked.has(p.key)} onChange={() => toggle(p.key)} />
                    <span className="flex-1">
                      <span className="block text-muted">
                        {p.prompt}
                        {p.itemLabel ? <span className="ml-1 text-xs">({p.itemLabel})</span> : null}
                      </span>
                      <span className="block font-medium">{p.display}</span>
                      <span className="block text-xs text-muted">
                        Source: {sourceLabel}{p.targetItemId === null && p.groupId ? ' · adds a new entry' : ''}
                      </span>
                      {p.reconciliation ? <span className="mt-1 block text-xs italic text-slate-500">{p.reconciliation}</span> : null}
                      {p.conflict ? <span className="mt-1 block text-xs text-amber-700">This year already has: {p.conflict.display}. Tick only if last year&apos;s value should replace it.</span> : null}
                      {p.warning ? <span className="mt-1 block text-xs text-amber-700">{p.warning}</span> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button disabled={busy || picked.size === 0} onClick={apply}>
        {busy ? 'Adding…' : `Add ${picked.size} suggestion${picked.size === 1 ? '' : 's'} for review`}
      </Button>
    </div>
  );
}

/** Upload a prior-year notice, return or activity record; its balances then show for review. */
export function PriorYearUpload({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append('file', file);
    body.append('kind', 'prior_year');
    const res = await fetch(`/api/cases/${caseId}/documents`, { method: 'POST', body });
    const data = (await res.json().catch(() => ({}))) as { error?: string; documentId?: string };
    setBusy(false);
    if (!res.ok || !data.documentId) {
      setError(data.error ?? 'The document could not be read.');
      return;
    }
    router.push(`/cases/${caseId}/prefill?doc=${data.documentId}`);
  }
  return (
    <div className="mt-3">
      <input
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        disabled={busy}
        aria-label="Upload a prior-year document"
        className="text-sm"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      {busy ? <p className="mt-2 text-sm text-muted">Reading the document…</p> : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
