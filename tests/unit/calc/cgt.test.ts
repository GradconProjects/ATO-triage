import { describe, expect, it } from 'vitest';
import { heldAtLeast12Months } from '@/src/calc/modules/cgt';
import { Q } from '@/src/questions/ids';
import { a, c, item, lineById, maybeLine, notSure, run } from './fixture';

const ev = (id: string, fields: Record<string, unknown>) => Object.entries(fields).map(([k, v]) => a(k, v, id));
const shares = (id: string, proceeds: number, cost: number, acquired = '2024-01-15', disposed = '2025-03-15') =>
  ev(id, { [Q.cgt.assetType]: 'shares', [Q.cgt.acquiredDate]: acquired, [Q.cgt.disposedDate]: disposed, [Q.cgt.proceeds]: c(proceeds), [Q.cgt.costBase]: c(cost), [Q.cgt.ownershipPct]: 100 });
const items = (...ids: string[]) => ids.map((id, i) => item(id, 'cgt_event', i));

describe('12-month CGT discount boundary', () => {
  it('excludes both the acquisition and disposal days', () => {
    expect(heldAtLeast12Months('2024-01-15', '2025-01-15')).toBe(false);
    expect(heldAtLeast12Months('2024-01-15', '2025-01-16')).toBe(true);
    expect(heldAtLeast12Months('2024-07-01', '2025-07-01')).toBe(false); // 365 days
    expect(heldAtLeast12Months('2024-07-01', '2025-07-02')).toBe(true); // 366 days
    expect(heldAtLeast12Months('2024-02-29', '2025-02-28')).toBe(false);
    expect(heldAtLeast12Months('2024-02-29', '2025-03-01')).toBe(true);
    expect(heldAtLeast12Months('2024-01-15', '2024-06-15')).toBe(false);
    expect(heldAtLeast12Months('bad', '2025-01-16')).toBeUndefined();
  });
});

describe('CGT in the pipeline', () => {
  it('shares held 14 months: 50% discount', () => {
    const est = run([a(Q.res.status, 'resident_full'), ...shares('c1', 20000, 10000)], { items: items('c1') });
    expect(lineById(est, 'income.cgt.net').amountCents).toBe(c(5000));
    expect(est.totals.assessableIncomeCents).toBe(c(5000));
    expect(lineById(est, 'income.cgt.event@c1').informational).toBe(true);
  });
  it('held under 12 months: no discount', () => {
    const est = run([...shares('c1', 20000, 10000, '2024-09-01', '2025-03-01')], { items: items('c1') });
    expect(est.totals.assessableIncomeCents).toBe(c(10000));
  });
  it('current losses offset gains before the discount', () => {
    const est = run([...shares('c1', 20000, 10000), ...shares('c2', 2000, 5000)], { items: items('c1', 'c2') });
    expect(est.totals.assessableIncomeCents).toBe(c(3500));
  });
  it('prior-year losses apply before the discount', () => {
    const est = run([...shares('c1', 20000, 10000), a(Q.cgt.priorLosses, c(2000))], { items: items('c1') });
    expect(est.totals.assessableIncomeCents).toBe(c(4000));
  });
  it('losses go against non-discount gains first', () => {
    const est = run([...shares('c1', 20000, 10000), ...shares('c2', 9000, 5000, '2024-09-01', '2025-03-01'), ...shares('c3', 1000, 6000)], { items: items('c1', 'c2', 'c3') });
    // loss 5,000 wipes the 4,000 non-discount gain, 1,000 against the 10,000 discount gain -> 9,000 x 50%
    expect(est.totals.assessableIncomeCents).toBe(c(4500));
  });
  it('net capital loss is carried forward separately from income losses', () => {
    const est = run([a(Q.emp.gross, c(50000), 'e1'), ...shares('c1', 11000, 10000, '2024-09-01', '2025-03-01'), ...shares('c2', 2000, 5000)], { items: items('c1', 'c2') });
    expect(est.totals.capitalLossCarriedForwardCents).toBe(c(2000));
    expect(est.totals.carriedForwardLossCents).toBe(0);
    expect(est.totals.assessableIncomeCents).toBe(c(50000));
  });
  it('main residence -> excluded; part -> review', () => {
    const yes = run([...ev('c1', { [Q.cgt.assetType]: 'property', [Q.cgt.proceeds]: c(800000), [Q.cgt.costBase]: c(500000), [Q.cgt.mainResidence]: 'yes' })], { items: items('c1') });
    expect(lineById(yes, 'income.cgt.event@c1').status).toBe('excluded');
    expect(yes.totals.assessableIncomeCents).toBe(0);
    const part = run([...ev('c1', { [Q.cgt.assetType]: 'property', [Q.cgt.proceeds]: c(800000), [Q.cgt.costBase]: c(500000), [Q.cgt.mainResidence]: 'part' })], { items: items('c1') });
    expect(lineById(part, 'income.cgt.event@c1').status).toBe('manual_review');
    expect(part.moduleStatus['cgt']).toBe('manual_review');
  });
  it('crypto needs an answered cost-base method', () => {
    const noMethod = run([...ev('c1', { [Q.cgt.assetType]: 'crypto', [Q.cgt.acquiredDate]: '2024-01-01', [Q.cgt.disposedDate]: '2025-03-01', [Q.cgt.proceeds]: c(5000), [Q.cgt.costBase]: c(1000) })], { items: items('c1') });
    expect(lineById(noMethod, 'income.cgt.event@c1').status).toBe('manual_review');
    const unsure = run([notSure(Q.cgt.cryptoMethod), ...ev('c1', { [Q.cgt.assetType]: 'crypto', [Q.cgt.acquiredDate]: '2024-01-01', [Q.cgt.disposedDate]: '2025-03-01', [Q.cgt.proceeds]: c(5000), [Q.cgt.costBase]: c(1000) })], { items: items('c1') });
    expect(lineById(unsure, 'income.cgt.event@c1').status).toBe('manual_review');
    const fifo = run([a(Q.cgt.cryptoMethod, 'fifo'), ...ev('c1', { [Q.cgt.assetType]: 'crypto', [Q.cgt.acquiredDate]: '2024-01-01', [Q.cgt.disposedDate]: '2025-03-01', [Q.cgt.proceeds]: c(5000), [Q.cgt.costBase]: c(1000) })], { items: items('c1') });
    expect(fifo.totals.assessableIncomeCents).toBe(c(2000));
  });
  it('missing disposal date -> review', () => {
    const est = run([...ev('c1', { [Q.cgt.assetType]: 'shares', [Q.cgt.acquiredDate]: '2024-01-01', [Q.cgt.proceeds]: c(5000), [Q.cgt.costBase]: c(1000) })], { items: items('c1') });
    expect(lineById(est, 'income.cgt.event@c1').status).toBe('manual_review');
    expect(est.uncertainInputs).toContain(`${Q.cgt.proceeds}@c1`);
  });
  it('foreign resident gets no discount', () => {
    const est = run([a(Q.res.status, 'foreign_full'), ...shares('c1', 20000, 10000)], { items: items('c1') });
    expect(est.totals.assessableIncomeCents).toBe(c(10000));
  });
  it('ownership share applies', () => {
    const est = run([...ev('c1', { [Q.cgt.assetType]: 'shares', [Q.cgt.acquiredDate]: '2024-01-15', [Q.cgt.disposedDate]: '2025-03-15', [Q.cgt.proceeds]: c(20000), [Q.cgt.costBase]: c(10000), [Q.cgt.ownershipPct]: 50 })], { items: items('c1') });
    expect(est.totals.assessableIncomeCents).toBe(c(2500));
  });
  it('trust discounted capital gain component', () => {
    const est = run([a(Q.inv.trustCgDiscounted, c(2000), 't1'), a(Q.inv.trustCgOther, c(500), 't1')], { items: [item('t1', 'trust_dist')] });
    expect(est.totals.assessableIncomeCents).toBe(c(1500));
  });
  it('no events -> not applicable', () => {
    expect(run([a(Q.emp.gross, c(1000), 'e1')]).moduleStatus['cgt']).toBe('not_applicable');
    expect(maybeLine(run([]), 'income.cgt.net')).toBeUndefined();
  });
});
