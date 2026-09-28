/**
 * The question bank. Pure data: every question is a `Question` object, concatenated in
 * `MODULE_ORDER`. Nothing here writes an answer; `showIf` only decides visibility.
 */
import type { ModuleId, Question } from '../engine/types';
import { MODULE_ORDER } from '../engine/types';
import { BUSINESS_QUESTIONS } from './business';
import { CGT_QUESTIONS } from './cgt';
import { COMPENSATION_QUESTIONS } from './compensation';
import { CORE_QUESTIONS } from './core';
import { DEDUCTION_QUESTIONS } from './deductions';
import { EMPLOYMENT_QUESTIONS } from './employment';
import { FAMILY_QUESTIONS } from './family';
import { FOREIGN_QUESTIONS } from './foreign';
import { GOVERNMENT_QUESTIONS } from './government';
import { INVESTMENT_QUESTIONS } from './investments';
import { CHEF_QUESTIONS } from './occupations/chef-hospitality';
import { CONSTRUCTION_QUESTIONS } from './occupations/construction';
import { DSW_QUESTIONS } from './occupations/disability-support';
import { OFFSET_QUESTIONS } from './offsets';
import { RENTAL_QUESTIONS } from './rental';
import { SUPER_QUESTIONS } from './super';

const ALL: Question[] = [
  ...CORE_QUESTIONS,
  ...FAMILY_QUESTIONS,
  ...EMPLOYMENT_QUESTIONS,
  ...COMPENSATION_QUESTIONS,
  ...GOVERNMENT_QUESTIONS,
  ...INVESTMENT_QUESTIONS,
  ...RENTAL_QUESTIONS,
  ...CGT_QUESTIONS,
  ...FOREIGN_QUESTIONS,
  ...BUSINESS_QUESTIONS,
  ...DSW_QUESTIONS,
  ...CONSTRUCTION_QUESTIONS,
  ...CHEF_QUESTIONS,
  ...DEDUCTION_QUESTIONS,
  ...SUPER_QUESTIONS,
  ...OFFSET_QUESTIONS,
];

const ORDER = new Map<ModuleId, number>(MODULE_ORDER.map((m, i) => [m, i]));

/** Every question, ordered by MODULE_ORDER; file order is kept inside each module (stable sort). */
export const QUESTION_BANK: readonly Question[] = Object.freeze(
  [...ALL].sort((a, b) => (ORDER.get(a.module) ?? 999) - (ORDER.get(b.module) ?? 999)),
);

export const QUESTIONS_BY_ID: ReadonlyMap<string, Question> = new Map(QUESTION_BANK.map((q) => [q.id, q]));

export function questionById(id: string): Question | undefined {
  return QUESTIONS_BY_ID.get(id);
}

export function questionsForModule(module: ModuleId): Question[] {
  return QUESTION_BANK.filter((q) => q.module === module);
}

export { Q, GROUPS, PAID_OPTIONS, EVIDENCE_OPTIONS, GOV_TYPES, FOREIGN_TYPES } from './ids';
