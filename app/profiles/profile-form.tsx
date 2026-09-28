'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { RELATIONSHIP_LABELS, type Relationship } from '@/src/lib/db/types';
import { OCCUPATIONS, searchOccupations } from '@/src/occupations/registry';

export interface ProfileFormValues {
  display_name: string;
  relationship: Relationship;
  birth_year: number | null;
  occupations: string[];
}

export function ProfileForm({
  action,
  submitLabel,
  initial,
}: {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  initial?: ProfileFormValues;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>(initial?.occupations ?? []);
  const results = useMemo(() => searchOccupations(query), [query]);

  return (
    <form action={action} className="mt-6 max-w-xl space-y-5">
      <div>
        <Label htmlFor="display_name">Display name</Label>
        <Input id="display_name" name="display_name" required defaultValue={initial?.display_name} className="mt-1" />
      </div>
      <div>
        <Label htmlFor="relationship">Who is this profile for?</Label>
        <Select id="relationship" name="relationship" defaultValue={initial?.relationship ?? 'self'} className="mt-1">
          {(Object.keys(RELATIONSHIP_LABELS) as Relationship[]).map((r) => (
            <option key={r} value={r}>
              {RELATIONSHIP_LABELS[r]}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="birth_year">Year of birth (optional)</Label>
        <Input id="birth_year" name="birth_year" type="number" inputMode="numeric" min={1900} max={2100} defaultValue={initial?.birth_year ?? ''} className="mt-1" />
        <p className="mt-1 text-xs text-muted">Only the year. It is used for age-based rules such as the seniors offset and the private health rebate.</p>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Occupations</legend>
        <p className="mt-1 text-xs text-muted">Tick every job this person had in a year. You can also set the occupation per employer inside the interview.</p>
        <Input aria-label="Search occupations" placeholder="Search e.g. NDIS, carpenter, chef" value={query} onChange={(e) => setQuery(e.target.value)} className="mt-2" />
        <ul className="mt-2 max-h-64 space-y-1 overflow-auto rounded-md border border-border p-2">
          {results.map((o) => {
            const checked = selected.includes(o.id);
            return (
              <li key={o.id}>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded px-2 py-2 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    name="occupations"
                    value={o.id}
                    checked={checked}
                    onChange={(e) => setSelected((s) => (e.target.checked ? [...s, o.id] : s.filter((x) => x !== o.id)))}
                    className="mt-1 h-5 w-5"
                  />
                  <span>
                    <span className="block text-sm font-medium">{o.label}</span>
                    {o.aliases.length ? <span className="block text-xs text-muted">{o.aliases.slice(0, 4).join(', ')}</span> : null}
                  </span>
                </label>
              </li>
            );
          })}
          {results.length === 0 ? <li className="p-2 text-sm text-muted">No match. Choose “Other / not listed”.</li> : null}
        </ul>
        {selected.length ? (
          <p className="mt-2 text-sm">
            Selected: {selected.map((id) => OCCUPATIONS.find((o) => o.id === id)?.label ?? id).join(', ')}
          </p>
        ) : null}
      </fieldset>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
