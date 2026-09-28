'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FY, Question } from '@/src/engine/types';

export function GateChecklist({ caseId, question, ticked, readOnly, fy }: { caseId: string; question: Question; ticked: string[]; readOnly: boolean; fy: FY }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(ticked.filter((t) => t !== 'none'));
  const [saving, setSaving] = useState(false);
  const options = (question.options ?? []).filter((o) => o.value !== 'none' && o.value !== 'not_sure');
  void fy;

  async function save(next: string[]) {
    setSelected(next);
    setSaving(true);
    try {
      await fetch(`/api/cases/${caseId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ writes: [{ questionId: question.id, repeaterItemId: null, value: next.length ? next : ['none'], state: 'answered', source: 'user' }] }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset className="mt-3 space-y-2" disabled={readOnly || saving}>
      <legend className="sr-only">{question.prompt}</legend>
      {options.map((o) => (
        <label key={o.value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border bg-card p-3">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5"
            checked={selected.includes(o.value)}
            onChange={(e) => save(e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))}
          />
          <span>
            <span className="block text-sm font-medium">{o.label}</span>
            {o.help ? <span className="block text-xs text-muted">{o.help}</span> : null}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
