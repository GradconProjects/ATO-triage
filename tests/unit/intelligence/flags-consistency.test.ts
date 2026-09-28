import { describe, expect, it } from 'vitest';
import { Q, GROUPS } from '@/src/questions/ids';
import { codes, flagsFor, item, notSure, only, q, rec } from './fixtures';

describe('EXPENSE_REIMBURSED', () => {
  const questions = [
    q({ id: Q.ded.phoneAmount, prompt: 'Phone costs?', deduction: { category: 'phone_internet', base: 'ded.phone', treatment: 'D' } }),
    q({ id: Q.ded.toolCost, repeaterGroup: GROUPS.toolItem, prompt: 'Tool cost?', deduction: { category: 'tools', base: 'ded.tool', treatment: 'D' } }),
  ];
  it('fires for an amount marked fully reimbursed, case-level and per item', () => {
    const f = only(
      flagsFor({
        questions,
        items: [item('t1', GROUPS.toolItem)],
        records: [rec(Q.ded.phoneAmount, 60_000), rec('ded.phone.paid', 'paid_fully_reimbursed'), rec(Q.ded.toolCost, 20_000, { item: 't1' }), rec(Q.ded.toolPaid, 'paid_fully_reimbursed', { item: 't1' })],
      }),
      'EXPENSE_REIMBURSED',
    );
    expect(f.map((x) => x.questionIds)).toEqual([[Q.ded.phoneAmount, 'ded.phone.paid'], [`${Q.ded.toolCost}@t1`, `${Q.ded.toolPaid}@t1`]]);
    expect(f[0]!.message).toContain('$600.00');
    expect(f[0]!.kind).toBe('consistency');
  });
  it('does not fire when not reimbursed, partly reimbursed or with no amount', () => {
    expect(codes(flagsFor({ questions, records: [rec(Q.ded.phoneAmount, 60_000), rec('ded.phone.paid', 'paid_not_reimbursed')] }))).not.toContain('EXPENSE_REIMBURSED');
    expect(codes(flagsFor({ questions, records: [rec(Q.ded.phoneAmount, 60_000), rec('ded.phone.paid', 'paid_partly_reimbursed')] }))).not.toContain('EXPENSE_REIMBURSED');
    expect(codes(flagsFor({ questions, records: [rec('ded.phone.paid', 'paid_fully_reimbursed')] }))).not.toContain('EXPENSE_REIMBURSED');
  });
});

describe('CAR_HOME_TO_WORK', () => {
  it('fires for home-to-work trips with no exception or exception none', () => {
    expect(codes(flagsFor({ records: [rec(Q.ded.carTripTypes, ['home_to_work'])] }))).toContain('CAR_HOME_TO_WORK');
    expect(codes(flagsFor({ records: [rec(Q.ded.carTripTypes, ['client_to_client', 'home_to_work']), rec(Q.ded.carException, 'none')] }))).toContain('CAR_HOME_TO_WORK');
  });
  it('does not fire with an exception, a not-sure exception, or no home-to-work trips', () => {
    expect(codes(flagsFor({ records: [rec(Q.ded.carTripTypes, ['home_to_work']), rec(Q.ded.carException, 'bulky_no_storage')] }))).not.toContain('CAR_HOME_TO_WORK');
    expect(codes(flagsFor({ records: [rec(Q.ded.carTripTypes, ['home_to_work']), notSure(Q.ded.carException)] }))).not.toContain('CAR_HOME_TO_WORK');
    expect(codes(flagsFor({ records: [rec(Q.ded.carTripTypes, ['between_workplaces'])] }))).not.toContain('CAR_HOME_TO_WORK');
  });
});

describe('LICENCE_FIRST', () => {
  it('fires for each first-time licence, check or certificate with an amount', () => {
    const f = only(
      flagsFor({
        records: [
          rec(Q.dsw.checksStage, 'first_check'), rec(Q.dsw.checksAmount, 12_000),
          rec(Q.con.licenceStage, 'first'), rec(Q.con.licenceAmount, 30_000),
          rec(Q.chef.certStage, 'first'), rec(Q.chef.certAmount, 9_000),
        ],
      }),
      'LICENCE_FIRST',
    );
    expect(f).toHaveLength(3);
    expect(f.map((x) => x.questionIds)).toContainEqual([Q.con.licenceStage, Q.con.licenceAmount]);
    expect(f.find((x) => x.questionIds[0] === Q.dsw.checksStage)!.message).toContain('$120.00');
  });
  it('does not fire for renewals or a zero amount', () => {
    expect(codes(flagsFor({ records: [rec(Q.con.licenceStage, 'renewal'), rec(Q.con.licenceAmount, 30_000)] }))).not.toContain('LICENCE_FIRST');
    expect(codes(flagsFor({ records: [rec(Q.con.licenceStage, 'first'), rec(Q.con.licenceAmount, 0)] }))).not.toContain('LICENCE_FIRST');
    expect(codes(flagsFor({ records: [rec(Q.con.licenceStage, 'first')] }))).not.toContain('LICENCE_FIRST');
  });
});

describe('RENTAL_INITIAL_REPAIRS', () => {
  const props = [item('r1', GROUPS.rentalProperty)];
  it('fires per property with initial repairs and a repairs amount', () => {
    const f = only(flagsFor({ items: props, records: [rec(Q.rent.initialRepairs, 'yes', { item: 'r1' }), rec(Q.rent.expRepairs, 400_000, { item: 'r1' })] }), 'RENTAL_INITIAL_REPAIRS');
    expect(f).toHaveLength(1);
    expect(f[0]!.questionIds).toEqual([`${Q.rent.initialRepairs}@r1`, `${Q.rent.expRepairs}@r1`]);
    expect(f[0]!.message).toContain('$4,000.00');
  });
  it('does not fire when repairs were not initial or there is no repairs amount', () => {
    expect(codes(flagsFor({ items: props, records: [rec(Q.rent.initialRepairs, 'no', { item: 'r1' }), rec(Q.rent.expRepairs, 400_000, { item: 'r1' })] }))).not.toContain('RENTAL_INITIAL_REPAIRS');
    expect(codes(flagsFor({ items: props, records: [rec(Q.rent.initialRepairs, 'yes', { item: 'r1' })] }))).not.toContain('RENTAL_INITIAL_REPAIRS');
  });
});
