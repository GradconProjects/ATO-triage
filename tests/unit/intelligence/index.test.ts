import { describe, expect, it } from 'vitest';
import { AnswerView } from '@/src/engine/answers';
import type { VisibleQuestion } from '@/src/engine/visibility';
import { FLAG_RULES, runIntelligence, visibleQuestionsFromKeys } from '@/src/intelligence';
import { dedupeAndSort } from '@/src/intelligence/flags';
import { GATE_CHECKS } from '@/src/intelligence/gate';
import type { Flag } from '@/src/intelligence/types';
import { Q, GROUPS } from '@/src/questions/ids';
import { build, dedLine, estimate, item, notSure, q, rec, salaryLine } from './fixtures';

const EXPECTED_CODES = [
  'ANY_NOT_SURE', 'ALLOWANCE_NO_EXPENSE', 'EXPENSE_REIMBURSED', 'CAR_HOME_TO_WORK', 'DSW_CLIENT_TRAVEL_UNCLAIMED', 'CONSTR_PPE_UNCLAIMED',
  'CHEF_LAUNDRY_UNCLAIMED', 'LICENCE_FIRST', 'LUMP_SUM_E_LSPIA', 'WORKCOVER_CAPITAL_LUMP', 'MLS_EXPOSURE', 'SUPER_NOI_MISSING', 'WFH_NO_RECORD',
  'DEDUCTION_RATIO_HIGH', 'NO_EVIDENCE', 'PRIOR_LOSSES_UNANSWERED',
  'IMPORT_UNCONFIRMED', 'SKIPPED_REQUIRED', 'MANUAL_REVIEW_MODULE', 'NOT_SURE_OCCUPATION_TAGS', 'TEMP_RESIDENT_FOREIGN_CGT', 'DUAL_RESIDENT_TREATY',
  'PART_YEAR_RESIDENT', 'RENTAL_INITIAL_REPAIRS', 'CGT_MAIN_RESIDENCE_PART', 'CRYPTO_METHOD_MISSING', 'ETP_REVIEW', 'SUPER_INCOME_REVIEW', 'PSI_REVIEW',
  'BUSINESS_LOSS_REVIEW', 'LOSS_CARRIED_FORWARD', 'AMENDMENT_DIFFERENCE', 'INCOME_STATEMENT_NOT_TAX_READY', 'WHM_INCOME_MISSING',
  'MEDICARE_EXEMPTION_DAYS_MISSING', 'PHI_TIER_UNKNOWN',
];

describe('FLAG_RULES registry', () => {
  it('contains every required code exactly once with a valid kind and severity', () => {
    const codes = FLAG_RULES.map((r) => r.code);
    for (const c of EXPECTED_CODES) expect(codes, c).toContain(c);
    expect(new Set(codes).size).toBe(codes.length);
    for (const r of FLAG_RULES) {
      expect(['review', 'opportunity', 'consistency', 'missing']).toContain(r.kind);
      expect(['info', 'warning', 'blocker']).toContain(r.severity);
      expect(typeof r.when).toBe('function');
      expect(typeof r.message).toBe('function');
    }
  });
  it('gives an ATO reference to every rule that concerns a tax rule', () => {
    const noRef = FLAG_RULES.filter((r) => !r.atoRef).map((r) => r.code);
    expect(noRef.sort()).toEqual(['ANY_NOT_SURE', 'MANUAL_REVIEW_MODULE', 'SKIPPED_REQUIRED']);
  });
});

describe('dedupeAndSort', () => {
  const f = (code: string, severity: Flag['severity'], kind: Flag['kind'], ids: string[] = []): Flag => ({ code, kind, severity, message: 'm', questionIds: ids });
  it('sorts blocker > warning > info, then review > missing > consistency > opportunity, then code and ids', () => {
    const sorted = dedupeAndSort([
      f('B', 'info', 'opportunity'), f('A', 'info', 'consistency'), f('C', 'warning', 'missing'), f('D', 'warning', 'review'), f('E', 'blocker', 'missing'), f('D', 'warning', 'review', ['b']), f('D', 'warning', 'review', ['a']),
    ]);
    expect(sorted.map((x) => `${x.code}${x.questionIds.join('')}`)).toEqual(['E', 'D', 'Da', 'Db', 'C', 'A', 'B']);
  });
  it('drops flags with the same code and question ids', () => {
    expect(dedupeAndSort([f('A', 'info', 'review', ['x']), f('A', 'info', 'review', ['x']), f('A', 'info', 'review', ['y'])])).toHaveLength(2);
  });
});

describe('runIntelligence', () => {
  const questions = [
    q({ id: Q.emp.repeater, module: 'employment', type: 'repeater', repeater: { groupId: GROUPS.employer, itemLabel: 'Employer', addLabel: 'Add', minItems: 1 } }),
    q({ id: Q.emp.gross, module: 'employment', repeaterGroup: GROUPS.employer, prompt: 'Gross pay?' }),
    q({ id: Q.emp.withheld, module: 'employment', repeaterGroup: GROUPS.employer }),
    q({ id: Q.ded.carAny, module: 'deductions', type: 'yes_no_unsure', prompt: 'Car for work?', help: 'your logbook' }),
    q({ id: Q.gate.checks, module: 'offsets', type: 'multi' }),
    q({ id: Q.supc.personalAmount, module: 'super_contributions' }),
    q({ id: Q.supc.noi, module: 'super_contributions', type: 'single' }),
  ];
  const items = [item('e1', GROUPS.employer)];
  const allChecks = GATE_CHECKS.map((c) => c.value);
  const complete = [
    rec(Q.emp.gross, 6_000_000, { item: 'e1' }), rec(Q.emp.withheld, 1_000_000, { item: 'e1' }), rec(Q.ded.carAny, 'no'),
    rec(Q.gate.checks, allChecks), rec(Q.supc.personalAmount, 0), rec(Q.supc.noi, 'acknowledged'),
  ];

  it('returns a clean, finalisable, high-confidence result for a complete case', () => {
    const { input } = build({ questions, items, records: complete });
    const r = runIntelligence(input, estimate({ lines: [salaryLine(6_000_000)], totals: { taxableIncomeCents: 6_000_000, resultCents: 50_000 } }));
    expect(r.flags).toEqual([]);
    expect(r.completeness.pct).toBe(100);
    expect(r.completeness.incomeModulesPct).toBe(100);
    expect(r.completeness.byModule.find((m) => m.module === 'employment')).toEqual({ module: 'employment', required: 2, answered: 2, pct: 100 });
    expect(r.confidence.level).toBe('high');
    expect(r.range).toBeUndefined();
    expect(r.canFinalise).toBe(true);
    expect(r.finaliseBlockers).toEqual([]);
  });

  it('reports flags in order, blocks finalising and lowers confidence when things are wrong', () => {
    const records = [
      rec(Q.emp.gross, 6_000_000, { item: 'e1', state: 'imported', source: 'document' }), notSure(Q.ded.carAny), rec(Q.gate.checks, ['income_statements']),
      rec(Q.supc.personalAmount, 100_000), rec(Q.supc.noi, 'not_yet'),
    ];
    const { input } = build({ questions, items, records });
    const est = estimate({ lines: [salaryLine(6_000_000), dedLine('car', 900_000)], manualReview: [{ module: 'zone', reason: 'Zone offset needs a check', questionIds: [Q.off.zone] }] });
    const r = runIntelligence(input, est);
    expect(r.flags.map((f) => f.code)).toEqual(['SUPER_NOI_MISSING', 'ANY_NOT_SURE', 'DEDUCTION_RATIO_HIGH', 'MANUAL_REVIEW_MODULE', 'IMPORT_UNCONFIRMED']);
    expect(r.flags[1]!.message).toBe('You answered Not sure to: Car for work?. Check your logbook.');
    expect(r.completeness.incomeModulesPct).toBe(0);
    expect(r.confidence.level).toBe('low');
    expect(r.canFinalise).toBe(false);
    expect(r.finaliseBlockers[0]).toContain('Income modules are 0% complete');
    expect(r.finaliseBlockers.some((b) => b.startsWith('SUPER_NOI_MISSING:'))).toBe(true);
    expect(r.finaliseBlockers.some((b) => b.includes('imported answer'))).toBe(true);
  });

  it('ignores answers to questions that are not visible', () => {
    const { input } = build({ questions, items, records: complete.concat(notSure(Q.res.dual)), visible: new Set([Q.ded.carAny, Q.gate.checks, `${Q.emp.gross}@e1`, `${Q.emp.withheld}@e1`, Q.supc.personalAmount, Q.supc.noi]) });
    const r = runIntelligence(input, estimate());
    expect(r.flags.map((f) => f.code)).toEqual([]);
  });

  it('prefers the caller-supplied visibleQuestions for completeness', () => {
    const { input } = build({ questions, items, records: complete });
    const visibleQuestions: VisibleQuestion[] = [{ question: questions[1]!, itemId: 'e1', key: `${Q.emp.gross}@e1` }, { question: questions[1]!, itemId: 'e2', key: `${Q.emp.gross}@e2` }];
    const r = runIntelligence({ ...input, visibleQuestions }, estimate());
    expect(r.completeness.incomeModulesPct).toBe(50);
    expect(r.completeness.pct).toBe(50);
  });

  it('rebuilds visible questions from keys, skipping unknown ids', () => {
    const { input } = build({ questions, items, records: complete, visible: new Set([`${Q.emp.gross}@e1`, Q.ded.carAny, 'unknown.q']) });
    expect(visibleQuestionsFromKeys(input).map((v) => v.key)).toEqual([Q.ded.carAny, `${Q.emp.gross}@e1`]);
  });

  it('computes the range through recalc and strips visibleQuestions from the calc input', () => {
    const { input } = build({ questions, items, records: complete });
    const est = estimate({ uncertainInputs: [Q.ded.phoneAmount], totals: { resultCents: 100_000 } });
    let received: unknown;
    const r = runIntelligence({ ...input, visibleQuestions: [] }, est, (i) => {
      received = i;
      return estimate({ totals: { resultCents: 60_000 } });
    });
    expect(r.range).toEqual({ lowCents: 60_000, highCents: 100_000, reasons: [`Result may change depending on ${Q.ded.phoneAmount} (uncertain or unsupported amount).`] });
    expect(received).not.toHaveProperty('visibleQuestions');
  });

  it('is deterministic: the same input gives an identical result twice and never mutates the input', () => {
    const records = [...complete.filter((x) => x.questionId !== Q.ded.carAny), notSure(Q.ded.carAny), rec(Q.res.status, 'temporary')];
    const { input } = build({ questions, items, records });
    const est = estimate({ lines: [salaryLine(6_000_000), dedLine('car', 900_000)], uncertainInputs: [Q.ded.carTotalCosts], totals: { resultCents: 1 } });
    const before = JSON.stringify({ visible: [...input.visible], records: input.answers.records(), est });
    const a = runIntelligence(input, est, () => estimate({ totals: { resultCents: 9 } }));
    const b = runIntelligence(input, est, () => estimate({ totals: { resultCents: 9 } }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a).toEqual(b);
    expect(JSON.stringify({ visible: [...input.visible], records: input.answers.records(), est })).toBe(before);
    expect(input.answers).toBeInstanceOf(AnswerView);
  });
});
