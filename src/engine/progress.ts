/**
 * Progress (Section 4 "Progress", Section 9 "Completeness score").
 * Recomputed from the visible set on every save; only state `answered` counts.
 */
import type { AnswerView } from './answers';
import type { VisibleQuestion } from './visibility';
import type { ModuleId } from './types';
import { INCOME_MODULES, MODULE_ORDER, MODULE_WEIGHTS } from './types';

export interface ModuleProgress {
  module: ModuleId;
  required: number;
  answered: number;
  pct: number;
}

export interface Progress {
  overall: number;
  byModule: ModuleProgress[];
  weightedPct: number;
  incomeModulesPct: number;
}

function pctOf(answered: number, required: number): number {
  if (required <= 0) return 100;
  return Math.floor((answered / required) * 100);
}

export function computeProgress(visible: VisibleQuestion[], answers: AnswerView): Progress {
  const tally = new Map<ModuleId, { required: number; answered: number }>();
  for (const m of MODULE_ORDER) tally.set(m, { required: 0, answered: 0 });

  for (const v of visible) {
    const q = v.question;
    if (!q.required || q.type === 'repeater') continue;
    const t = tally.get(q.module) ?? { required: 0, answered: 0 };
    t.required += 1;
    if (answers.state(q.id, v.itemId) === 'answered') t.answered += 1;
    tally.set(q.module, t);
  }

  const byModule: ModuleProgress[] = [];
  let totalRequired = 0;
  let totalAnswered = 0;
  let weightedRequired = 0;
  let weightedAnswered = 0;
  let incomeRequired = 0;
  let incomeAnswered = 0;

  for (const [module, t] of tally) {
    byModule.push({ module, required: t.required, answered: t.answered, pct: pctOf(t.answered, t.required) });
    totalRequired += t.required;
    totalAnswered += t.answered;
    const w = MODULE_WEIGHTS[module] ?? 1;
    weightedRequired += w * t.required;
    weightedAnswered += w * t.answered;
    if (INCOME_MODULES.includes(module)) {
      incomeRequired += t.required;
      incomeAnswered += t.answered;
    }
  }

  return {
    overall: pctOf(totalAnswered, totalRequired),
    byModule,
    weightedPct: pctOf(weightedAnswered, weightedRequired),
    incomeModulesPct: pctOf(incomeAnswered, incomeRequired),
  };
}
