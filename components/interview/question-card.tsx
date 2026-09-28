'use client';

import { useId, useState } from 'react';
import type { AnswerRecord, CaseContext, DateRangeValue, Option, Question } from '@/src/engine/types';
import { formatCents, parseMoneyToCents, validateAnswer } from '@/src/engine/validation';
import { cn } from '@/src/lib/utils';
import type { PendingWrite } from '@/src/lib/store/interview-store';

export interface QuestionCardProps {
  question: Question;
  itemId: string | null;
  record: AnswerRecord | undefined;
  ctx: CaseContext;
  readOnly?: boolean;
  onWrite(write: PendingWrite): void;
  /** Server-side rejection for this question, if any. */
  serverErrors?: string[];
}

const YES_NO_UNSURE: Option[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'not_sure', label: 'Not sure', help: 'We will flag this for you to check. It is never treated as “No”.' },
];

function isNotSureOption(o: Option) {
  return o.value === 'not_sure';
}

export function QuestionCard({ question: q, itemId, record, ctx, readOnly, onWrite, serverErrors }: QuestionCardProps) {
  const id = useId();
  const [showHelp, setShowHelp] = useState(false);
  const [localError, setLocalError] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const state = record?.state;
  const value = state === 'answered' ? record?.value : undefined;
  const isNotSure = state === 'not_sure';
  const isImported = state === 'imported';
  const isSkipped = state === 'skipped';

  function write(v: unknown, s: 'answered' | 'not_sure' = 'answered') {
    if (readOnly) return;
    if (s === 'answered') {
      const { errors, warnings: w } = validateAnswer(q, v, ctx);
      setLocalError(errors);
      setWarnings(w);
      if (errors.length) return;
    } else {
      setLocalError([]);
      setWarnings([]);
    }
    onWrite({ questionId: q.id, repeaterItemId: itemId, value: v, state: s, source: 'user' });
  }

  const errors = [...localError, ...(serverErrors ?? [])];
  const options = q.type === 'yes_no_unsure' ? YES_NO_UNSURE : (q.options ?? []);

  return (
    <div
      className={cn('rounded-lg border bg-card p-4', errors.length ? 'border-red-300' : isSkipped ? 'border-amber-300' : 'border-border')}
      data-question-id={q.id}
      data-item-id={itemId ?? undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div id={`${id}-label`} className="text-base font-medium">
          {q.prompt}
          {q.required ? <span className="sr-only"> (required)</span> : <span className="ml-1 text-xs font-normal text-muted">(optional)</span>}
        </div>
        {q.help ? (
          <button type="button" className="shrink-0 text-xs text-primary underline-offset-2 hover:underline" aria-expanded={showHelp} onClick={() => setShowHelp((s) => !s)}>
            Why we ask
          </button>
        ) : null}
      </div>
      {showHelp && q.help ? <p className="mt-2 rounded bg-accent p-2 text-sm">{q.help}</p> : null}

      {isImported ? (
        <div role="status" className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
          <p>
            <strong>Imported value:</strong> {displayValue(q, record?.value)}
          </p>
          <p className="mt-1 text-xs text-muted">Copied from an earlier year or a document. Confirm it or enter a new answer. It does not count until you confirm.</p>
          <button
            type="button"
            className="mt-2 min-h-9 rounded-md bg-primary px-3 text-sm text-white"
            onClick={() => onWrite({ questionId: q.id, repeaterItemId: itemId, value: record?.value, state: 'answered', source: 'prefill_confirmed' })}
          >
            Confirm this value
          </button>
        </div>
      ) : null}

      <div className="mt-3">
        {q.type === 'single' || q.type === 'yes_no_unsure' ? (
          <ChoiceGroup
            name={`${id}-choice`}
            labelledBy={`${id}-label`}
            options={options}
            selected={isNotSure ? ['not_sure'] : typeof value === 'string' ? [value] : []}
            multi={false}
            readOnly={readOnly}
            onChange={(vals) => {
              const v = vals[0];
              if (v === undefined) return;
              if (v === 'not_sure') write('not_sure', 'not_sure');
              else write(v);
            }}
          />
        ) : null}
        {q.type === 'multi' ? (
          <ChoiceGroup
            name={`${id}-choice`}
            labelledBy={`${id}-label`}
            options={options}
            selected={isNotSure ? ['not_sure'] : Array.isArray(value) ? (value as string[]) : []}
            multi
            readOnly={readOnly}
            onChange={(vals) => {
              if (vals.includes('not_sure')) write(['not_sure'], 'not_sure');
              else write(vals);
            }}
          />
        ) : null}
        {q.type === 'money' ? (
          <MoneyInput
            id={`${id}-input`}
            labelledBy={`${id}-label`}
            cents={typeof value === 'number' ? value : null}
            allowNegative={Boolean(q.allowNegative)}
            readOnly={readOnly}
            onCommit={(cents) => write(cents)}
          />
        ) : null}
        {q.type === 'number' || q.type === 'percent' || q.type === 'km' ? (
          <NumberInput
            id={`${id}-input`}
            labelledBy={`${id}-label`}
            value={typeof value === 'number' ? value : null}
            suffix={q.type === 'percent' ? '%' : q.type === 'km' ? 'km' : undefined}
            max={q.type === 'percent' ? 100 : undefined}
            readOnly={readOnly}
            onCommit={(n) => write(n)}
          />
        ) : null}
        {q.type === 'date' ? (
          <input
            id={`${id}-input`}
            type="date"
            aria-labelledby={`${id}-label`}
            className="min-h-11 w-full max-w-xs rounded-md border border-border bg-card px-3"
            defaultValue={typeof value === 'string' ? value : ''}
            readOnly={readOnly}
            onBlur={(e) => e.target.value && write(e.target.value)}
          />
        ) : null}
        {q.type === 'date_range' ? (
          <DateRangeInput id={id} value={value as DateRangeValue | undefined} readOnly={readOnly} onCommit={(v) => write(v)} />
        ) : null}
        {q.type === 'text' ? (
          <input
            id={`${id}-input`}
            type="text"
            aria-labelledby={`${id}-label`}
            className="min-h-11 w-full rounded-md border border-border bg-card px-3"
            defaultValue={typeof value === 'string' ? value : ''}
            readOnly={readOnly}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v) write(v);
            }}
          />
        ) : null}
        {q.type !== 'single' && q.type !== 'multi' && q.type !== 'yes_no_unsure' && q.type !== 'repeater' ? (
          <label className={cn('mt-2 flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-md px-2 text-sm', isNotSure && 'bg-amber-50')}>
            <input type="checkbox" className="h-5 w-5" checked={isNotSure} disabled={readOnly} onChange={(e) => (e.target.checked ? write(null, 'not_sure') : undefined)} />
            Not sure
          </label>
        ) : null}
      </div>

      {q.atoRef ? (
        <p className="mt-2 text-xs text-muted">
          Based on information published by the ATO:{' '}
          <a className="underline" href={q.atoRef} target="_blank" rel="noreferrer noopener">
            source
          </a>
        </p>
      ) : null}
      {isSkipped ? <p className="mt-2 text-xs text-warning">Skipped. Answer it or mark Not sure.</p> : null}
      {errors.map((e) => (
        <p key={e} role="alert" className="mt-2 text-sm text-danger">
          {e}
        </p>
      ))}
      {warnings.map((w) => (
        <p key={w} role="status" className="mt-2 text-sm text-warning">
          {w}
        </p>
      ))}
    </div>
  );
}

function ChoiceGroup({
  name,
  labelledBy,
  options,
  selected,
  multi,
  readOnly,
  onChange,
}: {
  name: string;
  labelledBy: string;
  options: Option[];
  selected: string[];
  multi: boolean;
  readOnly?: boolean;
  onChange(values: string[]): void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <div role={multi ? 'group' : 'radiogroup'} aria-labelledby={labelledBy} className="space-y-2">
      {options.map((o) => {
        const checked = selected.includes(o.value);
        const exclusive = Boolean(o.exclusive) || isNotSureOption(o);
        return (
          <label
            key={o.value}
            className={cn(
              'flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3',
              checked ? 'border-primary bg-accent' : 'border-border hover:bg-slate-50',
              readOnly && 'cursor-default opacity-80',
            )}
          >
            <input
              type={multi ? 'checkbox' : 'radio'}
              name={name}
              value={o.value}
              checked={checked}
              disabled={readOnly}
              className="mt-0.5 h-5 w-5 shrink-0"
              onChange={(e) => {
                if (!multi) {
                  onChange([o.value]);
                  return;
                }
                let next: string[];
                if (e.target.checked) {
                  if (exclusive) {
                    next = [o.value];
                    if (selected.length) setNotice(`“${o.label}” clears your other ticks.`);
                  } else {
                    next = [...selected.filter((v) => !options.find((x) => x.value === v && (x.exclusive || isNotSureOption(x)))), o.value];
                    setNotice(null);
                  }
                } else {
                  next = selected.filter((v) => v !== o.value);
                  setNotice(null);
                }
                onChange(next);
              }}
            />
            <span>
              <span className="block text-sm font-medium">{o.label}</span>
              {o.help ? <span className="block text-xs text-muted">{o.help}</span> : null}
            </span>
          </label>
        );
      })}
      {notice ? (
        <p role="status" className="text-xs text-muted">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

function MoneyInput({
  id,
  labelledBy,
  cents,
  allowNegative,
  readOnly,
  onCommit,
}: {
  id: string;
  labelledBy: string;
  cents: number | null;
  allowNegative: boolean;
  readOnly?: boolean;
  onCommit(cents: number): void;
}) {
  const [text, setText] = useState(cents === null ? '' : formatCents(cents).replace('$', ''));
  const [bad, setBad] = useState(false);
  return (
    <div className="flex max-w-xs items-center rounded-md border border-border bg-card focus-within:ring-2 focus-within:ring-primary">
      <span className="px-3 text-muted" aria-hidden>
        $
      </span>
      <input
        id={id}
        inputMode="decimal"
        aria-labelledby={labelledBy}
        aria-invalid={bad}
        className="min-h-11 w-full bg-transparent pr-3 outline-none"
        value={text}
        readOnly={readOnly}
        placeholder="0.00"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text.trim() === '') return;
          const c = parseMoneyToCents(text);
          if (c === null || (!allowNegative && c < 0)) {
            setBad(true);
            return;
          }
          setBad(false);
          setText(formatCents(c).replace('$', ''));
          onCommit(c);
        }}
      />
    </div>
  );
}

function NumberInput({
  id,
  labelledBy,
  value,
  suffix,
  max,
  readOnly,
  onCommit,
}: {
  id: string;
  labelledBy: string;
  value: number | null;
  suffix?: string;
  max?: number;
  readOnly?: boolean;
  onCommit(n: number): void;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  return (
    <div className="flex max-w-xs items-center rounded-md border border-border bg-card focus-within:ring-2 focus-within:ring-primary">
      <input
        id={id}
        inputMode="decimal"
        aria-labelledby={labelledBy}
        className="min-h-11 w-full bg-transparent px-3 outline-none"
        value={text}
        readOnly={readOnly}
        min={0}
        max={max}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = Number(text.replace(/,/g, ''));
          if (text.trim() === '' || !Number.isFinite(n)) return;
          onCommit(n);
        }}
      />
      {suffix ? (
        <span className="px-3 text-muted" aria-hidden>
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

function DateRangeInput({ id, value, readOnly, onCommit }: { id: string; value: DateRangeValue | undefined; readOnly?: boolean; onCommit(v: DateRangeValue): void }) {
  const [from, setFrom] = useState(value?.from ?? '');
  const [to, setTo] = useState(value?.to ?? '');
  function commit(f: string, t: string) {
    if (f && t) onCommit({ from: f, to: t });
  }
  return (
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">
        <span className="block text-xs text-muted">From</span>
        <input id={`${id}-from`} type="date" className="min-h-11 rounded-md border border-border bg-card px-3" value={from} readOnly={readOnly} onChange={(e) => setFrom(e.target.value)} onBlur={() => commit(from, to)} />
      </label>
      <label className="text-sm">
        <span className="block text-xs text-muted">To</span>
        <input id={`${id}-to`} type="date" className="min-h-11 rounded-md border border-border bg-card px-3" value={to} readOnly={readOnly} onChange={(e) => setTo(e.target.value)} onBlur={() => commit(from, to)} />
      </label>
    </div>
  );
}

export function displayValue(q: Question, v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (q.type === 'money' && typeof v === 'number') return formatCents(v);
  if ((q.type === 'single' || q.type === 'yes_no_unsure') && typeof v === 'string') {
    const opts = q.type === 'yes_no_unsure' ? YES_NO_UNSURE : (q.options ?? []);
    return opts.find((o) => o.value === v)?.label ?? v;
  }
  if (q.type === 'multi' && Array.isArray(v)) return v.map((x) => q.options?.find((o) => o.value === x)?.label ?? String(x)).join(', ');
  if (q.type === 'date_range' && typeof v === 'object' && v && 'from' in v) return `${(v as DateRangeValue).from} to ${(v as DateRangeValue).to}`;
  if (q.type === 'percent') return `${v}%`;
  if (q.type === 'km') return `${v} km`;
  return String(v);
}
