import { describe, expect, it } from 'vitest';
import { daysHeldInFy, diminishingValue } from '@/src/calc/modules/decline-in-value';
import { Q } from '@/src/questions/ids';
import { a, c, item, lineById, maybeLine, notSure, q, run } from './fixture';

const tool = (cents: number, extra = [] as ReturnType<typeof a>[]) => run([a(Q.emp.gross, c(60000), 'e1'), a(Q.ded.toolCost, cents, 't1'), a(Q.ded.toolItem, 'Drill', 't1'), ...extra], { items: [item('t1', 'tool_item')] });

describe('decline in value', () => {
  it('diminishing value formula', () => {
    expect(diminishingValue(100000, 5, 365, 100)).toBe(40000);
    expect(diminishingValue(100000, 5, 182, 100)).toBe(19945);
    expect(diminishingValue(100000, 4, 365, 50)).toBe(25000);
    expect(diminishingValue(100000, 0, 365, 100)).toBe(0);
    expect(diminishingValue(100000, 5, 0, 100)).toBe(0);
  });
  it('days held to FY end, inclusive', () => {
    expect(daysHeldInFy('2025-01-01', '2024-25')).toBe(181);
    expect(daysHeldInFy('2024-07-01', '2024-25')).toBe(365);
    expect(daysHeldInFy('2023-01-01', '2024-25')).toBe(365);
    expect(daysHeldInFy('2025-08-01', '2024-25')).toBe(0);
    expect(daysHeldInFy('garbage', '2024-25')).toBeUndefined();
  });
});

describe('$300 instant deduction threshold', () => {
  it('$299.99 is claimed immediately', () => {
    const est = tool(29999);
    const l = lineById(est, 'ded.ded.tool.cost@t1');
    expect(l.status).toBe('computed');
    expect(l.amountCents).toBe(29999);
    expect(est.totals.deductionsCents).toBe(29999);
  });
  it('$300 is capital: diminishing value over the effective life', () => {
    const est = tool(30000, [a(Q.ded.toolEffectiveLife, 5, 't1'), a(Q.ded.toolDate, '2024-07-01', 't1')]);
    expect(lineById(est, 'ded.ded.tool.cost@t1').amountCents).toBe(12000);
    expect(est.moduleStatus['decline_in_value']).toBe('computed');
  });
  it('$300 pro-rated from the date first used', () => {
    const est = tool(30000, [a(Q.ded.toolEffectiveLife, 5, 't1'), a(Q.ded.toolDate, '2025-01-01', 't1')]);
    expect(lineById(est, 'ded.ded.tool.cost@t1').amountCents).toBe(5951); // 30000 x 0.4 x 181/365
  });
  it('$300 without an effective life goes to review', () => {
    const est = tool(30000);
    expect(lineById(est, 'ded.ded.tool.cost@t1').status).toBe('manual_review');
    expect(est.uncertainInputs).toContain('ded.tool.cost@t1');
    expect(est.moduleStatus['decline_in_value']).toBe('manual_review');
  });
  it('$300 without a date assumes a full year', () => {
    const est = tool(30000, [a(Q.ded.toolEffectiveLife, 5, 't1')]);
    expect(lineById(est, 'ded.ded.tool.cost@t1').amountCents).toBe(12000);
    expect(est.assumptions.some((s) => s.includes('full year'))).toBe(true);
  });
  it('work % applies to the decline', () => {
    const est = tool(30000, [a(Q.ded.toolEffectiveLife, 5, 't1'), a(Q.ded.toolDate, '2024-07-01', 't1'), a(Q.ded.toolWorkPct, 50, 't1')]);
    expect(lineById(est, 'ded.ded.tool.cost@t1').amountCents).toBe(6000);
  });
});

describe('data-driven deductions', () => {
  it('work % scales the amount', () => {
    const est = tool(20000, [a(Q.ded.toolWorkPct, 60, 't1')]);
    expect(lineById(est, 'ded.ded.tool.cost@t1').amountCents).toBe(12000);
  });
  it('fully reimbursed -> excluded', () => {
    const est = tool(20000, [a(Q.ded.toolPaid, 'paid_fully_reimbursed', 't1')]);
    expect(lineById(est, 'ded.ded.tool.cost@t1').status).toBe('excluded');
    expect(est.totals.deductionsCents).toBe(0);
  });
  it('employer paid -> excluded', () => {
    const est = tool(20000, [a(Q.ded.toolPaid, 'employer_paid', 't1')]);
    expect(lineById(est, 'ded.ded.tool.cost@t1').status).toBe('excluded');
  });
  it('partly reimbursed subtracts the reimbursed amount', () => {
    const est = tool(20000, [a(Q.ded.toolPaid, 'paid_partly_reimbursed', 't1'), a('ded.tool.reimbursed_amount', 5000, 't1')]);
    expect(lineById(est, 'ded.ded.tool.cost@t1').amountCents).toBe(15000);
  });
  it('paid question in the bank but unanswered -> review', () => {
    const est = run([a(Q.ded.toolCost, 20000, 't1')], { items: [item('t1', 'tool_item')], questions: [q({ id: Q.ded.toolPaid, type: 'single', repeaterGroup: 'tool_item' })] });
    expect(lineById(est, 'ded.ded.tool.cost@t1').status).toBe('manual_review');
  });
  it('paid not sure -> review', () => {
    const est = tool(20000, [notSure(Q.ded.toolPaid, 't1')]);
    expect(lineById(est, 'ded.ded.tool.cost@t1').status).toBe('manual_review');
  });
  it('work % question in the bank but unanswered -> review', () => {
    const est = run([a(Q.ded.toolCost, 20000, 't1')], { items: [item('t1', 'tool_item')], questions: [q({ id: Q.ded.toolWorkPct, type: 'percent', repeaterGroup: 'tool_item' })] });
    expect(lineById(est, 'ded.ded.tool.cost@t1').status).toBe('manual_review');
    expect(est.moduleStatus['deductions']).toBe('manual_review');
  });
  it('weak evidence keeps the amount but marks it uncertain', () => {
    const est = tool(20000, [a(Q.ded.toolEvidence, 'estimate_only', 't1')]);
    expect(lineById(est, 'ded.ded.tool.cost@t1').status).toBe('computed');
    expect(est.uncertainInputs).toContain('ded.tool.cost@t1');
  });
  it('clothing: compulsory uniform is deductible', () => {
    const est = run([a(Q.ded.clothingType, ['compulsory_uniform']), a(Q.ded.clothingAmount, 25000)]);
    expect(lineById(est, `ded.${Q.ded.clothingAmount}`).amountCents).toBe(25000);
    expect(est.totals.workRelatedDeductionsCents).toBe(25000);
  });
  it('clothing: only plain clothes -> excluded', () => {
    const est = run([a(Q.ded.clothingType, ['plain']), a(Q.ded.clothingAmount, 25000)]);
    expect(lineById(est, `ded.${Q.ded.clothingAmount}`).status).toBe('excluded');
    expect(est.totals.deductionsCents).toBe(0);
  });
  it('clothing: plain plus protective -> deductible', () => {
    const est = run([a(Q.ded.clothingType, ['plain', 'protective']), a(Q.ded.clothingAmount, 25000)]);
    expect(lineById(est, `ded.${Q.ded.clothingAmount}`).status).toBe('computed');
  });
  it('clothing: type unanswered or not sure -> review', () => {
    expect(lineById(run([a(Q.ded.clothingAmount, 25000)]), `ded.${Q.ded.clothingAmount}`).status).toBe('manual_review');
    expect(lineById(run([notSure(Q.ded.clothingType, null, true), a(Q.ded.clothingAmount, 25000)]), `ded.${Q.ded.clothingAmount}`).status).toBe('manual_review');
  });
  it('DSW and chef clothing rules', () => {
    expect(lineById(run([a(Q.dsw.clothing, ['compulsory_logo']), a(Q.dsw.clothingAmount, 10000)]), `ded.${Q.dsw.clothingAmount}`).amountCents).toBe(10000);
    expect(lineById(run([a(Q.dsw.clothing, ['plain']), a(Q.dsw.clothingAmount, 10000)]), `ded.${Q.dsw.clothingAmount}`).status).toBe('excluded');
    expect(lineById(run([a(Q.chef.clothing, ['plain_black']), a(Q.chef.clothingAmount, 10000)]), `ded.${Q.chef.clothingAmount}`).status).toBe('excluded');
    expect(lineById(run([a(Q.chef.clothing, ['jacket', 'checked_pants']), a(Q.chef.clothingAmount, 10000)]), `ded.${Q.chef.clothingAmount}`).amountCents).toBe(10000);
  });
  it('gifts need a DGR', () => {
    expect(lineById(run([a(Q.ded.giftsDgr, 'yes'), a(Q.ded.giftsAmount, 10000)]), `ded.${Q.ded.giftsAmount}`).amountCents).toBe(10000);
    expect(lineById(run([a(Q.ded.giftsDgr, 'no'), a(Q.ded.giftsAmount, 10000)]), `ded.${Q.ded.giftsAmount}`).status).toBe('excluded');
    expect(lineById(run([notSure(Q.ded.giftsDgr), a(Q.ded.giftsAmount, 10000)]), `ded.${Q.ded.giftsAmount}`).status).toBe('manual_review');
    expect(lineById(run([a(Q.ded.giftsAmount, 10000)]), `ded.${Q.ded.giftsAmount}`).status).toBe('manual_review');
  });
  it('gifts and tax affairs are deductions but not work-related', () => {
    const est = run([a(Q.ded.giftsDgr, 'yes'), a(Q.ded.giftsAmount, 10000), a(Q.ded.unionAmount, 5000), a(Q.ded.taxAffairsAmount, 3000), a(Q.ded.incomeProtectionAmount, 2000), a(Q.ded.investmentAmount, 1000)]);
    expect(est.totals.deductionsCents).toBe(21000);
    expect(est.totals.workRelatedDeductionsCents).toBe(5000);
  });
  it('licences: first -> N, renewal -> D, stage unanswered -> R', () => {
    expect(lineById(run([a(Q.con.licenceStage, 'first'), a(Q.con.licenceAmount, 12000)]), `ded.${Q.con.licenceAmount}`).status).toBe('excluded');
    expect(lineById(run([a(Q.con.licenceStage, 'renewal'), a(Q.con.licenceAmount, 12000)]), `ded.${Q.con.licenceAmount}`).amountCents).toBe(12000);
    expect(lineById(run([a(Q.con.licenceAmount, 12000)]), `ded.${Q.con.licenceAmount}`).status).toBe('manual_review');
    expect(lineById(run([a(Q.dsw.checksStage, 'first_check'), a(Q.dsw.checksAmount, 13000)]), `ded.${Q.dsw.checksAmount}`).status).toBe('excluded');
    expect(lineById(run([a(Q.chef.certStage, 'first'), a(Q.chef.certAmount, 9000)]), `ded.${Q.chef.certAmount}`).status).toBe('excluded');
  });
  it('a hidden (not visible) money answer is ignored', () => {
    const est = run([a(Q.ded.unionAmount, 5000)], { hide: [Q.ded.unionAmount] });
    expect(maybeLine(est, `ded.${Q.ded.unionAmount}`)).toBeUndefined();
    expect(est.totals.deductionsCents).toBe(0);
  });
  it('excludeInputs treats the answer as absent', () => {
    const est = run([a(Q.ded.unionAmount, 5000), a(Q.ded.subscriptionsAmount, 2000)], { exclude: new Set([Q.ded.unionAmount]) });
    expect(est.totals.deductionsCents).toBe(2000);
  });
  it('bank meta drives unknown ids, including byQuestion fallbacks', () => {
    const questions = [
      q({ id: 'x.thing.amount', deduction: { category: 'other_work', base: 'x.thing', treatment: 'D' } }),
      q({ id: 'y.thing.amount', deduction: { category: 'other_work', base: 'y.thing', treatment: { byQuestion: 'y.thing.kind', map: { a: 'D', b: 'N' }, fallback: 'D' } } }),
      q({ id: 'y.thing.kind', type: 'single' }),
    ];
    const est = run([a('x.thing.amount', 1000), a('y.thing.amount', 2000)], { questions });
    expect(lineById(est, 'ded.x.thing.amount').amountCents).toBe(1000);
    expect(lineById(est, 'ded.y.thing.amount').amountCents).toBe(2000);
    const est2 = run([a('y.thing.amount', 2000), a('y.thing.kind', 'b')], { questions });
    expect(lineById(est2, 'ded.y.thing.amount').status).toBe('excluded');
  });
  it('nothing answered -> not applicable', () => {
    expect(run([a(Q.emp.gross, c(1000), 'e1')]).moduleStatus['deductions']).toBe('not_applicable');
  });
});
