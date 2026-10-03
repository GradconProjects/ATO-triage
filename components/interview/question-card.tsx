'use client';

import { useId, useState } from 'react';
import { questionAnchor } from '@/src/lib/question-links';
import type { AnswerRecord, CaseContext, DateRangeValue, Option, Question } from '@/src/engine/types';
import { formatCents, fyDateBounds, parseMoneyToCents, validateAnswer } from '@/src/engine/validation';
import { cn } from '@/src/lib/utils';
import { questionTip } from '@/src/questions/tips';
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

  // Clearing a box (or unticking every option) removes the answer instead of saving an empty one.
  function clear() {
    if (readOnly || record === undefined || state === 'skipped') return;
    setLocalError([]);
    setWarnings([]);
    onWrite({ questionId: q.id, repeaterItemId: itemId, value: null, state: 'skipped', source: 'user' });
  }

  const errors = [...localError, ...(serverErrors ?? [])];
  const tip = questionTip(q.id, ctx.fy);
  const options = q.type === 'yes_no_unsure' ? YES_NO_UNSURE : (q.options ?? []);

  return (
    <div
      className={cn('rounded-lg border bg-card p-4', errors.length ? 'border-red-300' : isSkipped ? 'border-amber-300' : 'border-border')}
      id={questionAnchor(q.id, itemId)}
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
      {tip ? <p className="mt-1 text-sm italic leading-snug text-slate-500">{tip}</p> : null}
      {showHelp && q.help ? <p className="mt-2 rounded bg-accent p-2 text-sm">{q.help}</p> : null}

      {isImported ? (
        <div role="status" className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
          <p>
            <strong>Imported value:</strong> {displayValue(q, record?.value)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {record?.sourceRef?.kind === 'prior_year'
              ? `From your ${record.sourceRef.fy} case (${record.sourceRef.category === 'opening_balance' ? 'opening balance' : record.sourceRef.category === 'annual_fact' ? 'last year\'s answer: check it still applies' : 'reusable detail'}).`
              : 'Copied from an earlier year or a document.'}{' '}
            Confirm it or enter a new answer. It does not count until you confirm.
          </p>
          {record?.sourceRef?.kind === 'prior_year' && record.sourceRef.note ? <p className="mt-1 text-xs italic text-slate-500">{record.sourceRef.note}</p> : null}
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
            selected={isNotSure ? ['not_sure'] : Array.isArray(value) ? (value as string[]) : typeof value === 'string' ? [value] : []}
            multi
            readOnly={readOnly}
            onChange={(vals) => {
              if (vals.includes('not_sure')) write(['not_sure'], 'not_sure');
              else if (vals.length === 0) clear();
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
            onClear={clear}
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
            onClear={clear}
          />
        ) : null}
        {q.type === 'date' ? (
          <SyncedInput
            id={`${id}-input`}
            type="date"
            labelledBy={`${id}-label`}
            className="min-h-11 w-full max-w-xs rounded-md border border-border bg-card px-3"
            external={typeof value === 'string' ? value : ''}
            readOnly={readOnly}
            onCommit={(v) => (v ? write(v) : clear())}
          />
        ) : null}
        {q.type === 'date_range' ? (
          <DateRangeInput id={id} fy={ctx.fy} value={value as DateRangeValue | undefined} readOnly={readOnly} onCommit={(v) => write(v)} onClear={clear} />
        ) : null}
        {q.type === 'text' ? (
          <SyncedInput
            id={`${id}-input`}
            type="text"
            labelledBy={`${id}-label`}
            className="min-h-11 w-full rounded-md border border-border bg-card px-3"
            external={typeof value === 'string' ? value : ''}
            readOnly={readOnly}
            onCommit={(raw) => {
              const v = raw.trim();
              if (v) write(v);
              else clear();
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
      {isSkipped && q.required ? <p className="mt-2 text-xs text-warning">Skipped. Answer it or mark Not sure.</p> : null}
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

/**
 * Local text for a typed box that follows the saved answer: while you type, your text is kept; when
 * the box is not focused and the saved value changes (a confirmed import, a statement upload, another
 * case), the box shows the saved value. Uses the "adjust state while rendering" pattern.
 */
function useSyncedText(external: string) {
  const [text, setText] = useState(external);
  const [seen, setSeen] = useState(external);
  const [focused, setFocused] = useState(false);
  if (external !== seen && !focused) {
    setSeen(external);
    setText(external);
  }
  return { text, setText, onFocus: () => setFocused(true), onBlurDone: () => setFocused(false) };
}

function SyncedInput({ id, type, labelledBy, className, external, readOnly, onCommit }: { id: string; type: 'text' | 'date'; labelledBy: string; className: string; external: string; readOnly?: boolean; onCommit(v: string): void }) {
  const { text, setText, onFocus, onBlurDone } = useSyncedText(external);
  return (
    <input
      id={id}
      type={type}
      aria-labelledby={labelledBy}
      className={className}
      value={text}
      readOnly={readOnly}
      onFocus={onFocus}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        onBlurDone();
        if (text !== external) onCommit(text);
      }}
    />
  );
}

function MoneyInput({
  id,
  labelledBy,
  cents,
  allowNegative,
  readOnly,
  onCommit,
  onClear,
}: {
  id: string;
  labelledBy: string;
  cents: number | null;
  allowNegative: boolean;
  readOnly?: boolean;
  onCommit(cents: number): void;
  onClear(): void;
}) {
  const { text, setText, onFocus, onBlurDone } = useSyncedText(cents === null ? '' : formatCents(cents).replace('$', ''));
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
        onFocus={onFocus}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          onBlurDone();
          if (text.trim() === '') {
            if (cents !== null) onClear();
            return;
          }
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
  onClear,
}: {
  id: string;
  labelledBy: string;
  value: number | null;
  suffix?: string;
  max?: number;
  readOnly?: boolean;
  onCommit(n: number): void;
  onClear(): void;
}) {
  const { text, setText, onFocus, onBlurDone } = useSyncedText(value === null ? '' : String(value));
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
        onFocus={onFocus}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          onBlurDone();
          if (text.trim() === '') {
            if (value !== null) onClear();
            return;
          }
          const n = Number(text.replace(/,/g, ''));
          if (!Number.isFinite(n)) return;
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

function DateRangeInput({ id, fy, value, readOnly, onCommit, onClear }: { id: string; fy: CaseContext['fy']; value: DateRangeValue | undefined; readOnly?: boolean; onCommit(v: DateRangeValue): void; onClear(): void }) {
  const bounds = fyDateBounds(fy);
  const [from, setFrom] = useState(value?.from ?? '');
  const [to, setTo] = useState(value?.to ?? '');
  // Follow the saved range when it changes from elsewhere (an import, another case).
  const savedKey = `${value?.from ?? ''}|${value?.to ?? ''}`;
  const [seen, setSeen] = useState(savedKey);
  if (savedKey !== seen) {
    setSeen(savedKey);
    setFrom(value?.from ?? '');
    setTo(value?.to ?? '');
  }
  const wholeYear = from === bounds.from && to === bounds.to;
  const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  function commit(f: string, t: string) {
    if (f && t) onCommit({ from: f, to: t });
  }
  function toggleWholeYear(checked: boolean) {
    const f = checked ? bounds.from : '';
    const t = checked ? bounds.to : '';
    setFrom(f);
    setTo(t);
    if (checked) commit(f, t);
    else if (value) onClear();
  }
  const inputCls = 'min-h-11 rounded-md border border-border bg-card px-3 disabled:opacity-60';
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={wholeYear} disabled={readOnly} onChange={(e) => toggleWholeYear(e.target.checked)} />
        The whole tax year ({fmt(bounds.from)} to {fmt(bounds.to)})
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">
          <span className="block text-xs text-muted">From</span>
          <input id={`${id}-from`} type="date" min={bounds.from} max={bounds.to} className={inputCls} value={from} readOnly={readOnly} disabled={wholeYear} onChange={(e) => setFrom(e.target.value)} onBlur={() => commit(from, to)} />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-muted">To</span>
          <input id={`${id}-to`} type="date" min={bounds.from} max={bounds.to} className={inputCls} value={to} readOnly={readOnly} disabled={wholeYear} onChange={(e) => setTo(e.target.value)} onBlur={() => commit(from, to)} />
        </label>
      </div>
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
  if (q.type === 'multi' && typeof v === 'string') return q.options?.find((o) => o.value === v)?.label ?? v;
  if (q.type === 'multi' && Array.isArray(v)) return v.map((x) => q.options?.find((o) => o.value === x)?.label ?? String(x)).join(', ');
  if (q.type === 'date_range' && typeof v === 'object' && v && 'from' in v) return `${(v as DateRangeValue).from} to ${(v as DateRangeValue).to}`;
  if (q.type === 'percent') return `${v}%`;
  if (q.type === 'km') return `${v} km`;
  return String(v);
}
