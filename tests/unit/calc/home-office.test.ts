import { describe, expect, it } from 'vitest';
import { Q } from '@/src/questions/ids';
import { a, c, lineById, notSure, run } from './fixture';

const fixed = (record: string) => [a(Q.ded.wfhAny, 'yes'), a(Q.ded.wfhMethod, 'fixed_rate'), a(Q.ded.wfhHours, 500), a(Q.ded.wfhHoursRecord, record)];

describe('working from home', () => {
  it('fixed rate with a full record: hours x rate (67c in the fixture)', () => {
    const est = run(fixed('full_record'));
    expect(lineById(est, 'ded.wfh').amountCents).toBe(500 * 67);
    expect(est.moduleStatus['home_office']).toBe('computed');
  });
  it('fixed rate with a representative 4-week record', () => {
    expect(lineById(run(fixed('representative_4_weeks')), 'ded.wfh').amountCents).toBe(33500);
  });
  it('estimate of hours -> review with the amount as information and uncertain', () => {
    const est = run(fixed('estimate'));
    const l = lineById(est, 'ded.wfh');
    expect(l.status).toBe('manual_review');
    expect(l.amountCents).toBe(33500);
    expect(est.totals.deductionsCents).toBe(0);
    expect(est.uncertainInputs).toContain(Q.ded.wfhHours);
  });
  it('no record -> review', () => {
    expect(lineById(run(fixed('none')), 'ded.wfh').status).toBe('manual_review');
  });
  it('record not sure -> review', () => {
    expect(lineById(run([a(Q.ded.wfhAny, 'yes'), a(Q.ded.wfhMethod, 'fixed_rate'), a(Q.ded.wfhHours, 500), notSure(Q.ded.wfhHoursRecord)]), 'ded.wfh').status).toBe('manual_review');
  });
  it('record unanswered -> review', () => {
    expect(lineById(run([a(Q.ded.wfhAny, 'yes'), a(Q.ded.wfhMethod, 'fixed_rate'), a(Q.ded.wfhHours, 500)]), 'ded.wfh').status).toBe('manual_review');
  });
  it('hours missing -> review', () => {
    expect(lineById(run([a(Q.ded.wfhAny, 'yes'), a(Q.ded.wfhMethod, 'fixed_rate')]), 'ded.wfh').status).toBe('manual_review');
  });
  it('actual cost x work %', () => {
    const est = run([a(Q.ded.wfhAny, 'yes'), a(Q.ded.wfhMethod, 'actual'), a(Q.ded.wfhActualCosts, c(2000)), a(Q.ded.wfhWorkPct, 30)]);
    expect(lineById(est, 'ded.wfh').amountCents).toBe(c(600));
  });
  it('actual without work % -> review', () => {
    expect(lineById(run([a(Q.ded.wfhAny, 'yes'), a(Q.ded.wfhMethod, 'actual'), a(Q.ded.wfhActualCosts, c(2000))]), 'ded.wfh').status).toBe('manual_review');
  });
  it('method not sure -> review', () => {
    expect(lineById(run([a(Q.ded.wfhAny, 'yes'), notSure(Q.ded.wfhMethod)]), 'ded.wfh').status).toBe('manual_review');
  });
  it('wfhAny no / nothing -> not applicable; not sure -> review', () => {
    expect(run([a(Q.ded.wfhAny, 'no')]).moduleStatus['home_office']).toBe('not_applicable');
    expect(run([]).moduleStatus['home_office']).toBe('not_applicable');
    expect(run([notSure(Q.ded.wfhAny)]).moduleStatus['home_office']).toBe('manual_review');
  });
});
