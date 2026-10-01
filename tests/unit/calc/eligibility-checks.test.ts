import { describe, expect, it } from 'vitest';
import { Q } from '@/src/questions/ids';
import { a, c, lineById, run } from './fixture';

describe('course entered twice (job questions and general study)', () => {
  const both = [a(Q.chef.courses, 'current_job'), a(Q.chef.coursesAmount, c(2500)), a('chef.courses.paid', 'paid_not_reimbursed'), a('ded.selfed.any', 'yes'), a(Q.ded.selfEdAmount, c(2500)), a('ded.selfed.paid', 'paid_not_reimbursed'), a(Q.ded.selfEdRelated, 'current_duties')];
  it('is held for review until the user says whether it is the same course', () => {
    const est = run(both);
    expect(lineById(est, `ded.${Q.ded.selfEdAmount}`).status).toBe('manual_review');
    expect(lineById(est, `ded.${Q.chef.coursesAmount}`).status).toBe('computed');
  });
  it('counts once when confirmed the same course', () => {
    const est = run([...both, a(Q.ded.selfEdSameCourse, 'same')]);
    expect(lineById(est, `ded.${Q.ded.selfEdAmount}`).status).toBe('excluded');
    expect(est.totals.deductionsCents).toBe(c(2500));
  });
  it('counts both when confirmed different courses', () => {
    const est = run([...both, a(Q.ded.selfEdSameCourse, 'different')]);
    expect(est.totals.deductionsCents).toBe(c(5000));
  });
});

describe('car: home-base exception', () => {
  it('is assessed manually, never accepted automatically', () => {
    const est = run([a(Q.ded.carAny, 'yes'), a(Q.ded.carMethod, 'cents_per_km'), a(Q.ded.carKm, 1000), a(Q.ded.carTripTypes, ['home_to_work']), a(Q.ded.carException, 'home_base')]);
    expect(lineById(est, 'ded.car').status).toBe('manual_review');
    expect(est.totals.deductionsCents).toBe(0);
  });
});

describe('WorkCover gross that may include the arrears', () => {
  const base = [a(Q.comp.weeklyAmount, c(186754)), a(Q.comp.arrearsAmount, c(58753))];
  it('counts the arrears once when the gross includes them', () => {
    const est = run([...base, a(Q.comp.weeklyIncludesArrears, 'yes')]);
    expect(est.totals.assessableIncomeCents).toBe(c(186754));
  });
  it('adds them when shown separately', () => {
    const est = run([...base, a(Q.comp.weeklyIncludesArrears, 'no')]);
    expect(est.totals.assessableIncomeCents).toBe(c(186754 + 58753));
  });
  it('holds only the possible overlap for review when it is unknown', () => {
    const est = run(base);
    expect(lineById(est, `income.${Q.comp.weeklyAmount}`).status).toBe('computed');
    expect(lineById(est, `income.${Q.comp.weeklyAmount}.overlap`).status).toBe('manual_review');
    expect(est.totals.assessableIncomeCents).toBe(c(186754));
  });
});
