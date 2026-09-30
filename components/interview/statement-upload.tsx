'use client';

import { useRef, useState } from 'react';
import type { ClientCaseState } from '@/src/lib/case-state';
import type { ExtractedStatement } from '@/src/lib/documents/extract';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/src/lib/utils';

const MAX_BYTES = 4 * 1024 * 1024;

/** Shrink a large phone photo to a JPEG under the upload limit. PDFs are sent as they are. */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= MAX_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  return blob ? new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : file;
}

const dollars = (v: number | null) => (v === null ? '—' : formatMoney(Math.round(v * 100)));

export function StatementUpload({ caseId, onApplied }: { caseId: string; onApplied(state: ClientCaseState): void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'reading' | 'saving' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ extracted: ExtractedStatement; fyMismatch: string | null } | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [done, setDone] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setDone(null);
    setResult(null);
    setBusy('reading');
    try {
      const body = new FormData();
      body.append('file', await shrinkImage(file));
      const res = await fetch(`/api/cases/${caseId}/documents`, { method: 'POST', body });
      const data = (await res.json().catch(() => ({}))) as { error?: string; extracted?: ExtractedStatement; fyMismatch?: string | null };
      if (!res.ok || !data.extracted) throw new Error(data.error ?? 'The document could not be read.');
      setResult({ extracted: data.extracted, fyMismatch: data.fyMismatch ?? null });
      setChosen(new Set(data.extracted.employers.map((_, i) => i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    }
    setBusy(null);
    if (input.current) input.current.value = '';
  }

  async function apply() {
    if (!result) return;
    setBusy('saving');
    setError(null);
    try {
      const employers = result.extracted.employers.filter((_, i) => chosen.has(i));
      const res = await fetch(`/api/cases/${caseId}/documents/apply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employers }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; state?: ClientCaseState; written?: number };
      if (!res.ok || !data.state) throw new Error(data.error ?? 'Could not add the figures.');
      onApplied(data.state);
      setResult(null);
      setDone(`Added ${employers.length} ${employers.length === 1 ? 'employer' : 'employers'} from the statement. Check each figure below; you can change any of them.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the figures.');
    }
    setBusy(null);
  }

  const employers = result?.extracted.employers ?? [];
  return (
    <section className="rounded-lg border border-dashed border-primary/40 bg-blue-50/40 p-4" aria-labelledby="stmt-upload">
      <h2 id="stmt-upload" className="text-base font-medium">
        Have your income statement? Upload it to fill this in
      </h2>
      <p className="mt-1 text-sm text-muted">
        PDF from myGov (ATO → Employment → Income statement), a PAYG payment summary, or a clear photo. We read the figures and show them to you before anything is added. Your tax file number is not read or kept.
      </p>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="sr-only"
        id="stmt-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <Button variant="secondary" className="mt-3" disabled={busy !== null} onClick={() => input.current?.click()}>
        {busy === 'reading' ? 'Reading the statement…' : 'Upload income statement'}
      </Button>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="mt-3 text-sm text-success">
          {done}
        </p>
      ) : null}
      {result ? (
        <div className="mt-4 space-y-3">
          {result.fyMismatch ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
              This statement looks like it is for {result.fyMismatch}, not this tax year. Check before adding.
            </p>
          ) : null}
          {employers.length === 0 ? <p className="text-sm">No employer figures were found in that document.</p> : null}
          {employers.map((e, i) => (
            <label key={i} className="block rounded-md border border-border bg-card p-3 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={chosen.has(i)}
                  onChange={() =>
                    setChosen((s) => {
                      const n = new Set(s);
                      if (n.has(i)) n.delete(i);
                      else n.add(i);
                      return n;
                    })
                  }
                />
                {e.name}
                {e.taxReady === false ? <span className="text-xs font-normal text-amber-700">(not tax ready)</span> : null}
              </span>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                <dt className="text-muted">Gross pay</dt>
                <dd>{dollars(e.gross)}</dd>
                <dt className="text-muted">Tax withheld</dt>
                <dd>{dollars(e.withheld)}</dd>
                {e.rfb ? (
                  <>
                    <dt className="text-muted">Fringe benefits</dt>
                    <dd>{dollars(e.rfb)}</dd>
                  </>
                ) : null}
                {e.resc ? (
                  <>
                    <dt className="text-muted">Employer super (RESC)</dt>
                    <dd>{dollars(e.resc)}</dd>
                  </>
                ) : null}
                {[
                  ['Lump sum A', e.lumpA],
                  ['Lump sum B', e.lumpB],
                  ['Lump sum D', e.lumpD],
                  ['Lump sum E', e.lumpE],
                ].map(([l, v]) =>
                  v ? (
                    <span key={l as string} className="contents">
                      <dt className="text-muted">{l}</dt>
                      <dd>{dollars(v as number)}</dd>
                    </span>
                  ) : null,
                )}
                {e.allowances.map((a, j) => (
                  <span key={j} className="contents">
                    <dt className="text-muted">Allowance: {a.description}</dt>
                    <dd>{dollars(a.amount)}</dd>
                  </span>
                ))}
              </dl>
            </label>
          ))}
          {result.extracted.notes ? <p className="text-sm text-muted">Note: {result.extracted.notes}</p> : null}
          {employers.length ? (
            <div className="flex gap-2">
              <Button disabled={busy !== null || chosen.size === 0} onClick={apply}>
                {busy === 'saving' ? 'Adding…' : 'Add these figures'}
              </Button>
              <Button variant="secondary" disabled={busy !== null} onClick={() => setResult(null)}>
                Discard
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
