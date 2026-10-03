import { describe, expect, it } from 'vitest';
import { GROUPS, Q } from '@/src/questions/ids';
import { a, c, item, lineById, run } from './fixture';
import { runGolden } from '../../golden/harness';

const items = [item('i1', GROUPS.businessIncomeLine, 0), item('i2', GROUPS.businessIncomeLine, 1), item('x1', GROUPS.businessExpenseLine, 0), item('x2', GROUPS.businessExpenseLine, 1), item('x3', GROUPS.businessExpenseLine, 2)];
const base = [a(Q.bus.soleTrader, 'yes'), a(Q.bus.income, c(20000)), a(Q.bus.expenses, c(2000)), a(Q.bus.psi80, 'no')];

describe('itemised business income and expenses', () => {
  it('extra items add to the totals; private share and equipment are kept out', () => {
    const est = run([
      ...base,
      a(Q.bus.incomeMoreAny, 'yes'),
      a(Q.bus.incomeLineName, 'Second client', 'i1'), a(Q.bus.incomeLineAmount, c(5000), 'i1'),
      a(Q.bus.incomeLineName, 'Platform payout', 'i2'), a(Q.bus.incomeLineAmount, c(1000), 'i2'),
      a(Q.bus.expenseMoreAny, 'yes'),
      a(Q.bus.expenseLineName, 'Materials', 'x1'), a(Q.bus.expenseLineKind, 'materials', 'x1'), a(Q.bus.expenseLineAmount, c(3000), 'x1'),
      a(Q.bus.expenseLineName, 'Phone', 'x2'), a(Q.bus.expenseLineKind, 'phone_internet', 'x2'), a(Q.bus.expenseLineAmount, c(1000), 'x2'), a(Q.bus.expenseLinePct, 60, 'x2'),
      a(Q.bus.expenseLineName, 'Laptop', 'x3'), a(Q.bus.expenseLineKind, 'equipment', 'x3'), a(Q.bus.expenseLineAmount, c(2500), 'x3'),
    ], { items });
    // income 20,000 + 5,000 + 1,000 = 26,000; expenses 2,000 + 3,000 + 600 = 5,600 (laptop held for review)
    expect(lineById(est, 'income.business').amountCents).toBe(c(26000 - 5600));
    expect(est.manualReview.some((r) => r.reason.includes('Laptop'))).toBe(true);
  });
  it('items alone (no totals) still make a business result', () => {
    const est = run([a(Q.bus.soleTrader, 'yes'), a(Q.bus.psi80, 'no'), a(Q.bus.incomeMoreAny, 'yes'), a(Q.bus.incomeLineName, 'Client', 'i1'), a(Q.bus.incomeLineAmount, c(4000), 'i1')], { items });
    expect(lineById(est, 'income.business').amountCents).toBe(c(4000));
  });
  it('the item lists are asked only for a sole trader who wants them', () => {
    const g = runGolden({ fy: '2025-26', items, answers: [a(Q.core.fy, '2025-26'), a(Q.bus.soleTrader, 'yes'), a(Q.bus.expenseMoreAny, 'yes')] });
    expect(g.input.visible.has(Q.bus.incomeMoreAny)).toBe(true);
    expect(g.input.visible.has(`${Q.bus.expenseLineAmount}@x1`)).toBe(true);
    expect(g.input.visible.has(`${Q.bus.incomeLineAmount}@i1`)).toBe(false);
  });
});
