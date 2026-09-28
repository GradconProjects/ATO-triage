import { describe, expect, it } from 'vitest';
import { Q } from '@/src/questions/ids';
import { a, c, item, lineById, notSure, run } from './fixture';

const p = (fields: Record<string, unknown>, id = 'p1') => Object.entries(fields).map(([k, v]) => a(k, v, id));
const items = [item('p1', 'rental_property')];

describe('rental', () => {
  it('net rent = (income - expenses) x ownership', () => {
    const est = run(p({ [Q.rent.income]: c(20000), [Q.rent.expInterest]: c(15000), [Q.rent.expCouncil]: c(1000), [Q.rent.ownershipPct]: 100 }), { items });
    expect(lineById(est, 'income.rent.net@p1').amountCents).toBe(c(4000));
    expect(est.totals.assessableIncomeCents).toBe(c(4000));
    expect(est.moduleStatus['rental']).toBe('computed');
  });
  it('50% ownership', () => {
    const est = run(p({ [Q.rent.income]: c(20000), [Q.rent.expInterest]: c(15000), [Q.rent.expCouncil]: c(1000), [Q.rent.ownershipPct]: 50 }), { items });
    expect(est.totals.assessableIncomeCents).toBe(c(2000));
  });
  it('a net loss reduces other income', () => {
    const est = run([a(Q.emp.gross, c(50000), 'e1'), ...p({ [Q.rent.income]: c(10000), [Q.rent.expInterest]: c(15000), [Q.rent.ownershipPct]: 100 })], { items });
    expect(lineById(est, 'income.rent.net@p1').amountCents).toBe(c(-5000));
    expect(est.totals.assessableIncomeCents).toBe(c(45000));
  });
  it('initial repairs are excluded and reviewed', () => {
    const est = run(p({ [Q.rent.income]: c(20000), [Q.rent.expRepairs]: c(5000), [Q.rent.initialRepairs]: 'yes', [Q.rent.ownershipPct]: 100 }), { items });
    expect(est.totals.assessableIncomeCents).toBe(c(20000));
    expect(lineById(est, `income.rent.${Q.rent.expRepairs}@p1`).status).toBe('manual_review');
    expect(est.moduleStatus['rental']).toBe('manual_review');
    expect(est.uncertainInputs).toContain(`${Q.rent.expRepairs}@p1`);
  });
  it('initial repairs not sure -> review', () => {
    const est = run([notSure(Q.rent.initialRepairs, 'p1'), ...p({ [Q.rent.income]: c(20000), [Q.rent.expRepairs]: c(5000), [Q.rent.ownershipPct]: 100 })], { items });
    expect(est.totals.assessableIncomeCents).toBe(c(20000));
    expect(est.moduleStatus['rental']).toBe('manual_review');
  });
  it('repairs that are not initial repairs are deducted', () => {
    const est = run(p({ [Q.rent.income]: c(20000), [Q.rent.expRepairs]: c(5000), [Q.rent.initialRepairs]: 'no', [Q.rent.ownershipPct]: 100 }), { items });
    expect(est.totals.assessableIncomeCents).toBe(c(15000));
  });
  it('capital works and depreciation are included as entered but flagged', () => {
    const est = run(p({ [Q.rent.income]: c(20000), [Q.rent.expCapitalWorks]: c(2000), [Q.rent.expDepreciation]: c(1000), [Q.rent.ownershipPct]: 100 }), { items });
    expect(est.totals.assessableIncomeCents).toBe(c(17000));
    expect(est.manualReview.some((m) => m.module === 'rental' && m.reason.includes('capital works'))).toBe(true);
    expect(est.moduleStatus['rental']).toBe('computed');
  });
  it('short stay adds a note only', () => {
    const est = run(p({ [Q.rent.income]: c(20000), [Q.rent.shortStay]: 'yes', [Q.rent.ownershipPct]: 100 }), { items });
    expect(est.totals.assessableIncomeCents).toBe(c(20000));
    expect(est.assumptions.some((s) => s.includes('short-stay'))).toBe(true);
  });
  it('ownership unanswered assumes 100% with a note', () => {
    const est = run(p({ [Q.rent.income]: c(20000), [Q.rent.expAgent]: c(1000) }), { items });
    expect(est.totals.assessableIncomeCents).toBe(c(19000));
    expect(est.assumptions.some((s) => s.includes('ownership'))).toBe(true);
  });
  it('no property -> not applicable', () => {
    expect(run([a(Q.rent.any, 'no')]).moduleStatus['rental']).toBe('not_applicable');
  });
  it('two properties sum', () => {
    const est = run([...p({ [Q.rent.income]: c(20000), [Q.rent.expInterest]: c(5000), [Q.rent.ownershipPct]: 100 }, 'p1'), ...p({ [Q.rent.income]: c(10000), [Q.rent.expInterest]: c(12000), [Q.rent.ownershipPct]: 100 }, 'p2')], { items: [item('p1', 'rental_property'), item('p2', 'rental_property', 1)] });
    expect(est.totals.assessableIncomeCents).toBe(c(13000));
  });
});
