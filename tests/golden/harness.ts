import type { AnswerRecord, AnswerState, CaseContext, FY, Question, RepeaterItem } from '@/src/engine/types';
import { AnswerView, answerKey, activeTagSet, visibleKeySet, visibleQuestions } from '@/src/engine';
import { QUESTION_BANK } from '@/src/questions';
import { getRuleSet, RULE_SETS } from '@/src/rules';
import type { RuleSet } from '@/src/rules/schema';
import { calculate } from '@/src/calc';
import type { CalcInput, Estimate, EstimateLine } from '@/src/calc/types';

export interface A {
  id: string;
  value: unknown;
  item?: string | null;
  state?: AnswerState;
}
export const a = (id: string, value: unknown, item?: string | null): A => ({ id, value, item: item ?? null });
export const item = (id: string, groupId: string, sortOrder = 0): RepeaterItem => ({ id, groupId, sortOrder });
export const c = (dollars: number): number => Math.round(dollars * 100);

export interface GoldenCase {
  fy: FY;
  answers: A[];
  items?: RepeaterItem[];
  profileOccupations?: string[];
}

export interface GoldenRun {
  input: CalcInput;
  estimate: Estimate;
  rules: RuleSet;
  /** Answered keys the engine did NOT make visible (should be empty unless a test hides something on purpose). */
  hiddenAnswered: string[];
}

/** Build the CalcInput exactly as the app would: real bank, real visibility, real rule set. */
export function runGolden(g: GoldenCase): GoldenRun {
  const records: AnswerRecord[] = g.answers.map((x, i) => ({
    questionId: x.id,
    repeaterItemId: x.item ?? null,
    value: x.value,
    state: x.state ?? 'answered',
    source: 'user',
    version: i + 1,
  }));
  const answers = new AnswerView(records, g.items ?? []);
  const ctx: CaseContext = { fy: g.fy, profileOccupations: g.profileOccupations ?? [] };
  const questions = [...QUESTION_BANK] as Question[];
  const activeTags = activeTagSet(ctx, answers, questions);
  const visible = visibleKeySet(visibleQuestions(questions, answers, ctx, activeTags));
  const rules = getRuleSet(g.fy);
  const input: CalcInput = {
    answers,
    rules,
    questions,
    ctx,
    activeTags,
    visible,
    rulesFor: (fy) => (RULE_SETS as Record<string, RuleSet | undefined>)[fy],
  };
  const hiddenAnswered = records.map((r) => answerKey(r.questionId, r.repeaterItemId)).filter((k) => !visible.has(k));
  return { input, estimate: calculate(input), rules, hiddenAnswered };
}

export function lineById(est: Estimate, id: string): EstimateLine {
  const l = est.lines.find((x) => x.id === id);
  if (!l) throw new Error(`No line ${id}; have ${est.lines.map((x) => x.id).join(', ')}`);
  return l;
}

export function maybeLine(est: Estimate, id: string): EstimateLine | undefined {
  return est.lines.find((x) => x.id === id);
}
