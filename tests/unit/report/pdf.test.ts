// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import type { Estimate } from '@/src/calc/types';
import type { AnswerRecord, Question, RepeaterItem } from '@/src/engine/types';
import { AnswerView } from '@/src/engine/answers';
import { computeProgress } from '@/src/engine/progress';
import { visibleKeySet, type VisibleQuestion } from '@/src/engine/visibility';
import type { IntelligenceResult } from '@/src/intelligence/types';
import type { CaseState } from '@/src/lib/case-state';
import type { CaseRow, ProfileRow } from '@/src/lib/db/types';
import { reportElement } from '@/src/report/ReportDocument';
import { buildSnapshot, type ReportSnapshot, type SnapshotAnswer } from '@/src/report/snapshot';
import { answerDisplay, groupAnswers } from '@/src/report/group-answers';
import { money, rangePhrase } from '@/src/report/format';

// ---------- fixtures ----------

const estimate: Estimate = {
  fy: '2025-26',
  ruleSetVersion: '2025-26.1',
  lines: [
    { id: 'inc.salary.e1', section: 'income', label: 'Salary and wages', amountCents: 8_500_000, ruleId: 'income.salary', inputs: ['emp.employer.gross@e1'], formula: 'gross', status: 'computed', category: 'salary', itemId: 'e1' },
    { id: 'inc.interest', section: 'income', label: 'Bank interest', amountCents: 12_050, ruleId: 'income.interest', inputs: ['inv.interest'], formula: 'sum of interest', status: 'computed', category: 'interest' },
    { id: 'ded.tools', section: 'deductions', label: 'Tools under $300', amountCents: 25_000, ruleId: 'ded.tools.immediate', inputs: ['ded.tools.amount'], formula: '250.00 x 100%', status: 'computed', category: 'tools', detail: { workPct: 100, reimbursement: 'paid_not_reimbursed', evidence: 'receipts', method: 'itemised' } },
    { id: 'ded.laundry', section: 'deductions', label: 'Laundry (excluded: reimbursed)', amountCents: 0, ruleId: 'ded.laundry', inputs: ['ded.laundry.amount'], formula: 'reimbursed', status: 'excluded', note: 'Reimbursed costs cannot be claimed', category: 'laundry', detail: { reimbursement: 'paid_fully_reimbursed', evidence: 'none' } },
    { id: 'ti', section: 'taxable_income', label: 'Taxable income', amountCents: 8_487_000, ruleId: 'taxable_income', inputs: [], formula: 'income - deductions, rounded down', status: 'computed' },
    { id: 'gt.b2', section: 'gross_tax', label: 'Tax on $45,001 - $135,000 at 30%', amountCents: 1_634_100, ruleId: 'scale.resident.2025-26', inputs: [], formula: '4288 + 30% x (84870 - 45000)', status: 'computed' },
    { id: 'ml', section: 'medicare', label: 'Medicare levy 2%', amountCents: 169_740, ruleId: 'medicare.levy', inputs: [], formula: '2% x 84870', status: 'computed' },
    { id: 'cr.payg', section: 'credits', label: 'PAYG withheld', amountCents: 2_000_000, ruleId: 'credit.payg_withheld', inputs: ['emp.employer.withheld@e1'], formula: 'sum of withheld', status: 'computed' },
    { id: 'res', section: 'result', label: 'Estimated refund', amountCents: 196_160, ruleId: 'result', inputs: [], formula: 'credits - (tax + levies)', status: 'computed' },
  ],
  totals: {
    assessableIncomeCents: 8_512_050,
    deductionsCents: 25_000,
    taxableIncomeCents: 8_487_000,
    grossTaxCents: 1_634_100,
    offsetsCents: 0,
    taxAfterOffsetsCents: 1_634_100,
    medicareLevyCents: 169_740,
    mlsCents: 0,
    studyLoanCents: 0,
    creditsCents: 2_000_000,
    resultCents: 196_160,
    carriedForwardLossCents: 0,
    capitalLossCarriedForwardCents: 0,
    workRelatedDeductionsCents: 25_000,
    phiLiabilityCents: 0,
  },
  manualReview: [{ module: 'compensation', reason: 'Common-law lump sum: treatment depends on settlement terms', questionIds: ['comp.lump'], amountCents: 500_000 }],
  range: { lowCents: 150_000, highCents: 196_160, reasons: ['Laundry evidence is an estimate only'] },
  assumptions: ['Resident for the whole year was assumed from the residency answer'],
  uncertainInputs: ['ded.laundry.amount'],
  moduleStatus: { employment: 'computed', deductions: 'computed', compensation: 'manual_review' },
};

const intelligence: IntelligenceResult = {
  flags: [
    { code: 'ANY_NOT_SURE', kind: 'review', severity: 'warning', message: 'You answered Not sure to whether you had private hospital cover. Check your policy statement.', questionIds: ['phi.cover'] },
    { code: 'EXPENSE_REIMBURSED', kind: 'consistency', severity: 'info', message: 'Laundry was marked as reimbursed, so it was removed from deductions.', questionIds: ['ded.laundry.amount'] },
    { code: 'SUPER_NOI_MISSING', kind: 'missing', severity: 'blocker', message: 'A personal super deduction needs an acknowledged notice of intent.', questionIds: ['sup.noi'] },
    { code: 'CONSTR_PPE_UNCLAIMED', kind: 'opportunity', severity: 'info', message: 'you bought PPE for work but entered no amount; PPE you paid for is usually deductible.', questionIds: ['constr.ppe'], atoRef: 'https://www.ato.gov.au/' },
  ],
  completeness: { pct: 92, incomeModulesPct: 100, byModule: [] },
  confidence: { level: 'medium', reasons: ['One review flag is open'] },
  range: estimate.range,
  canFinalise: false,
  finaliseBlockers: ['SUPER_NOI_MISSING is a blocker'],
} as IntelligenceResult;

const questions: Question[] = [
  { id: 'core.fy', module: 'core', type: 'single', prompt: 'Which financial year is this for?', required: true, options: [{ value: '2025-26', label: '2025–26' }] },
  { id: 'core.lodged', module: 'core', type: 'single', prompt: 'Has a tax return already been lodged?', required: true, options: [{ value: 'no', label: 'No, not yet' }, { value: 'yes_mygov', label: 'Yes, myGov' }] },
  { id: 'core.assessed_result', module: 'core', type: 'money', prompt: 'What was the result on your notice of assessment?', required: false, allowNegative: true },
  { id: 'emp.employer', module: 'employment', type: 'repeater', prompt: 'Employers', required: true, repeater: { groupId: 'employer', itemLabel: 'Employer', addLabel: 'Add', minItems: 1 } },
  { id: 'emp.employer.gross', module: 'employment', type: 'money', prompt: 'Gross payments from this employer', required: true, repeaterGroup: 'employer', feeds: ['income'] },
  { id: 'emp.employer.withheld', module: 'employment', type: 'money', prompt: 'Tax withheld', required: true, repeaterGroup: 'employer', feeds: ['credits'] },
  { id: 'phi.cover', module: 'family', type: 'single', prompt: 'Did you have private hospital cover?', required: true, options: [{ value: 'whole_year', label: 'Whole year' }, { value: 'none', label: 'None' }, { value: 'not_sure', label: 'Not sure' }] },
  { id: 'ded.tools.amount', module: 'deductions', type: 'money', prompt: 'How much did you spend on tools?', required: false },
  { id: 'ded.laundry.amount', module: 'deductions', type: 'money', prompt: 'How much did you spend on laundry?', required: false },
  { id: 'res.arrival_date', module: 'residency', type: 'date', prompt: 'On what date did you become a resident?', required: true },
];
const questionsById = new Map(questions.map((q) => [q.id, q]));

const items: RepeaterItem[] = [{ id: 'e1', groupId: 'employer', label: 'Acme Pty Ltd', sortOrder: 0 }];

const answers: AnswerRecord[] = [
  { questionId: 'core.fy', repeaterItemId: null, value: '2025-26', state: 'answered', source: 'user', version: 1 },
  { questionId: 'core.lodged', repeaterItemId: null, value: 'yes_mygov', state: 'answered', source: 'user', version: 1 },
  { questionId: 'core.assessed_result', repeaterItemId: null, value: -12_000, state: 'answered', source: 'user', version: 1 },
  { questionId: 'emp.employer.gross', repeaterItemId: 'e1', value: 8_500_000, state: 'answered', source: 'document', version: 2 },
  { questionId: 'emp.employer.withheld', repeaterItemId: 'e1', value: 2_000_000, state: 'answered', source: 'user', version: 1 },
  { questionId: 'phi.cover', repeaterItemId: null, value: 'not_sure', state: 'not_sure', source: 'user', version: 1 },
  { questionId: 'ded.tools.amount', repeaterItemId: null, value: 25_000, state: 'answered', source: 'user', version: 1 },
  { questionId: 'ded.laundry.amount', repeaterItemId: null, value: null, state: 'skipped', source: 'user', version: 1 },
  // Answered earlier, then hidden because residency changed to "whole year".
  { questionId: 'res.arrival_date', repeaterItemId: null, value: '2025-09-01', state: 'answered', source: 'user', version: 1 },
  { questionId: 'res.arrival_date', repeaterItemId: null, value: '2025-09-01', state: 'not_applicable_by_rule', source: 'user', version: 2 },
];

function makeState(): CaseState {
  const caseRow: CaseRow = { id: 'case-1', profile_id: 'p-1', owner_id: 'u-1', financial_year: '2025-26', purpose: 'assessment_review', status: 'draft', rule_set_version: null, created_at: '2026-07-01T00:00:00Z' };
  const profile: ProfileRow = { id: 'p-1', owner_id: 'u-1', display_name: 'Jane Citizen', relationship: 'self', birth_year: 1985, occupations: ['carpenter', 'unknown_occ'], created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z' };
  const view = new AnswerView(answers, items);
  const visible: VisibleQuestion[] = questions
    .filter((q) => q.id !== 'res.arrival_date')
    .flatMap((q): VisibleQuestion[] => (q.repeaterGroup ? items.map((it) => ({ question: q, itemId: it.id, key: `${q.id}@${it.id}` })) : [{ question: q, itemId: null, key: q.id }]));
  return {
    caseRow,
    profile,
    ctx: { fy: '2025-26', profileOccupations: profile.occupations },
    answers,
    items,
    view,
    activeTags: new Set(['all_employees']),
    visible,
    visibleKeys: visibleKeySet(visible),
    progress: computeProgress(visible, view),
  };
}

function snapshotFor(isFinal: boolean): ReportSnapshot {
  return buildSnapshot(makeState(), estimate, intelligence, { isFinal, timezone: 'Australia/Melbourne', questionsById, now: new Date('2026-09-28T02:30:00Z') });
}

// ---------- tests ----------

describe('buildSnapshot', () => {
  it('freezes profile, case, estimate, intelligence and every latest answer', () => {
    const s = snapshotFor(false);
    expect(s.version).toBe(1);
    expect(s.generatedAt).toBe('2026-09-28T02:30:00.000Z');
    expect(s.timezone).toBe('Australia/Melbourne');
    expect(s.profile).toEqual({ displayName: 'Jane Citizen', relationship: 'self', occupationLabels: ['Carpenter or joiner', 'unknown_occ'] });
    expect(s.fy).toBe('2025-26');
    expect(s.purpose).toBe('assessment_review');
    expect(s.purposeLabel).toBe('Check an assessment I received');
    expect(s.isFinal).toBe(false);
    expect(s.ruleSetVersion).toBe('2025-26.1');
    expect(s.assessedResultCents).toBe(-12_000);
    // Latest version per key only: res.arrival_date appears once, as not_applicable_by_rule.
    const arrival = s.answers.filter((a) => a.questionId === 'res.arrival_date');
    expect(arrival).toHaveLength(1);
    expect(arrival[0]?.state).toBe('not_applicable_by_rule');
    expect(arrival[0]?.visible).toBe(false);
    // Not sure and skipped are kept and labelled.
    expect(s.answers.find((a) => a.questionId === 'phi.cover')).toMatchObject({ state: 'not_sure', display: 'Not sure', visible: true });
    expect(s.answers.find((a) => a.questionId === 'ded.laundry.amount')).toMatchObject({ state: 'skipped', display: 'Skipped' });
    // Repeater answers carry the item label and feeds; imported source preserved.
    expect(s.answers.find((a) => a.questionId === 'emp.employer.gross')).toMatchObject({ itemId: 'e1', itemLabel: 'Acme Pty Ltd', source: 'document', display: '$85,000.00', feeds: ['income'], moduleLabel: 'Employment and payers' });
    expect(s.answers.find((a) => a.questionId === 'core.lodged')?.display).toBe('Yes, myGov');
    // Ordered by module order: core before family before employment... deductions last here.
    const modules = s.answers.map((a) => a.module);
    expect(modules.indexOf('core')).toBeLessThan(modules.indexOf('employment'));
    expect(modules.indexOf('employment')).toBeLessThan(modules.indexOf('deductions'));
  });

  it('never includes birth year, email, TFN or bank keys', () => {
    const json = JSON.stringify(snapshotFor(true));
    for (const forbidden of ['birth_year', 'birthYear', 'email', 'tfn', 'bank_account', 'bsb', 'owner_id']) {
      expect(json.toLowerCase()).not.toContain(`"${forbidden.toLowerCase()}"`);
    }
    expect(json).not.toContain('1985');
    // Sanity: the collector of keys really walked the object.
    const keys = new Set<string>();
    JSON.parse(json, (k, v) => {
      keys.add(k);
      return v;
    });
    expect(keys.has('birth_year')).toBe(false);
    expect(keys.has('email')).toBe(false);
    expect(keys.has('displayName')).toBe(true);
  });
});

describe('groupAnswers', () => {
  it('groups by module in interview order and buckets not_applicable_by_rule as "no longer used"', () => {
    const s = snapshotFor(false);
    const groups = groupAnswers(s.answers);
    expect(groups.map((g) => g.module)).toEqual(['core', 'residency', 'family', 'employment', 'deductions']);
    const residency = groups.find((g) => g.module === 'residency')!;
    expect(residency.used).toEqual([]);
    expect(residency.noLongerUsed.map((a) => a.questionId)).toEqual(['res.arrival_date']);
    const family = groups.find((g) => g.module === 'family')!;
    expect(family.used.map((a) => a.state)).toEqual(['not_sure']);
    expect(answerDisplay(family.used[0]!)).toBe('Not sure (flagged for review)');
    const deductions = groups.find((g) => g.module === 'deductions')!;
    expect(deductions.used.map((a) => a.questionId)).toEqual(['ded.tools.amount', 'ded.laundry.amount']);
    expect(deductions.noLongerUsed).toEqual([]);
  });

  it('drops modules with no answers at all', () => {
    const only: SnapshotAnswer[] = [
      { questionId: 'x', itemId: null, module: 'offsets', moduleLabel: 'Offsets, debts and tax paid', prompt: 'X?', value: 'a', display: 'a', state: 'not_applicable_by_rule', source: 'user', visible: false },
    ];
    const groups = groupAnswers(only);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.used).toEqual([]);
    expect(groups[0]?.noLongerUsed).toHaveLength(1);
  });
});

describe('format helpers', () => {
  it('formats money and ranges', () => {
    expect(money(196_160)).toBe('$1,961.60');
    expect(money(-5)).toBe('-$0.05');
    expect(rangePhrase(150_000, 196_160)).toBe('Refund between $1,500.00 and $1,961.60');
    expect(rangePhrase(-30_000, -10_000)).toBe('Debt between $100.00 and $300.00');
    expect(rangePhrase(-30_000, 10_000)).toBe('Between a debt of $300.00 and a refund of $100.00');
  });
});

describe('ReportDocument', () => {
  it('renders a draft report to a PDF buffer', async () => {
    const buf = await renderToBuffer(reportElement(snapshotFor(false)));
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.byteLength).toBeGreaterThan(2_000);
  }, 60_000);

  it('renders a final report to a PDF buffer', async () => {
    const buf = await renderToBuffer(reportElement(snapshotFor(true)));
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.byteLength).toBeGreaterThan(2_000);
  }, 60_000);

  it('renders a long multi-page report (fixed footer must not grow page by page)', async () => {
    const s = snapshotFor(false);
    const many = Array.from({ length: 40 }, (_, n) => s.answers.map((a) => ({ ...a, questionId: `${a.questionId}.${n}` }))).flat();
    const buf = await renderToBuffer(reportElement({ ...s, answers: many }));
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  }, 120_000);

  it('renders an empty-ish snapshot (no lines, no flags, no answers) without throwing', async () => {
    const s = snapshotFor(true);
    const empty: ReportSnapshot = {
      ...s,
      answers: [],
      estimate: { ...s.estimate, lines: [], manualReview: [], assumptions: [], range: undefined },
      intelligence: { ...s.intelligence, flags: [], range: undefined },
      assessedResultCents: undefined,
    };
    const buf = await renderToBuffer(reportElement(empty));
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  }, 60_000);
});
