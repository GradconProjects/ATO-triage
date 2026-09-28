import { describe, expect, it } from 'vitest';
import type { Question } from '@/src/engine/types';
import { NOT_SURE_ALLOWLIST, lintQuestionBank } from '@/src/engine/lint';
import { q, yesNo } from './fixtures';

const opts = (...values: string[]) => values.map((value) => ({ value, label: value.replace(/_/g, ' ') }));

const cleanBank: Question[] = [
  q({ id: 'core.fy', module: 'core', type: 'single', options: opts('2024-25', '2025-26') }),
  q({ id: 'res.status', module: 'residency', type: 'single', options: [...opts('resident', 'foreign'), ...opts('not_sure')] }),
  q({ id: 'res.arrival_date', module: 'residency', type: 'date', showIf: { q: 'res.status', eq: 'foreign' } }),
  q({ id: 'emp.employer', module: 'employment', type: 'repeater', repeater: { groupId: 'employer', itemLabel: 'Employer', addLabel: 'Add', minItems: 1 } }),
  q({ id: 'emp.employer.gross', module: 'employment', repeaterGroup: 'employer' }),
  q({
    id: 'emp.other_pay',
    module: 'employment',
    type: 'multi',
    screening: true,
    options: [...opts('cash', 'tips'), { value: 'none', label: 'None', exclusive: true }, ...opts('other'), { value: 'not_sure', label: 'Not sure', exclusive: true }],
  }),
  q({ id: 'emp.other_pay.other_text', module: 'employment', type: 'text', showIf: { q: 'emp.other_pay', includes: 'other' } }),
  q({ id: 'ded.car.any', module: 'deductions', type: 'yes_no_unsure' }),
  q({ id: 'ded.car.any2', module: 'deductions', type: 'yes_no_unsure', options: yesNo }),
  q({
    id: 'ded.tool.cost',
    module: 'deductions',
    type: 'money',
    atoRef: 'https://www.ato.gov.au/tools',
    deduction: { category: 'tools', base: 'ded.tool', treatment: 'D', capitalThreshold: true },
  }),
  q({ id: 'inv.div.tfn_withheld', module: 'investments', type: 'money' }),
];

function expectRule(bank: Question[], rule: number, id?: string): string[] {
  const problems = lintQuestionBank(bank).filter((p) => p.startsWith(`rule ${rule} `));
  expect(problems.length, `expected a rule ${rule} problem, got: ${JSON.stringify(lintQuestionBank(bank))}`).toBeGreaterThan(0);
  if (id) expect(problems.some((p) => p.includes(`[${id}]`))).toBe(true);
  return problems;
}

function expectNoRule(bank: Question[], rule: number): void {
  const problems = lintQuestionBank(bank).filter((p) => p.startsWith(`rule ${rule} `));
  expect(problems).toEqual([]);
}

describe('lintQuestionBank', () => {
  it('returns [] for a clean bank', () => {
    expect(lintQuestionBank(cleanBank)).toEqual([]);
  });

  it('exports the not_sure allow-list with the tax year picker on it', () => {
    expect(NOT_SURE_ALLOWLIST).toContain('core.fy');
    expect(NOT_SURE_ALLOWLIST).toContain('gate.checks');
  });

  it('rule 1: yes_no_unsure options are absent or exactly yes/no/not_sure', () => {
    expectRule([q({ id: 'a.b', type: 'yes_no_unsure', options: opts('yes', 'no') })], 1, 'a.b');
    expectRule([q({ id: 'a.b', type: 'yes_no_unsure', options: opts('yes', 'no', 'maybe') })], 1);
    expectNoRule([q({ id: 'a.b', type: 'yes_no_unsure' })], 1);
    expectNoRule([q({ id: 'a.b', type: 'yes_no_unsure', options: opts('not_sure', 'no', 'yes') })], 1);
  });

  it('rule 2: single/multi need a not_sure option unless allow-listed', () => {
    expectRule([q({ id: 'a.b', type: 'single', options: opts('x', 'y') })], 2, 'a.b');
    expectRule([q({ id: 'a.b', type: 'multi', options: opts('x', 'y') })], 2);
    expectNoRule([q({ id: 'a.b', type: 'single', options: opts('x', 'not_sure') })], 2);
    expectNoRule([q({ id: 'core.purpose', type: 'single', options: opts('x', 'y') })], 2);
    expectNoRule([q({ id: 'gate.checks', type: 'multi', options: opts('x', 'y') })], 2);
  });

  it('rule 3: screening multi needs exclusive none, other, and an other text follow-up', () => {
    const base = (over: Partial<Question> = {}): Question =>
      q({ id: 'a.b', type: 'multi', screening: true, options: [...opts('x'), { value: 'none', label: 'None', exclusive: true }, ...opts('other', 'not_sure')], ...over });
    const followUp = q({ id: 'a.b.other_text', type: 'text', showIf: { q: 'a.b', includes: 'other' } });
    const followUpAlt = q({ id: 'a.b_other', type: 'text', showIf: { all: [{ q: 'a.b', includes: 'other' }] } });

    expectNoRule([base(), followUp], 3);
    expectNoRule([base(), followUpAlt], 3);
    // missing follow-up
    expect(expectRule([base()], 3, 'a.b')[0]).toMatch(/follow-up/);
    // follow-up without the right showIf
    expectRule([base(), q({ id: 'a.b.other_text', type: 'text' })], 3);
    expectRule([base(), q({ id: 'a.b.other_text', type: 'text', showIf: { q: 'a.b', includes: 'x' } })], 3);
    // follow-up of the wrong type
    expectRule([base(), q({ id: 'a.b.other_text', type: 'money', showIf: { q: 'a.b', includes: 'other' } })], 3);
    // none not exclusive
    expectRule([base({ options: [...opts('x', 'none', 'other', 'not_sure')] }), followUp], 3);
    // no none
    expectRule([base({ options: [...opts('x', 'other', 'not_sure')] }), followUp], 3);
    // no other
    expectRule([base({ options: [...opts('x'), { value: 'none', label: 'None', exclusive: true }, ...opts('not_sure')] }), followUp], 3);
    // a non-screening multi is not held to rule 3
    expectNoRule([q({ id: 'a.b', type: 'multi', options: opts('x', 'not_sure') })], 3);
  });

  it('rule 4: option labels describe facts, not outcomes', () => {
    const bad = (label: string) => [q({ id: 'a.b', type: 'single', options: [{ value: 'x', label }, ...opts('not_sure')] })];
    expectRule(bad('I can claim car expenses'), 4, 'a.b');
    expectRule(bad('Then you can claim it'), 4);
    expectRule(bad('This is deductible'), 4);
    expectRule(bad('This is not deductible'), 4);
    expectNoRule(bad('I carried bulky tools the employer required and there was no secure storage at the site'), 4);
  });

  it('rule 5: prompt must not contain and/or', () => {
    expectRule([q({ id: 'a.b', prompt: 'Did you buy tools and/or equipment?' })], 5, 'a.b');
    expectNoRule([q({ id: 'a.b', prompt: 'Did you buy tools or equipment?' })], 5);
  });

  it('rule 6: ids are unique', () => {
    expectRule([q({ id: 'a.b' }), q({ id: 'a.b' })], 6, 'a.b');
    expectNoRule([q({ id: 'a.b' }), q({ id: 'a.c' })], 6);
  });

  it('rule 7: every showIf reference (nested) points at an existing question', () => {
    expectRule([q({ id: 'a.b', showIf: { q: 'a.missing', eq: 'x' } })], 7, 'a.b');
    expectRule([q({ id: 'a.b', showIf: { all: [{ occupation: 'dsw' }, { not: { any: [{ q: 'a.missing', answered: true }] } }] } })], 7);
    expectNoRule([q({ id: 'a.b', showIf: { all: [{ occupation: 'dsw' }, { q: 'a.c', gt: 1 }] } }), q({ id: 'a.c', type: 'number' })], 7);
    // a later question may be referenced
    expectNoRule([q({ id: 'a.b', showIf: { q: 'a.c', eq: 'x' } }), q({ id: 'a.c', type: 'text' })], 7);
  });

  it('rule 8: no defaults', () => {
    const withDefault = { ...q({ id: 'a.b' }), defaultValue: 0 } as unknown as Question;
    const withDefault2 = { ...q({ id: 'a.b' }), default: 'x' } as unknown as Question;
    expectRule([withDefault], 8, 'a.b');
    expectRule([withDefault2], 8);
    expectNoRule([q({ id: 'a.b' })], 8);
  });

  it('rule 9: no sensitive identifiers in ids', () => {
    expectRule([q({ id: 'core.tfn' })], 9, 'core.tfn');
    expectRule([q({ id: 'core.tfn_number' })], 9);
    expectRule([q({ id: 'core.my_dob' })], 9);
    expectRule([q({ id: 'core.dob' })], 9);
    expectRule([q({ id: 'core.bsb' })], 9);
    expectRule([q({ id: 'core.bank_account' })], 9);
    expectRule([q({ id: 'core.date_of_birth' })], 9);
    // an amount withheld because no TFN was quoted is not the identifier
    expectNoRule([q({ id: 'inv.div.tfn_withheld' })], 9);
    expectNoRule([q({ id: 'ded.dobbin.amount' })], 9);
  });

  it('rule 10: single/multi need at least two options', () => {
    expectRule([q({ id: 'a.b', type: 'single', options: opts('not_sure') })], 10, 'a.b');
    expectRule([q({ id: 'a.b', type: 'multi' })], 10);
    expectNoRule([q({ id: 'a.b', type: 'single', options: opts('x', 'not_sure') })], 10);
  });

  it('rule 11: repeaterGroup references a declared repeater', () => {
    expectRule([q({ id: 'a.b', repeaterGroup: 'ghost' })], 11, 'a.b');
    expectNoRule([q({ id: 'a.r', type: 'repeater', repeater: { groupId: 'g', itemLabel: 'G', addLabel: 'Add', minItems: 0 } }), q({ id: 'a.b', repeaterGroup: 'g' })], 11);
  });

  it('rule 12: deduction meta only on money questions whose id starts with base', () => {
    const ded = { category: 'tools', base: 'ded.tool', treatment: 'D' } as const;
    expectRule([q({ id: 'ded.tool.cost', type: 'number', atoRef: 'x', deduction: ded })], 12, 'ded.tool.cost');
    expectRule([q({ id: 'ded.other.cost', type: 'money', atoRef: 'x', deduction: ded })], 12);
    expectNoRule([q({ id: 'ded.tool.cost', type: 'money', atoRef: 'x', deduction: ded })], 12);
  });

  it('rule 13: deduction questions carry an atoRef', () => {
    const ded = { category: 'tools', base: 'ded.tool', treatment: 'D' } as const;
    expectRule([q({ id: 'ded.tool.cost', type: 'money', deduction: ded })], 13, 'ded.tool.cost');
    expectNoRule([q({ id: 'ded.tool.cost', type: 'money', atoRef: 'https://ato.gov.au', deduction: ded })], 13);
  });

  it('rule 14: exclusive options on a single question are flagged', () => {
    expectRule([q({ id: 'a.b', type: 'single', options: [{ value: 'x', label: 'X', exclusive: true }, ...opts('not_sure')] })], 14, 'a.b');
    expectNoRule([q({ id: 'a.b', type: 'multi', options: [{ value: 'x', label: 'X', exclusive: true }, ...opts('not_sure')] })], 14);
  });

  it('rule 15: ids look like module.topic.item', () => {
    expectRule([q({ id: 'nodots' })], 15, 'nodots');
    expectRule([q({ id: 'Bad.Case' })], 15);
    expectRule([q({ id: 'a.b-c' })], 15);
    expectRule([q({ id: 'a..b' })], 15);
    expectNoRule([q({ id: 'dsw.travel.client_to_client' })], 15);
    expectNoRule([q({ id: 'gov.ppl.amount2' })], 15);
  });
});
