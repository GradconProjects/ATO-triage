'use client';

import { create } from 'zustand';
import type { AnswerRecord, AnswerSource, AnswerState, RepeaterItem } from '@/src/engine/types';
import { answerKey } from '@/src/engine/answers';

export type SaveStatus = 'saved' | 'saving' | 'offline' | 'error' | 'idle';

export interface PendingWrite {
  questionId: string;
  repeaterItemId: string | null;
  value: unknown;
  state: AnswerState;
  source: AnswerSource;
}

interface InterviewStore {
  caseId: string | null;
  answers: Map<string, AnswerRecord>;
  items: RepeaterItem[];
  pending: Map<string, PendingWrite>;
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  init(caseId: string, answers: AnswerRecord[], items: RepeaterItem[]): void;
  setAnswer(write: PendingWrite): void;
  applyServer(answers: AnswerRecord[], items: RepeaterItem[]): void;
  setItems(items: RepeaterItem[]): void;
  setStatus(s: SaveStatus): void;
  takePending(): PendingWrite[];
  restorePending(writes: PendingWrite[]): void;
}

const QUEUE_KEY = (caseId: string) => `tia:queue:${caseId}`;

function persistQueue(caseId: string | null, pending: Map<string, PendingWrite>) {
  if (!caseId || typeof window === 'undefined') return;
  try {
    if (pending.size === 0) window.localStorage.removeItem(QUEUE_KEY(caseId));
    else window.localStorage.setItem(QUEUE_KEY(caseId), JSON.stringify([...pending.values()]));
  } catch {
    /* storage unavailable */
  }
}

export function readPersistedQueue(caseId: string): PendingWrite[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY(caseId));
    return raw ? (JSON.parse(raw) as PendingWrite[]) : [];
  } catch {
    return [];
  }
}

export const useInterviewStore = create<InterviewStore>((set, get) => ({
  caseId: null,
  answers: new Map(),
  items: [],
  pending: new Map(),
  saveStatus: 'idle',
  lastSavedAt: null,
  init(caseId, answers, items) {
    const map = new Map<string, AnswerRecord>();
    for (const a of answers) map.set(answerKey(a.questionId, a.repeaterItemId), a);
    const queued = readPersistedQueue(caseId);
    const pending = new Map<string, PendingWrite>();
    for (const w of queued) {
      const key = answerKey(w.questionId, w.repeaterItemId);
      pending.set(key, w);
      const prev = map.get(key);
      map.set(key, { ...w, version: (prev?.version ?? 0) + 1 });
    }
    set({ caseId, answers: map, items, pending, saveStatus: pending.size ? 'offline' : 'saved' });
  },
  setAnswer(write) {
    const { answers, pending, caseId } = get();
    const key = answerKey(write.questionId, write.repeaterItemId);
    const prev = answers.get(key);
    const next = new Map(answers);
    next.set(key, { ...write, version: (prev?.version ?? 0) + 1 });
    const p = new Map(pending);
    p.set(key, write);
    persistQueue(caseId, p);
    set({ answers: next, pending: p });
  },
  applyServer(serverAnswers, items) {
    const { answers, pending } = get();
    const next = new Map(answers);
    for (const a of serverAnswers) {
      const key = answerKey(a.questionId, a.repeaterItemId);
      // A newer local edit still pending wins over the server echo.
      if (pending.has(key)) continue;
      const prev = next.get(key);
      if (!prev || a.version >= prev.version) next.set(key, a);
    }
    set({ answers: next, items, saveStatus: pending.size ? get().saveStatus : 'saved', lastSavedAt: Date.now() });
  },
  setItems(items) {
    set({ items });
  },
  setStatus(saveStatus) {
    set({ saveStatus });
  },
  takePending() {
    const { pending, caseId } = get();
    const writes = [...pending.values()];
    set({ pending: new Map() });
    persistQueue(caseId, new Map());
    return writes;
  },
  restorePending(writes) {
    const { pending, caseId } = get();
    const p = new Map(pending);
    for (const w of writes) {
      const key = answerKey(w.questionId, w.repeaterItemId);
      if (!p.has(key)) p.set(key, w);
    }
    persistQueue(caseId, p);
    set({ pending: p });
  },
}));
