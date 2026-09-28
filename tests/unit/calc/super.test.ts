import { describe, expect, it } from 'vitest';
import { Q } from '@/src/questions/ids';
import { a, c, lineById, maybeLine, notSure, run } from './fixture';

describe('personal super contribution deduction', () => {
  it('acknowledged notice -> deductible', () => {
    const est = run([a(Q.supc.personalAmount, c(10000)), a(Q.supc.noi, 'acknowledged')]);
    expect(lineById(est, 'ded.super').amountCents).toBe(c(10000));
    expect(est.totals.deductionsCents).toBe(c(10000));
    expect(est.totals.workRelatedDeductionsCents).toBe(0);
  });
  it('capped at the concessional cap less employer super', () => {
    const est = run([a(Q.emp.resc, c(25000), 'e1'), a(Q.supc.personalAmount, c(10000)), a(Q.supc.noi, 'acknowledged')]);
    expect(lineById(est, 'ded.super').amountCents).toBe(c(5000));
    expect(lineById(est, 'ded.super.excess').amountCents).toBe(c(5000));
    expect(lineById(est, 'ded.super.excess').status).toBe('excluded');
  });
  it('employer super already at the cap -> nothing deductible', () => {
    const est = run([a(Q.emp.resc, c(30000), 'e1'), a(Q.supc.personalAmount, c(1000)), a(Q.supc.noi, 'acknowledged')]);
    expect(lineById(est, 'ded.super').amountCents).toBe(0);
    expect(lineById(est, 'ded.super.excess').amountCents).toBe(c(1000));
  });
  it('contribution exactly at the cap', () => {
    const est = run([a(Q.supc.personalAmount, c(30000)), a(Q.supc.noi, 'acknowledged')]);
    expect(lineById(est, 'ded.super').amountCents).toBe(c(30000));
    expect(maybeLine(est, 'ded.super.excess')).toBeUndefined();
  });
  it('notice not yet lodged -> excluded with a blocker note', () => {
    const est = run([a(Q.supc.personalAmount, c(10000)), a(Q.supc.noi, 'not_yet')]);
    const l = lineById(est, 'ded.super');
    expect(l.status).toBe('excluded');
    expect(l.note).toContain('notice of intent');
    expect(est.totals.deductionsCents).toBe(0);
  });
  it('lodged but not acknowledged -> excluded', () => {
    expect(lineById(run([a(Q.supc.personalAmount, c(10000)), a(Q.supc.noi, 'lodged_not_acknowledged')]), 'ded.super').status).toBe('excluded');
  });
  it('notice not sure -> excluded', () => {
    expect(lineById(run([a(Q.supc.personalAmount, c(10000)), notSure(Q.supc.noi)]), 'ded.super').status).toBe('excluded');
  });
  it('notice unanswered -> excluded', () => {
    expect(lineById(run([a(Q.supc.personalAmount, c(10000))]), 'ded.super').status).toBe('excluded');
  });
  it('no contribution -> not applicable', () => {
    expect(run([a(Q.supc.personalAny, 'no')]).moduleStatus['super_contribution']).toBe('not_applicable');
  });
  it('not sure whether contributed -> review', () => {
    expect(run([notSure(Q.supc.personalAny)]).moduleStatus['super_contribution']).toBe('manual_review');
  });
});
