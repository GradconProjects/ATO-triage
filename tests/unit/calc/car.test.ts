import { describe, expect, it } from 'vitest';
import { Q } from '@/src/questions/ids';
import { a, c, lineById, maybeLine, notSure, run } from './fixture';

const base = [a(Q.ded.carAny, 'yes'), a(Q.ded.carMethod, 'cents_per_km'), a(Q.ded.carTripTypes, ['client_to_client'])];

describe('car expenses', () => {
  it('cents per km: 1,800 km x 88c', () => {
    const est = run([...base, a(Q.ded.carKm, 1800)]);
    expect(lineById(est, 'ded.car').amountCents).toBe(c(1584));
    expect(est.totals.workRelatedDeductionsCents).toBe(c(1584));
    expect(est.moduleStatus['car']).toBe('computed');
  });
  it('caps at 5,000 km', () => {
    const est = run([...base, a(Q.ded.carKm, 6000)]);
    expect(lineById(est, 'ded.car').amountCents).toBe(c(4400));
    expect(lineById(est, 'ded.car').formula).toContain('capped');
  });
  it('exactly 5,000 km', () => {
    expect(lineById(run([...base, a(Q.ded.carKm, 5000)]), 'ded.car').amountCents).toBe(c(4400));
  });
  it('home-to-work mixed with work trips and no exception -> review, never silently deducted', () => {
    const est = run([a(Q.ded.carAny, 'yes'), a(Q.ded.carMethod, 'cents_per_km'), a(Q.ded.carTripTypes, ['client_to_client', 'home_to_work']), a(Q.ded.carException, 'none'), a(Q.ded.carKm, 1800)]);
    expect(lineById(est, 'ded.car').status).toBe('manual_review');
    expect(est.totals.deductionsCents).toBe(0);
    expect(est.uncertainInputs).toContain(Q.ded.carKm);
  });
  it('only home-to-work -> excluded', () => {
    const est = run([a(Q.ded.carAny, 'yes'), a(Q.ded.carMethod, 'cents_per_km'), a(Q.ded.carTripTypes, ['home_to_work']), a(Q.ded.carKm, 1800)]);
    expect(lineById(est, 'ded.car').status).toBe('excluded');
    expect(est.moduleStatus['car']).toBe('computed');
  });
  it('home-to-work with a bulky-tools exception is claimable', () => {
    const est = run([a(Q.ded.carAny, 'yes'), a(Q.ded.carMethod, 'cents_per_km'), a(Q.ded.carTripTypes, ['home_to_work']), a(Q.ded.carException, 'bulky_no_storage'), a(Q.ded.carKm, 1000)]);
    expect(lineById(est, 'ded.car').amountCents).toBe(c(880));
  });
  it('trip types missing -> review', () => {
    const est = run([a(Q.ded.carAny, 'yes'), a(Q.ded.carMethod, 'cents_per_km'), a(Q.ded.carKm, 1800)]);
    expect(lineById(est, 'ded.car').status).toBe('manual_review');
  });
  it('km missing -> review', () => {
    expect(lineById(run(base), 'ded.car').status).toBe('manual_review');
  });
  it('logbook: total costs x logbook %', () => {
    const est = run([a(Q.ded.carAny, 'yes'), a(Q.ded.carMethod, 'logbook'), a(Q.ded.carTotalCosts, c(10000)), a(Q.ded.carLogbookPct, 40)]);
    expect(lineById(est, 'ded.car').amountCents).toBe(c(4000));
  });
  it('logbook without a percentage -> review', () => {
    const est = run([a(Q.ded.carAny, 'yes'), a(Q.ded.carMethod, 'logbook'), a(Q.ded.carTotalCosts, c(10000))]);
    expect(lineById(est, 'ded.car').status).toBe('manual_review');
  });
  it('reimbursed -> excluded; partly reimbursed reduces', () => {
    expect(lineById(run([...base, a(Q.ded.carKm, 1800), a(Q.ded.carPaid, 'paid_fully_reimbursed')]), 'ded.car').status).toBe('excluded');
    expect(lineById(run([...base, a(Q.ded.carKm, 1800), a(Q.ded.carPaid, 'paid_partly_reimbursed'), a('ded.car.reimbursed_amount', c(500))]), 'ded.car').amountCents).toBe(c(1084));
  });
  it('method not sure -> review; carAny no -> not applicable; nothing -> not applicable', () => {
    expect(lineById(run([a(Q.ded.carAny, 'yes'), notSure(Q.ded.carMethod), a(Q.ded.carKm, 100)]), 'ded.car').status).toBe('manual_review');
    const no = run([a(Q.ded.carAny, 'no')]);
    expect(no.moduleStatus['car']).toBe('not_applicable');
    expect(maybeLine(no, 'ded.car')).toBeUndefined();
    expect(run([]).moduleStatus['car']).toBe('not_applicable');
  });
  it('weak evidence marks the km as uncertain', () => {
    const est = run([...base, a(Q.ded.carKm, 1800), a(Q.ded.carEvidence, 'none')]);
    expect(lineById(est, 'ded.car').status).toBe('computed');
    expect(est.uncertainInputs).toContain(Q.ded.carKm);
  });
});
