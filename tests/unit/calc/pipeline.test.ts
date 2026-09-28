import { describe, expect, it } from 'vitest';
import { CALC_MODULES } from '@/src/calc/pipeline';
import { ScopedAnswerView } from '@/src/calc/answer-scope';
import { AnswerView } from '@/src/engine/answers';
import { Q } from '@/src/questions/ids';
import { a, c, lineById, mkInput, run } from './fixture';

describe('pipeline', () => {
  it('refund when credits exceed liabilities', () => {
    // taxable 62,000: tax 4,288 + 30% x 17,000 = 9,388; LITO 325 - 1.5% x 17,000 = 70; Medicare 1,240
    const est = run([a(Q.emp.gross, c(62000), 'e1'), a(Q.emp.withheld, c(11000), 'e1')]);
    expect(est.totals.grossTaxCents).toBe(c(9388));
    expect(est.totals.offsetsCents).toBe(c(70));
    expect(est.totals.medicareLevyCents).toBe(c(1240));
    expect(est.totals.creditsCents).toBe(c(11000));
    expect(est.totals.resultCents).toBe(c(442));
    expect(lineById(est, 'result').label).toBe('Estimated refund');
  });
  it('debt when liabilities exceed credits', () => {
    const est = run([a(Q.emp.gross, c(62000), 'e1'), a(Q.emp.withheld, c(5000), 'e1')]);
    expect(est.totals.resultCents).toBe(c(-5558));
    expect(lineById(est, 'result').label).toBe('Estimated amount owing');
  });
  it('taxable income is floored to the dollar', () => {
    const est = run([a(Q.emp.gross, 5000075, 'e1')]);
    expect(est.totals.taxableIncomeCents).toBe(5000000);
    expect(est.totals.assessableIncomeCents).toBe(5000075);
  });
  it('negative taxable income becomes zero and is carried forward', () => {
    const est = run([a(Q.emp.gross, c(10000), 'e1'), a(Q.ded.giftsDgr, 'yes'), a(Q.ded.giftsAmount, c(15000))]);
    expect(est.totals.taxableIncomeCents).toBe(0);
    expect(est.totals.carriedForwardLossCents).toBe(c(5000));
    expect(est.totals.grossTaxCents).toBe(0);
    expect(est.totals.medicareLevyCents).toBe(0);
  });
  it('offsets are capped at gross tax', () => {
    const est = run([a(Q.emp.gross, c(19000), 'e1')]);
    expect(est.totals.offsetsCents).toBe(est.totals.grossTaxCents);
    expect(est.totals.taxAfterOffsetsCents).toBe(0);
  });
  it('every module has a status, defaulting to not_applicable', () => {
    const est = run([]);
    for (const m of CALC_MODULES) expect(est.moduleStatus[m]).toBeDefined();
    expect(est.moduleStatus['car']).toBe('not_applicable');
    expect(est.moduleStatus['medicare']).toBe('computed');
  });
  it('excludeInputs removes an answer everywhere', () => {
    const est = run([a(Q.emp.gross, c(50000), 'e1'), a(Q.emp.gross, c(10000), 'e2')], { exclude: new Set([`${Q.emp.gross}@e2`]) });
    expect(est.totals.assessableIncomeCents).toBe(c(50000));
  });
  it('a money answer that is not visible is ignored', () => {
    const est = run([a(Q.emp.gross, c(50000), 'e1'), a(Q.emp.withheld, c(1000), 'e1')], { hide: [`${Q.emp.withheld}@e1`] });
    expect(est.totals.creditsCents).toBe(0);
  });
  it('line ids are unique and every line has the contract fields', () => {
    const est = run([a(Q.emp.gross, c(62000), 'e1'), a(Q.emp.withheld, c(11000), 'e1'), a(Q.ded.unionAmount, c(500))]);
    const ids = est.lines.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of est.lines) {
      expect(typeof l.label).toBe('string');
      expect(typeof l.ruleId).toBe('string');
      expect(typeof l.formula).toBe('string');
      expect(Array.isArray(l.inputs)).toBe(true);
      expect(Number.isInteger(l.amountCents)).toBe(true);
    }
    expect(est.ruleSetVersion).toBe('2024-25.9');
    expect(est.fy).toBe('2024-25');
  });
  it('credits include withheld, instalments and TFN amounts', () => {
    const est = run([a(Q.emp.gross, c(62000), 'e1'), a(Q.emp.withheld, c(11000), 'e1'), a(Q.off.paygInstalments, c(500)), a(Q.comp.weeklyWithheld, c(200))]);
    expect(est.totals.creditsCents).toBe(c(11700));
  });
  it('result equals credits minus liabilities', () => {
    const est = run([a(Q.emp.gross, c(100000), 'e1'), a(Q.emp.withheld, c(20000), 'e1'), a(Q.loan.types, ['help']), a(Q.phi.cover, 'none')]);
    const t = est.totals;
    expect(t.resultCents).toBe(t.creditsCents - (t.taxAfterOffsetsCents + t.medicareLevyCents + t.mlsCents + t.studyLoanCents));
    expect(t.mlsCents).toBe(c(1000));
    expect(t.studyLoanCents).toBe(c(5500));
  });
  it('same input gives the same output (deterministic)', () => {
    const answers = [a(Q.emp.gross, c(62000), 'e1'), a(Q.emp.withheld, c(11000), 'e1')];
    expect(run(answers)).toEqual(run(answers));
  });
});

describe('ScopedAnswerView', () => {
  it('hides excluded and invisible keys, keeps items', () => {
    const input = mkInput([a(Q.emp.gross, c(1), 'e1'), a(Q.emp.gross, c(2), 'e2'), a(Q.ded.unionAmount, c(3))]);
    const base = input.answers as AnswerView;
    const scoped = new ScopedAnswerView(base, { visible: input.visible, exclude: new Set([`${Q.emp.gross}@e2`]) });
    expect(scoped.cents(Q.emp.gross, 'e1')).toBe(c(1));
    expect(scoped.cents(Q.emp.gross, 'e2')).toBeUndefined();
    expect(scoped.get(Q.emp.gross, 'e2')).toBeUndefined();
    expect(scoped.records().length).toBe(2);
    const hidden = new ScopedAnswerView(base, { visible: new Set([`${Q.emp.gross}@e1`]) });
    expect(hidden.cents(Q.ded.unionAmount)).toBeUndefined();
    expect(hidden.has(Q.emp.gross, 'e1')).toBe(true);
  });
});
