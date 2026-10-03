import { describe, expect, it } from 'vitest';
import { GROUPS, Q } from '@/src/questions/ids';
import { a, c, item, lineById, run } from './fixture';
import { runGolden } from '../../golden/harness';

const spent = (b: string, amount: number, itemId?: string) => [a(`${b}.paid`, 'paid_not_reimbursed', itemId), a(`${b}.amount`, c(amount), itemId), a(`${b}.evidence`, 'receipts', itemId)];

describe('costs of getting compensation payments', () => {
  const costs = (purpose: string) => run([a(Q.comp.received, ['weekly']), a(Q.comp.weeklyAmount, c(40000)), a(Q.ded.compCostsAny, 'yes'), a(Q.ded.compCostsFor, purpose), ...spent('ded.comp_costs', 3000)]);
  it('costs of getting lost-wage payments are deductible (ATO ID 2010/209)', () => {
    const l = lineById(costs('lost_earnings'), `ded.${Q.ded.compCostsAmount}`);
    expect(l.status).toBe('computed');
    expect(l.amountCents).toBe(c(3000));
  });
  it('costs of getting a capital lump sum are not', () => {
    expect(lineById(costs('capital'), `ded.${Q.ded.compCostsAmount}`).status).toBe('excluded');
  });
  it('mixed costs are held for a reasonable split (TD 93/29)', () => {
    expect(lineById(costs('both'), `ded.${Q.ded.compCostsAmount}`).status).toBe('manual_review');
  });
  it('is not counted as a work-related expense', () => {
    expect(costs('lost_earnings').totals.workRelatedDeductionsCents).toBe(0);
  });
  it('is asked only when compensation was received', () => {
    const base = [a(Q.core.fy, '2025-26'), a(Q.res.status, 'resident_full')];
    const none = runGolden({ fy: '2025-26', answers: [...base, a(Q.comp.received, ['none'])] });
    expect(none.input.visible.has(Q.ded.compCostsAny)).toBe(false);
    const weekly = runGolden({ fy: '2025-26', answers: [...base, a(Q.comp.received, ['weekly'])] });
    expect(weekly.input.visible.has(Q.ded.compCostsAny)).toBe(true);
  });
});

describe('deductions the user adds', () => {
  const items = [item('x1', GROUPS.customDeduction, 0), item('x2', GROUPS.customDeduction, 1)];
  const entry = (id: string, name: string, conn: string, amount: number) => [
    a(Q.ded.customItem, name, id), a(Q.ded.customPurpose, 'needed for the job', id), a(Q.ded.customConnection, conn, id), ...spent('ded.custom', amount, id), a('ded.custom.work_pct', 100, id),
  ];
  const est = run([a(Q.ded.customAny, 'yes'), ...entry('x1', 'Safety course', 'earning_income', 250), ...entry('x2', 'Gym membership', 'private_or_capital', 600)], { items });
  it('each item is its own line, labelled with its name', () => {
    expect(lineById(est, `ded.${Q.ded.customAmount}@x1`).label).toContain('Safety course');
    expect(lineById(est, `ded.${Q.ded.customAmount}@x1`).status).toBe('computed');
    expect(lineById(est, `ded.${Q.ded.customAmount}@x2`).status).toBe('excluded');
    expect(est.totals.deductionsCents).toBe(c(250));
  });
  it('an unconfirmed connection is review', () => {
    const r = run([a(Q.ded.customAny, 'yes'), a(Q.ded.customItem, 'Something', 'x1'), ...spent('ded.custom', 100, 'x1'), a('ded.custom.work_pct', 100, 'x1')], { items });
    expect(lineById(r, `ded.${Q.ded.customAmount}@x1`).status).toBe('manual_review');
  });
  it('they are listed for checking', async () => {
    const { CUSTOM_DEDUCTIONS_CHECK } = await import('@/src/intelligence/consistency');
    const { mkInput } = await import('./fixture');
    const input = mkInput([a(Q.ded.customAny, 'yes'), ...entry('x1', 'Safety course', 'earning_income', 250)], { items });
    const ctx = { answers: input.answers, visible: input.visible } as never;
    expect(CUSTOM_DEDUCTIONS_CHECK.when(input.answers, ctx)).toBe(true);
    expect(CUSTOM_DEDUCTIONS_CHECK.message(input.answers, ctx)).toContain('Safety course');
  });
});

describe('two cars on the logbook method', () => {
  const car = [a(Q.ded.carAny, 'yes'), a(Q.ded.carTripTypes, ['between_workplaces']), a(Q.ded.carMethod, 'logbook'), a(Q.ded.carPaid, 'paid_not_reimbursed'), a(Q.ded.carEvidence, 'logbook'), a(Q.ded.carTotalCosts, c(13000)), a(Q.ded.carLogbookPct, 80)];
  it('each car uses its own logbook and costs', () => {
    const est = run([...car, a(Q.ded.carCount, 'two'), a(Q.ded.carTotalCosts2, c(5000)), a(Q.ded.carLogbookPct2, 50)]);
    expect(lineById(est, 'ded.car').amountCents).toBe(c(10400 + 2500));
  });
  it('a missing second-car logbook is review', () => {
    const est = run([...car, a(Q.ded.carCount, 'two')]);
    expect(lineById(est, 'ded.car').status).toBe('manual_review');
  });
  it('the second car is asked under the logbook method', () => {
    const g = runGolden({ fy: '2025-26', answers: [a(Q.core.fy, '2025-26'), a(Q.ded.carAny, 'yes'), a(Q.ded.carMethod, 'logbook'), a(Q.ded.carCount, 'two')], profileOccupations: ['disability_support_worker'] });
    expect(g.input.visible.has(Q.ded.carCount)).toBe(true);
    expect(g.input.visible.has(Q.ded.carTotalCosts2)).toBe(true);
    expect(g.input.visible.has(Q.ded.carLogbookPct2)).toBe(true);
  });
});
