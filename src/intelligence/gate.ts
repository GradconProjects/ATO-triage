/**
 * Completeness gate (Section 6 M16): what stops a report being marked Final.
 */
import type { AnswerView } from '../engine/answers';
import type { Question } from '../engine/types';
import { Q } from '../questions/ids';
import type { Flag } from './types';

export const GATE_CHECKS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'income_statements', label: 'income statements checked' },
  { value: 'prefill', label: 'ATO pre-fill reviewed' },
  { value: 'statements', label: 'bank and investment statements reviewed' },
  { value: 'evidence', label: 'deduction evidence held' },
  { value: 'prior_losses', label: 'prior-year losses entered' },
  { value: 'not_sure_reviewed', label: 'every Not sure answer reviewed' },
] as const;

export interface FinaliseCheckInput {
  /** Visible-only answer view. */
  answers: AnswerView;
  questions: Question[];
  flags: Flag[];
  incomeModulesPct: number;
}

export interface FinaliseCheck {
  canFinalise: boolean;
  blockers: string[];
}

export function finaliseCheck(input: FinaliseCheckInput): FinaliseCheck {
  const blockers: string[] = [];
  const { answers, questions, flags, incomeModulesPct } = input;

  if (incomeModulesPct < 100) blockers.push(`Income modules are ${incomeModulesPct}% complete; every income question must be answered.`);

  for (const f of flags.filter((x) => x.severity === 'blocker')) blockers.push(`${f.code}: ${f.message}`);

  const ticked = answers.list(Q.gate.checks) ?? [];
  for (const c of GATE_CHECKS) {
    if (!ticked.includes(c.value)) blockers.push(`Completeness check not ticked: ${c.label}.`);
  }

  const required = (id: string) => questions.find((q) => q.id === id)?.required ?? true;
  const skipped = answers.records().filter((r) => r.state === 'skipped' && required(r.questionId)).length;
  if (skipped > 0) blockers.push(`${skipped} required question${skipped === 1 ? ' was' : 's were'} skipped.`);

  const imported = answers.records().filter((r) => r.state === 'imported').length;
  if (imported > 0) blockers.push(`${imported} imported answer${imported === 1 ? ' has' : 's have'} not been confirmed.`);

  return { canFinalise: blockers.length === 0, blockers };
}
