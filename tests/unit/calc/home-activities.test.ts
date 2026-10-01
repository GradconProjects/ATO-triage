import { describe, expect, it } from 'vitest';
import { Q } from '@/src/questions/ids';
import { a, c, lineById, maybeLine, run } from './fixture';

const fixed = [a(Q.ded.wfhAny, 'yes'), a(Q.ded.wfhMethod, 'fixed_rate'), a(Q.ded.wfhHours, 200), a(Q.ded.wfhHoursRecord, 'full_record')];

describe('home activities: employment, business and study kept separate', () => {
  it('employment hours with a full record use the fixed rate', () => {
    expect(lineById(run(fixed), 'ded.wfh').status).toBe('computed');
  });
  it('a 4-week sample record is not accepted for the fixed rate', () => {
    const est = run([...fixed.filter((x) => x.id !== Q.ded.wfhHoursRecord), a(Q.ded.wfhHoursRecord, 'representative_4_weeks')]);
    expect(lineById(est, 'ded.wfh').status).toBe('manual_review');
  });
  it('study hours are never priced at the work rate automatically', () => {
    const est = run([...fixed, a(Q.ded.wfhActivities, ['employment', 'study']), a(Q.ded.wfhStudyHours, 100), a(Q.ded.wfhHoursOverlap, 'no')]);
    expect(lineById(est, 'ded.wfh').amountCents).toBe(200 * 67);
    expect(lineById(est, 'ded.wfh.study_hours').status).toBe('manual_review');
    expect(lineById(est, 'ded.wfh.study_hours').amountCents).toBe(0);
  });
  it('business hours are recorded but claimed under the business, not as an employee deduction', () => {
    const est = run([...fixed, a(Q.ded.wfhActivities, ['employment', 'business']), a(Q.ded.wfhBusinessHours, 50), a(Q.ded.wfhHoursOverlap, 'no')]);
    expect(lineById(est, 'ded.wfh.business_hours').status).toBe('excluded');
    expect(est.totals.deductionsCents).toBe(200 * 67);
  });
  it('hours counted in two activities are not used twice', () => {
    const est = run([...fixed, a(Q.ded.wfhActivities, ['employment', 'study']), a(Q.ded.wfhStudyHours, 100), a(Q.ded.wfhHoursOverlap, 'yes')]);
    expect(lineById(est, 'ded.wfh').status).toBe('manual_review');
  });
  it('a phone claim on top of the fixed rate is held for review (the rate covers phone at home)', () => {
    const est = run([...fixed, a('ded.phone.any', 'yes'), a(Q.ded.phoneAmount, c(600)), a('ded.phone.paid', 'paid_not_reimbursed'), a(Q.ded.phoneWorkPct, 50)]);
    expect(maybeLine(est, `ded.${Q.ded.phoneAmount}`)?.status).toBe('manual_review');
  });
});
