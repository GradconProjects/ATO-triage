import { describe, expect, it } from 'vitest';
import type { OccupationTag, Question } from '@/src/engine/types';
import {
  evaluateCondition,
  existsInYear,
  hiddenAnswerUpdates,
  visibleKeySet,
  visibleQuestions,
} from '@/src/engine/visibility';
import { ctx, item, notSure, q, rec, view, yesNo } from './fixtures';

const noTags = new Set<OccupationTag>();
const tags = (...t: OccupationTag[]) => new Set<OccupationTag>(t);
const scope = (itemId: string | null = null, activeTags = noTags) => ({ itemId, activeTags });

describe('evaluateCondition', () => {
  it('eq matches an answered string only', () => {
    const a = view([rec('a.x', 'yes')]);
    expect(evaluateCondition({ q: 'a.x', eq: 'yes' }, a, scope())).toBe(true);
    expect(evaluateCondition({ q: 'a.x', eq: 'no' }, a, scope())).toBe(false);
    expect(evaluateCondition({ q: 'a.missing', eq: 'yes' }, a, scope())).toBe(false);
  });

  it('not_sure never equals anything, including "not_sure"', () => {
    const a = view([notSure('a.x')]);
    expect(evaluateCondition({ q: 'a.x', eq: 'not_sure' }, a, scope())).toBe(false);
    expect(evaluateCondition({ q: 'a.x', in: ['not_sure', 'yes'] }, a, scope())).toBe(false);
    expect(evaluateCondition({ q: 'a.x', answered: true }, a, scope())).toBe(false);
  });

  it('in matches any listed string value', () => {
    const a = view([rec('a.x', 'b')]);
    expect(evaluateCondition({ q: 'a.x', in: ['a', 'b'] }, a, scope())).toBe(true);
    expect(evaluateCondition({ q: 'a.x', in: ['c'] }, a, scope())).toBe(false);
  });

  it('includes works on multi arrays only', () => {
    const a = view([rec('a.m', ['tips', 'cash']), rec('a.s', 'tips')]);
    expect(evaluateCondition({ q: 'a.m', includes: 'tips' }, a, scope())).toBe(true);
    expect(evaluateCondition({ q: 'a.m', includes: 'gifts' }, a, scope())).toBe(false);
    expect(evaluateCondition({ q: 'a.s', includes: 'tips' }, a, scope())).toBe(false);
  });

  it('gt compares numbers only', () => {
    const a = view([rec('a.n', 5), rec('a.t', '9')]);
    expect(evaluateCondition({ q: 'a.n', gt: 4 }, a, scope())).toBe(true);
    expect(evaluateCondition({ q: 'a.n', gt: 5 }, a, scope())).toBe(false);
    expect(evaluateCondition({ q: 'a.t', gt: 1 }, a, scope())).toBe(false);
  });

  it('answered is true only for state answered', () => {
    const a = view([
      rec('a.ans', 'x'),
      rec('a.imp', 'x', { state: 'imported', source: 'document' }),
      rec('a.skip', null, { state: 'skipped' }),
      rec('a.na', 'x', { state: 'not_applicable_by_rule' }),
    ]);
    expect(evaluateCondition({ q: 'a.ans', answered: true }, a, scope())).toBe(true);
    expect(evaluateCondition({ q: 'a.imp', answered: true }, a, scope())).toBe(false);
    expect(evaluateCondition({ q: 'a.skip', answered: true }, a, scope())).toBe(false);
    expect(evaluateCondition({ q: 'a.na', answered: true }, a, scope())).toBe(false);
  });

  it('occupation checks the active tag set', () => {
    const a = view();
    expect(evaluateCondition({ occupation: 'dsw' }, a, scope(null, tags('dsw')))).toBe(true);
    expect(evaluateCondition({ occupation: 'dsw' }, a, scope(null, tags('construction')))).toBe(false);
  });

  it('all / any / not compose', () => {
    const a = view([rec('a.x', 'yes'), rec('a.y', 'no')]);
    const x = { q: 'a.x', eq: 'yes' } as const;
    const y = { q: 'a.y', eq: 'yes' } as const;
    expect(evaluateCondition({ all: [x, y] }, a, scope())).toBe(false);
    expect(evaluateCondition({ any: [x, y] }, a, scope())).toBe(true);
    expect(evaluateCondition({ not: y }, a, scope())).toBe(true);
    expect(evaluateCondition({ all: [x, { not: y }] }, a, scope())).toBe(true);
    expect(evaluateCondition({ all: [] }, a, scope())).toBe(true);
    expect(evaluateCondition({ any: [] }, a, scope())).toBe(false);
  });

  it('inside a group resolves the same item first, then the case-level answer', () => {
    const a = view([rec('g.x', 'case'), rec('g.x', 'item', { item: 'i1' })]);
    expect(evaluateCondition({ q: 'g.x', eq: 'item' }, a, scope('i1'))).toBe(true);
    expect(evaluateCondition({ q: 'g.x', eq: 'case' }, a, scope('i1'))).toBe(false);
    // item i2 has no own record -> falls back to case level
    expect(evaluateCondition({ q: 'g.x', eq: 'case' }, a, scope('i2'))).toBe(true);
    // an item-level not_sure record shadows the case-level answer
    const b = view([rec('g.x', 'case'), notSure('g.x', 'i1')]);
    expect(evaluateCondition({ q: 'g.x', eq: 'case' }, b, scope('i1'))).toBe(false);
  });
});

describe('existsInYear', () => {
  it('filters by from/to inclusive', () => {
    expect(existsInYear(q({ id: 'a.b' }), '2023-24')).toBe(true);
    expect(existsInYear(q({ id: 'a.b', years: { from: '2024-25' } }), '2023-24')).toBe(false);
    expect(existsInYear(q({ id: 'a.b', years: { from: '2024-25' } }), '2024-25')).toBe(true);
    expect(existsInYear(q({ id: 'a.b', years: { to: '2024-25' } }), '2025-26')).toBe(false);
    expect(existsInYear(q({ id: 'a.b', years: { to: '2024-25' } }), '2024-25')).toBe(true);
    expect(existsInYear(q({ id: 'a.b', years: { from: '2024-25', to: '2025-26' } }), '2026-27')).toBe(false);
  });
});

describe('visibleQuestions', () => {
  const bank: Question[] = [
    q({ id: 'ded.a', module: 'deductions' }),
    q({ id: 'core.fy', module: 'core', type: 'single', options: [{ value: '2025-26', label: '2025-26' }] }),
    q({ id: 'emp.employer', module: 'employment', type: 'repeater', repeater: { groupId: 'employer', itemLabel: 'Employer', addLabel: 'Add', minItems: 1 } }),
    q({ id: 'emp.employer.name', module: 'employment', type: 'text', repeaterGroup: 'employer' }),
    q({ id: 'emp.employer.tax_ready', module: 'employment', type: 'yes_no_unsure', repeaterGroup: 'employer' }),
    q({ id: 'emp.employer.lump_a', module: 'employment', repeaterGroup: 'employer', showIf: { q: 'emp.employer.tax_ready', eq: 'yes' } }),
    q({ id: 'res.status', module: 'residency', type: 'single', options: yesNo }),
    q({ id: 'res.arrival', module: 'residency', type: 'date', showIf: { q: 'res.status', eq: 'yes' } }),
    q({ id: 'dsw.sleepover', module: 'deep_dsw', type: 'single', options: yesNo, occupationTags: ['dsw'] }),
    q({ id: 'ded.new_thing', module: 'deductions', years: { from: '2026-27' } }),
    q({ id: 'ded.fifo_only', module: 'deductions', showIf: { occupation: 'fifo' } }),
  ];

  it('orders by MODULE_ORDER then bank order and hides ineligible / conditional / out-of-year questions', () => {
    const a = view([rec('res.status', 'no')]);
    const vis = visibleQuestions(bank, a, ctx(), noTags);
    expect(vis.map((v) => v.key)).toEqual(['core.fy', 'res.status', 'emp.employer', 'ded.a']);
  });

  it('shows conditional questions when their condition holds', () => {
    const a = view([rec('res.status', 'yes')]);
    const keys = visibleKeySet(visibleQuestions(bank, a, ctx(), noTags));
    expect(keys.has('res.arrival')).toBe(true);
  });

  it('applies the years filter by ctx.fy', () => {
    const keys = visibleKeySet(visibleQuestions(bank, view(), ctx({ fy: '2026-27' }), noTags));
    expect(keys.has('ded.new_thing')).toBe(true);
    const keys25 = visibleKeySet(visibleQuestions(bank, view(), ctx({ fy: '2025-26' }), noTags));
    expect(keys25.has('ded.new_thing')).toBe(false);
  });

  it('applies occupation eligibility and {occupation} conditions', () => {
    const none = visibleKeySet(visibleQuestions(bank, view(), ctx(), noTags));
    expect(none.has('dsw.sleepover')).toBe(false);
    expect(none.has('ded.fifo_only')).toBe(false);
    const withTags = visibleKeySet(visibleQuestions(bank, view(), ctx(), tags('dsw', 'fifo')));
    expect(withTags.has('dsw.sleepover')).toBe(true);
    expect(withTags.has('ded.fifo_only')).toBe(true);
    // chef profile never sees dsw.* questions
    const chef = visibleKeySet(visibleQuestions(bank, view(), ctx(), tags('chef_hospitality', 'all_employees')));
    expect([...chef].some((k) => k.startsWith('dsw.'))).toBe(false);
  });

  it('expands repeater children once per item with key id@itemId, evaluating conditions per item', () => {
    const items = [item('i2', 'employer', 1), item('i1', 'employer', 0)];
    const a = view([rec('emp.employer.tax_ready', 'yes', { item: 'i2' }), rec('emp.employer.tax_ready', 'no', { item: 'i1' })], items);
    const vis = visibleQuestions(bank, a, ctx(), noTags);
    const keys = vis.map((v) => v.key);
    expect(keys).toEqual([
      'core.fy',
      'res.status',
      'emp.employer',
      'emp.employer.name@i1',
      'emp.employer.name@i2',
      'emp.employer.tax_ready@i1',
      'emp.employer.tax_ready@i2',
      'emp.employer.lump_a@i2',
      'ded.a',
    ]);
    const lump = vis.find((v) => v.key === 'emp.employer.lump_a@i2');
    expect(lump?.itemId).toBe('i2');
    expect(lump?.question.id).toBe('emp.employer.lump_a');
  });

  it('shows no children when there are no items', () => {
    const keys = visibleKeySet(visibleQuestions(bank, view(), ctx(), noTags));
    expect([...keys].some((k) => k.includes('@'))).toBe(false);
    expect(keys.has('emp.employer')).toBe(true);
  });

  it('hides all children when the parent repeater question is hidden', () => {
    const gated = bank.map((x) => (x.id === 'emp.employer' ? { ...x, showIf: { q: 'res.status', eq: 'yes' } as const } : x));
    const a = view([rec('res.status', 'no')], [item('i1', 'employer')]);
    const keys = visibleKeySet(visibleQuestions(gated, a, ctx(), noTags));
    expect(keys.has('emp.employer')).toBe(false);
    expect(keys.has('emp.employer.name@i1')).toBe(false);
    // and when there is no repeater question for the group at all
    const orphan = bank.filter((x) => x.id !== 'emp.employer');
    const keys2 = visibleKeySet(visibleQuestions(orphan, a, ctx(), noTags));
    expect([...keys2].some((k) => k.includes('@'))).toBe(false);
  });

  it('child questions themselves honour years and occupation tags', () => {
    const extra: Question[] = [
      ...bank,
      q({ id: 'emp.employer.old', module: 'employment', repeaterGroup: 'employer', years: { to: '2023-24' } }),
      q({ id: 'emp.employer.dswonly', module: 'employment', repeaterGroup: 'employer', occupationTags: ['dsw'] }),
    ];
    const a = view([], [item('i1', 'employer')]);
    const keys = visibleKeySet(visibleQuestions(extra, a, ctx(), noTags));
    expect(keys.has('emp.employer.old@i1')).toBe(false);
    expect(keys.has('emp.employer.dswonly@i1')).toBe(false);
    const keysDsw = visibleKeySet(visibleQuestions(extra, a, ctx(), tags('dsw')));
    expect(keysDsw.has('emp.employer.dswonly@i1')).toBe(true);
  });

  it('a group condition inside a repeater can fall back to a case-level answer', () => {
    const extra: Question[] = [...bank, q({ id: 'emp.employer.arr', module: 'employment', repeaterGroup: 'employer', showIf: { q: 'res.status', eq: 'yes' } })];
    const a = view([rec('res.status', 'yes')], [item('i1', 'employer')]);
    expect(visibleKeySet(visibleQuestions(extra, a, ctx(), noTags)).has('emp.employer.arr@i1')).toBe(true);
  });
});

describe('hiddenAnswerUpdates', () => {
  const bank: Question[] = [
    q({ id: 'res.status', module: 'residency', type: 'single', options: yesNo }),
    q({ id: 'res.arrival', module: 'residency', type: 'date', showIf: { q: 'res.status', eq: 'yes' } }),
    q({ id: 'emp.employer', module: 'employment', type: 'repeater', repeater: { groupId: 'employer', itemLabel: 'Employer', addLabel: 'Add', minItems: 1 } }),
    q({ id: 'emp.employer.tax_ready', module: 'employment', type: 'yes_no_unsure', repeaterGroup: 'employer' }),
    q({ id: 'emp.employer.lump_a', module: 'employment', repeaterGroup: 'employer', showIf: { q: 'emp.employer.tax_ready', eq: 'yes' } }),
  ];

  it('marks hidden answered rows not_applicable_by_rule, keeping value and source, version + 1', () => {
    const a = view([rec('res.status', 'no', { version: 2 }), rec('res.arrival', '2025-08-01', { version: 3, source: 'prefill_confirmed' })]);
    const vis = visibleQuestions(bank, a, ctx(), noTags);
    const updates = hiddenAnswerUpdates(bank, a, vis);
    expect(updates).toEqual([
      {
        questionId: 'res.arrival',
        repeaterItemId: null,
        value: '2025-08-01',
        state: 'not_applicable_by_rule',
        source: 'prefill_confirmed',
        version: 4,
      },
    ]);
  });

  it('returns nothing when everything with a value is visible', () => {
    const a = view([rec('res.status', 'yes'), rec('res.arrival', '2025-08-01')]);
    expect(hiddenAnswerUpdates(bank, a, visibleQuestions(bank, a, ctx(), noTags))).toEqual([]);
  });

  it('covers not_sure, imported and skipped rows but not rows already n/a', () => {
    const a = view([
      rec('res.status', 'no'),
      notSure('res.arrival'),
      rec('emp.employer.tax_ready', 'no', { item: 'i1' }),
      rec('emp.employer.lump_a', 100, { item: 'i1', state: 'imported', source: 'document' }),
      rec('emp.employer.lump_a', 100, { item: 'i2', state: 'skipped' }),
      rec('emp.employer.lump_a', 100, { item: 'i3', state: 'not_applicable_by_rule', version: 5 }),
    ], [item('i1', 'employer', 0), item('i2', 'employer', 1), item('i3', 'employer', 2)]);
    const updates = hiddenAnswerUpdates(bank, a, visibleQuestions(bank, a, ctx(), noTags));
    const keys = updates.map((u) => `${u.questionId}@${u.repeaterItemId ?? ''}`).sort();
    expect(keys).toEqual(['emp.employer.lump_a@i1', 'emp.employer.lump_a@i2', 'res.arrival@']);
    expect(updates.every((u) => u.state === 'not_applicable_by_rule')).toBe(true);
  });

  it('is idempotent: once the n/a row is the latest version nothing more is emitted', () => {
    const a = view([rec('res.status', 'no'), rec('res.arrival', '2025-08-01')]);
    const first = hiddenAnswerUpdates(bank, a, visibleQuestions(bank, a, ctx(), noTags));
    expect(first).toHaveLength(1);
    const after = view([...a.records(), ...first]);
    expect(hiddenAnswerUpdates(bank, after, visibleQuestions(bank, after, ctx(), noTags))).toEqual([]);
  });

  it('leaves records for ids not in the bank alone', () => {
    const a = view([rec('legacy.thing', 'x')]);
    expect(hiddenAnswerUpdates(bank, a, visibleQuestions(bank, a, ctx(), noTags))).toEqual([]);
  });

  it('hides item answers for items that no longer exist', () => {
    const a = view([rec('emp.employer.tax_ready', 'yes', { item: 'gone' })]);
    const updates = hiddenAnswerUpdates(bank, a, visibleQuestions(bank, a, ctx(), noTags));
    expect(updates.map((u) => u.repeaterItemId)).toEqual(['gone']);
  });
});
