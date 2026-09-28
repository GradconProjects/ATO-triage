import type { Treatment, TreatmentByAnswer } from '../engine/types';
import type { CalcContext } from './context';

export interface ResolvedTreatment {
  treatment: Treatment;
  /** The driving question id when resolved through byQuestion. */
  via?: string;
  /** The driving answer value(s) as text. */
  value?: string;
  /** True when the driving question had no usable answer (fallback used). */
  fallback?: boolean;
}

export function isByQuestion(t: Treatment | TreatmentByAnswer | undefined): t is TreatmentByAnswer {
  return typeof t === 'object' && t !== null && 'byQuestion' in t;
}

/**
 * Resolve a treatment that may depend on another answer. The driving question is looked up in the
 * same repeater item first, then at case level. A multi answer maps every ticked value; when they
 * agree that treatment is used, when they disagree the result is 'R'. No usable answer -> fallback (default 'R').
 */
export function resolveTreatment(cx: CalcContext, t: Treatment | TreatmentByAnswer | undefined, itemId: string | null, defaultTreatment: Treatment): ResolvedTreatment {
  if (t === undefined) return { treatment: defaultTreatment };
  if (!isByQuestion(t)) return { treatment: t };
  const fallback = t.fallback ?? 'R';
  const raw = cx.scopedValue(t.byQuestion, itemId);
  if (typeof raw === 'string') {
    const mapped = t.map[raw];
    if (mapped) return { treatment: mapped, via: t.byQuestion, value: raw };
    return { treatment: fallback, via: t.byQuestion, value: raw, fallback: true };
  }
  if (Array.isArray(raw)) {
    const values = raw.filter((v): v is string => typeof v === 'string');
    const mapped = values.map((v) => t.map[v]).filter((m): m is Treatment => m !== undefined);
    if (mapped.length === 0) return { treatment: fallback, via: t.byQuestion, value: values.join(','), fallback: true };
    const unique = new Set(mapped);
    if (unique.size === 1) return { treatment: mapped[0]!, via: t.byQuestion, value: values.join(',') };
    // Disagreement: a deductible item beats non-deductible only when no manual-review value is present.
    if (unique.has('R')) return { treatment: 'R', via: t.byQuestion, value: values.join(',') };
    if (unique.has('D') && unique.has('N')) return { treatment: 'R', via: t.byQuestion, value: values.join(',') };
    return { treatment: mapped[0]!, via: t.byQuestion, value: values.join(',') };
  }
  return { treatment: fallback, via: t.byQuestion, fallback: true };
}
