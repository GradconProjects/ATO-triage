import { describe, expect, it } from 'vitest';
import { Q } from '@/src/questions/ids';
import { a, c, lineById, run } from './fixture';

describe('review amounts are counted provisionally, as entered', () => {
  it('a deduction under review is counted, marked provisional and still flagged', () => {
    const est = run([a(Q.emp.gross, c(60000), 'e1'), a(Q.ded.carAny, 'yes'), a(Q.ded.carMethod, 'cents_per_km'), a(Q.ded.carTripTypes, ['home_to_work']), a(Q.ded.carException, ['home_base']), a(Q.ded.carKm, 1000)]);
    const car = lineById(est, 'ded.car');
    expect(car.status).toBe('manual_review');
    expect(car.provisional).toBe(true);
    expect(est.totals.deductionsCents).toBe(car.amountCents);
    expect(est.totals.provisionalDeductionsCents).toBe(car.amountCents);
    expect(est.manualReview.length).toBeGreaterThan(0);
    expect(est.assumptions.some((s) => s.includes('provisionally'))).toBe(true);
  });
  it('likely double counts and capital lump sums are held out', () => {
    const est = run([a(Q.comp.weeklyAmount, c(40000)), a(Q.comp.arrearsAmount, c(5000)), a(Q.comp.impairmentAmount, c(50000))]);
    expect(lineById(est, `income.${Q.comp.weeklyAmount}.overlap`).heldOut).toBe(true);
    expect(lineById(est, `income.${Q.comp.impairmentAmount}`).heldOut).toBe(true);
    expect(est.totals.assessableIncomeCents).toBe(c(40000));
    expect(est.totals.heldOutCents).toBe(c(55000));
  });
  it('the result equals its parts with provisional amounts included', () => {
    const est = run([a(Q.emp.gross, c(60000), 'e1'), a(Q.emp.withheld, c(9000), 'e1'), a(Q.allow.amount, c(1000), 'al1')], { items: [{ id: 'al1', groupId: 'allowance', sortOrder: 0 }] });
    const t = est.totals;
    expect(t.assessableIncomeCents).toBe(c(61000));
    expect(t.resultCents).toBe(t.creditsCents + (t.refundableOffsetsCents ?? 0) - (t.taxAfterOffsetsCents + (t.phiLiabilityCents ?? 0) + t.medicareLevyCents + t.mlsCents + t.studyLoanCents));
  });
});
