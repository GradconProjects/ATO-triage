/**
 * Range estimate (Section 9): recompute with every uncertain amount excluded and show the
 * result as a range. Pure: the caller supplies `recalc` (normally `calculate`).
 */
import type { CalcInput, Estimate } from '../calc/types';
import type { Question } from '../engine/types';
import type { RangeEstimate } from './types';

function labelFor(key: string, questions: readonly Question[]): string {
  const [id] = key.split('@');
  const q = questions.find((x) => x.id === id);
  return q ? `"${q.prompt}"` : key;
}

export function rangeEstimate(input: CalcInput, estimate: Estimate, recalc?: (input: CalcInput) => Estimate): RangeEstimate | undefined {
  const uncertain = [...new Set(estimate.uncertainInputs ?? [])].sort();
  if (uncertain.length === 0 || !recalc) return estimate.range ? { ...estimate.range, reasons: [...estimate.range.reasons] } : undefined;

  const exclude = new Set<string>(input.excludeInputs ?? []);
  for (const k of uncertain) exclude.add(k);
  const without = recalc({ ...input, excludeInputs: exclude });

  const a = estimate.totals.resultCents;
  const b = without.totals.resultCents;
  if (a === b) return undefined;
  const reasons = uncertain.map((k) => `Result may change depending on ${labelFor(k, input.questions)} (uncertain or unsupported amount).`);
  return { lowCents: Math.min(a, b), highCents: Math.max(a, b), reasons };
}
