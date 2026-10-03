'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnswerView } from '@/src/engine/answers';
import { activeTagSet, computeProgress, visibleQuestions, repeaterSpecs, itemLabel, type VisibleQuestion } from '@/src/engine';
import { MODULE_LABELS, MODULE_ORDER, type CaseContext, type ModuleId, type Question, type RepeaterItem } from '@/src/engine/types';
import { QUESTION_BANK } from '@/src/questions';
import { useInterviewStore, type PendingWrite } from '@/src/lib/store/interview-store';
import type { ClientCaseState } from '@/src/lib/case-state';
import { QuestionCard } from './question-card';
import { ModuleNav, type ModuleNavEntry } from './module-nav';
import { LiveEstimatePanel, type LiveEstimateSummary } from './live-estimate';
import { StatementUpload } from './statement-upload';
import { Button } from '@/components/ui/button';
import { cn } from '@/src/lib/utils';

const AUTOSAVE_MS = 800;

export function ModulePage({ initial, module }: { initial: ClientCaseState; module: ModuleId }) {
  const router = useRouter();
  const store = useInterviewStore();
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});
  const [estimate, setEstimate] = useState<LiveEstimateSummary | null>(null);
  const [previousEstimate, setPreviousEstimate] = useState<LiveEstimateSummary | null>(null);
  const [estimateState, setEstimateState] = useState<'idle' | 'updating' | 'failed'>('idle');
  const estimateSeq = useRef(0);
  const latestEstimate = useRef<LiveEstimateSummary | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readOnly = initial.status === 'final';

  useEffect(() => {
    store.init(initial.caseId, initial.answers, initial.items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.caseId]);

  const ctx: CaseContext = useMemo(() => ({ fy: initial.fy, profileOccupations: initial.profileOccupations }), [initial.fy, initial.profileOccupations]);
  const view = useMemo(() => new AnswerView(store.answers.values(), store.items), [store.answers, store.items]);
  const activeTags = useMemo(() => activeTagSet(ctx, view, QUESTION_BANK), [ctx, view]);
  const visible = useMemo(() => visibleQuestions(QUESTION_BANK, view, ctx, activeTags), [view, ctx, activeTags]);
  const progress = useMemo(() => computeProgress(visible, view), [visible, view]);
  const specs = useMemo(() => repeaterSpecs(QUESTION_BANK), []);

  const moduleVisible = visible.filter((v) => v.question.module === module);
  const navEntries: ModuleNavEntry[] = MODULE_ORDER.map((m) => {
    const mp = progress.byModule.find((b) => b.module === m);
    const hasVisible = visible.some((v) => v.question.module === m);
    return { module: m, pct: mp?.pct ?? 100, required: mp?.required ?? 0, active: hasVisible || m === 'core' };
  });
  const order = navEntries.filter((e) => e.active).map((e) => e.module);
  const idx = order.indexOf(module);
  const prev = idx > 0 ? order[idx - 1] : undefined;
  const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : undefined;

  // Recalculate after every saved change. Only the newest request may update the panel, and a failed
  // request is retried once before the panel says it could not update.
  const refreshEstimate = useCallback(async () => {
    const seq = ++estimateSeq.current;
    setEstimateState('updating');
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`/api/cases/${initial.caseId}/calculate`, { method: 'POST' });
        if (res.ok) {
          const data = (await res.json()) as { summary: LiveEstimateSummary };
          if (seq !== estimateSeq.current) return;
          setPreviousEstimate(latestEstimate.current);
          latestEstimate.current = data.summary;
          setEstimate(data.summary);
          setEstimateState('idle');
          return;
        }
      } catch {
        /* network error: retry once */
      }
      if (seq !== estimateSeq.current) return;
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (seq === estimateSeq.current) setEstimateState('failed');
  }, [initial.caseId]);

  // ---- autosave ----
  const flush = useCallback(async () => {
    const writes = store.takePending();
    if (writes.length === 0) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      store.restorePending(writes);
      store.setStatus('offline');
      return;
    }
    store.setStatus('saving');
    try {
      const res = await fetch(`/api/cases/${initial.caseId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ writes }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { rejected: { questionId: string; errors: string[] }[]; state: ClientCaseState };
      const errs: Record<string, string[]> = {};
      for (const r of data.rejected) errs[r.questionId] = r.errors;
      setServerErrors(errs);
      store.applyServer(data.state.answers, data.state.items);
      store.setStatus('saved');
      void refreshEstimate();
    } catch {
      store.restorePending(writes);
      store.setStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.caseId]);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  }, [flush]);

  useEffect(() => {
    const onOnline = () => void flush();
    window.addEventListener('online', onOnline);
    if (store.pending.size) scheduleFlush();
    return () => window.removeEventListener('online', onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    // Initial estimate for the live panel, fetched after mount.
    const t = setTimeout(() => void refreshEstimate(), 0);
    return () => clearTimeout(t);
  }, [refreshEstimate]);

  function onWrite(w: PendingWrite) {
    store.setAnswer(w);
    scheduleFlush();
  }

  async function addItem(groupId: string) {
    await flush();
    const res = await fetch(`/api/cases/${initial.caseId}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupId }) });
    if (!res.ok) return;
    const data = (await res.json()) as { state: ClientCaseState };
    store.applyServer(data.state.answers, data.state.items);
    void refreshEstimate();
  }

  async function removeItem(itemId: string) {
    if (!window.confirm('Remove this item and its answers?')) return;
    await flush();
    const res = await fetch(`/api/cases/${initial.caseId}/items`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId }) });
    if (!res.ok) return;
    const data = (await res.json()) as { state: ClientCaseState };
    store.applyServer(data.state.answers, data.state.items);
    void refreshEstimate();
  }

  async function goNext() {
    // Required visible questions without any answer are recorded as skipped so the report shows them.
    const skipped = moduleVisible
      .filter((v) => v.question.required && v.question.type !== 'repeater' && !store.answers.has(v.key))
      .map<PendingWrite>((v) => ({ questionId: v.question.id, repeaterItemId: v.itemId, value: null, state: 'skipped', source: 'user' }));
    if (!readOnly) skipped.forEach((w) => store.setAnswer(w));
    if (flushTimer.current) clearTimeout(flushTimer.current);
    await flush();
    router.push(next ? `/cases/${initial.caseId}/interview/${next}` : `/cases/${initial.caseId}/review`);
  }

  // Group the module's visible questions: top-level first, then repeater children under their item.
  const topLevel = moduleVisible.filter((v) => !v.question.repeaterGroup);
  const childrenByItem = new Map<string, VisibleQuestion[]>();
  for (const v of moduleVisible) {
    if (v.question.repeaterGroup && v.itemId) {
      const list = childrenByItem.get(v.itemId) ?? [];
      list.push(v);
      childrenByItem.set(v.itemId, list);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr_260px]">
      <div>
        <ModuleNav caseId={initial.caseId} entries={navEntries} current={module} />
      </div>
      <div className="pb-28 lg:pb-0">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{MODULE_LABELS[module]}</h1>
          <SaveIndicator status={store.saveStatus} />
        </div>
        <p className="mt-1 text-sm text-muted">
          {initial.profileName} · {initial.fy}
          {readOnly ? ' · Final (read-only)' : ''}
        </p>
        <div className="mt-4 space-y-4">
          {module === 'employment' && !readOnly ? (
            <StatementUpload
              caseId={initial.caseId}
              onApplied={async (state) => {
                await flush();
                store.applyServer(state.answers, state.items);
                void refreshEstimate();
              }}
            />
          ) : null}
          {topLevel.length === 0 ? <p className="text-sm text-muted">Nothing to answer in this section for this profile.</p> : null}
          {topLevel.map((v) => {
            const q = v.question;
            if (q.type === 'repeater' && q.repeater) {
              const spec = q.repeater;
              const items = store.items.filter((i) => i.groupId === spec.groupId);
              return (
                <section key={v.key} className="rounded-lg border border-border bg-card p-4" aria-labelledby={`rep-${q.id}`}>
                  <h2 id={`rep-${q.id}`} className="text-base font-medium">
                    {q.prompt}
                  </h2>
                  {q.help ? <p className="mt-1 text-sm text-muted">{q.help}</p> : null}
                  <div className="mt-3 space-y-4">
                    {items.map((item, i) => (
                      <RepeaterItemCard
                        key={item.id}
                        label={itemLabel(spec, view, item) || `${spec.itemLabel} ${i + 1}`}
                        item={item}
                        questions={childrenByItem.get(item.id) ?? []}
                        view={view}
                        ctx={ctx}
                        readOnly={readOnly}
                        serverErrors={serverErrors}
                        onWrite={onWrite}
                        onRemove={() => removeItem(item.id)}
                      />
                    ))}
                    {items.length < spec.minItems ? <p className="text-sm text-warning">Add at least {spec.minItems}.</p> : null}
                  </div>
                  {!readOnly ? (
                    <Button variant="secondary" className="mt-3" onClick={() => addItem(spec.groupId)}>
                      {spec.addLabel}
                    </Button>
                  ) : null}
                </section>
              );
            }
            return (
              <QuestionCard key={v.key} question={q} itemId={null} record={store.answers.get(v.key)} ctx={ctx} readOnly={readOnly} onWrite={onWrite} serverErrors={serverErrors[q.id]} />
            );
          })}
        </div>
        <div className="mt-6 flex items-center justify-between">
          <Button variant="secondary" disabled={!prev} onClick={() => prev && router.push(`/cases/${initial.caseId}/interview/${prev}`)}>
            Back
          </Button>
          <Button onClick={goNext}>{next ? 'Next' : 'Go to review'}</Button>
        </div>
      </div>
      <div className="hidden lg:block">
        <LiveEstimatePanel caseId={initial.caseId} summary={estimate} previous={previousEstimate} updating={estimateState === 'updating'} failed={estimateState === 'failed'} loading={estimate === null} />
        <p className="mt-3 text-xs text-muted">{progress.overall}% of visible required questions answered.</p>
      </div>
      <div className="lg:hidden">
        <LiveEstimatePanel caseId={initial.caseId} summary={estimate} previous={previousEstimate} updating={estimateState === 'updating'} failed={estimateState === 'failed'} loading={estimate === null} />
      </div>
      {specs.length === 0 ? null : null}
    </div>
  );
}

function RepeaterItemCard({
  label,
  item,
  questions,
  view,
  ctx,
  readOnly,
  serverErrors,
  onWrite,
  onRemove,
}: {
  label: string;
  item: RepeaterItem;
  questions: VisibleQuestion[];
  view: AnswerView;
  ctx: CaseContext;
  readOnly: boolean;
  serverErrors: Record<string, string[]>;
  onWrite(w: PendingWrite): void;
  onRemove(): void;
}) {
  const [open, setOpen] = useState(true);
  const answered = questions.filter((q) => view.state(q.question.id, item.id) === 'answered').length;
  return (
    <div className={cn('rounded-md border border-border', open ? 'bg-slate-50' : 'bg-card')}>
      <div className="flex items-center justify-between p-3">
        <button type="button" className="text-left text-sm font-medium" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {label} <span className="ml-2 text-xs font-normal text-muted">{answered}/{questions.length} answered</span>
        </button>
        {!readOnly ? (
          <button type="button" className="text-xs text-danger underline-offset-2 hover:underline" onClick={onRemove}>
            Remove
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="space-y-3 p-3 pt-0">
          {questions.map((v) => (
            <QuestionCard
              key={v.key}
              question={v.question as Question}
              itemId={item.id}
              record={view.get(v.question.id, item.id)}
              ctx={ctx}
              readOnly={readOnly}
              onWrite={onWrite}
              serverErrors={serverErrors[v.question.id]}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SaveIndicator({ status }: { status: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    saved: { text: 'Saved', cls: 'text-success' },
    saving: { text: 'Saving…', cls: 'text-muted' },
    offline: { text: 'Offline — will sync', cls: 'text-warning' },
    error: { text: 'Save failed — retrying', cls: 'text-danger' },
    idle: { text: '', cls: '' },
  };
  const s = map[status] ?? map.idle!;
  return (
    <span role="status" aria-live="polite" className={cn('text-xs', s.cls)}>
      {s.text}
    </span>
  );
}
