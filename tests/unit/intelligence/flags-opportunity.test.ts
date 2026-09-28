import { describe, expect, it } from 'vitest';
import { Q, GROUPS } from '@/src/questions/ids';
import { FLAG_RULES } from '@/src/intelligence/flags';
import { codes, dedLine, estimate, flagsFor, item, only, rec } from './fixtures';

describe('ALLOWANCE_NO_EXPENSE', () => {
  const allowance = (type: string, id = 'a1') => [rec(Q.allow.type, type, { item: id }), rec(Q.allow.amount, 50_000, { item: id })];
  const items = [item('a1', GROUPS.allowance)];
  it('fires per allowance item without a matching computed deduction line', () => {
    const f = only(flagsFor({ items, records: allowance('tool') }), 'ALLOWANCE_NO_EXPENSE');
    expect(f).toHaveLength(1);
    expect(f[0]!.questionIds).toEqual([`${Q.allow.type}@a1`]);
    expect(f[0]!.message).toContain('tool allowance of $500.00');
    expect(f[0]!.message).toContain('check whether');
    expect(f[0]!.severity).toBe('info');
  });
  it('maps every allowance type to its categories', () => {
    const cases: Array<[string, string]> = [['car_km', 'car'], ['tool', 'tools'], ['uniform_laundry', 'laundry'], ['uniform_laundry', 'clothing'], ['travel', 'work_travel'], ['travel', 'overnight_travel'], ['meal', 'overnight_travel']];
    for (const [type, category] of cases) {
      expect(codes(flagsFor({ items, records: allowance(type) })), type).toContain('ALLOWANCE_NO_EXPENSE');
      expect(codes(flagsFor({ items, records: allowance(type), estimate: estimate({ lines: [dedLine(category, 10_000)] }) })), `${type}/${category}`).not.toContain('ALLOWANCE_NO_EXPENSE');
    }
  });
  it('does not fire for reimbursements, unrelated types, or excluded/zero lines only', () => {
    expect(codes(flagsFor({ items, records: [...allowance('tool'), rec(Q.allow.nature, 'reimbursement', { item: 'a1' })] }))).not.toContain('ALLOWANCE_NO_EXPENSE');
    expect(codes(flagsFor({ items, records: allowance('site_industry') }))).not.toContain('ALLOWANCE_NO_EXPENSE');
    const excluded = estimate({ lines: [{ ...dedLine('tools', 10_000), status: 'excluded' }] });
    expect(codes(flagsFor({ items, records: allowance('tool'), estimate: excluded }))).toContain('ALLOWANCE_NO_EXPENSE');
  });
});

describe('DSW_CLIENT_TRAVEL_UNCLAIMED', () => {
  it('fires for a support worker who drove between clients with no car line', () => {
    const f = only(flagsFor({ tags: ['dsw'], records: [rec(Q.dsw.clientToClient, 'yes_own_car')] }), 'DSW_CLIENT_TRAVEL_UNCLAIMED');
    expect(f).toHaveLength(1);
    expect(f[0]!.message).not.toMatch(/you can claim/i);
  });
  it('does not fire without the dsw tag, with an employer car, or with a car line', () => {
    expect(codes(flagsFor({ records: [rec(Q.dsw.clientToClient, 'yes_own_car')] }))).not.toContain('DSW_CLIENT_TRAVEL_UNCLAIMED');
    expect(codes(flagsFor({ tags: ['dsw'], records: [rec(Q.dsw.clientToClient, 'yes_employer_car')] }))).not.toContain('DSW_CLIENT_TRAVEL_UNCLAIMED');
    expect(codes(flagsFor({ tags: ['dsw'], records: [rec(Q.dsw.clientToClient, 'yes_own_car')], estimate: estimate({ lines: [dedLine('car', 88_000)] }) }))).not.toContain('DSW_CLIENT_TRAVEL_UNCLAIMED');
  });
});

describe('CONSTR_PPE_UNCLAIMED', () => {
  it('fires for construction PPE with no amount or zero', () => {
    expect(codes(flagsFor({ tags: ['construction'], records: [rec(Q.con.ppe, ['boots', 'hi_vis'])] }))).toContain('CONSTR_PPE_UNCLAIMED');
    expect(codes(flagsFor({ tags: ['construction'], records: [rec(Q.con.ppe, ['boots']), rec(Q.con.ppeAmount, 0)] }))).toContain('CONSTR_PPE_UNCLAIMED');
  });
  it('does not fire with an amount, with none, or without the tag', () => {
    expect(codes(flagsFor({ tags: ['construction'], records: [rec(Q.con.ppe, ['boots']), rec(Q.con.ppeAmount, 15_000)] }))).not.toContain('CONSTR_PPE_UNCLAIMED');
    expect(codes(flagsFor({ tags: ['construction'], records: [rec(Q.con.ppe, ['none'])] }))).not.toContain('CONSTR_PPE_UNCLAIMED');
    expect(codes(flagsFor({ records: [rec(Q.con.ppe, ['boots'])] }))).not.toContain('CONSTR_PPE_UNCLAIMED');
  });
});

describe('CHEF_LAUNDRY_UNCLAIMED', () => {
  it('fires for eligible chef clothing without a laundry line', () => {
    expect(codes(flagsFor({ tags: ['chef_hospitality'], records: [rec(Q.chef.clothing, ['checked_pants', 'plain_black'])] }))).toContain('CHEF_LAUNDRY_UNCLAIMED');
  });
  it('does not fire for plain black only, with a laundry line, or without the tag', () => {
    expect(codes(flagsFor({ tags: ['chef_hospitality'], records: [rec(Q.chef.clothing, ['plain_black'])] }))).not.toContain('CHEF_LAUNDRY_UNCLAIMED');
    expect(codes(flagsFor({ tags: ['chef_hospitality'], records: [rec(Q.chef.clothing, ['jacket'])], estimate: estimate({ lines: [dedLine('laundry', 15_000)] }) }))).not.toContain('CHEF_LAUNDRY_UNCLAIMED');
    expect(codes(flagsFor({ records: [rec(Q.chef.clothing, ['jacket'])] }))).not.toContain('CHEF_LAUNDRY_UNCLAIMED');
  });
});

describe('MLS_EXPOSURE', () => {
  const taxable = (cents: number, mls = 0) => estimate({ totals: { taxableIncomeCents: cents, mlsCents: mls } });
  it('fires for a single with no hospital cover at 90% of the base threshold ($90,900) and above', () => {
    expect(codes(flagsFor({ records: [rec(Q.phi.cover, 'none')], estimate: taxable(9_090_000) }))).toContain('MLS_EXPOSURE');
    expect(codes(flagsFor({ records: [rec(Q.phi.cover, 'extras_only')], estimate: taxable(12_000_000) }))).toContain('MLS_EXPOSURE');
    const f = only(flagsFor({ records: [rec(Q.phi.cover, 'part_year')], estimate: taxable(12_000_000, 120_000) }), 'MLS_EXPOSURE');
    expect(f[0]!.message).toContain('$1,200.00');
    expect(f[0]!.message).toMatch(/check whether/i);
  });
  it('adds reportable fringe benefits and super to reach the threshold', () => {
    const items = [item('e1', GROUPS.employer)];
    expect(codes(flagsFor({ items, records: [rec(Q.phi.cover, 'none'), rec(Q.emp.rfb, 500_000, { item: 'e1' }), rec(Q.emp.resc, 500_000, { item: 'e1' })], estimate: taxable(8_100_000) }))).toContain('MLS_EXPOSURE');
  });
  it('uses the family threshold with spouse income and the child increment', () => {
    const family = [rec(Q.phi.cover, 'none'), rec(Q.fam.spouse, 'all_year'), rec(Q.fam.spouseTaxableIncome, 9_000_000)];
    expect(codes(flagsFor({ records: family, estimate: taxable(10_000_000) }))).toContain('MLS_EXPOSURE');
    expect(codes(flagsFor({ records: [...family.slice(0, 2), rec(Q.fam.spouseTaxableIncome, 5_000_000)], estimate: taxable(10_000_000) }))).not.toContain('MLS_EXPOSURE');
    const kids = [rec(Q.phi.cover, 'none'), rec(Q.fam.dependantsCount, 3)];
    expect(codes(flagsFor({ records: kids, estimate: taxable(18_450_000) }))).toContain('MLS_EXPOSURE');
    expect(codes(flagsFor({ records: kids, estimate: taxable(18_449_999) }))).not.toContain('MLS_EXPOSURE');
  });
  it('does not fire below 90% of the threshold or with whole-year cover', () => {
    expect(codes(flagsFor({ records: [rec(Q.phi.cover, 'none')], estimate: taxable(9_089_999) }))).not.toContain('MLS_EXPOSURE');
    expect(codes(flagsFor({ records: [rec(Q.phi.cover, 'whole_year')], estimate: taxable(20_000_000) }))).not.toContain('MLS_EXPOSURE');
    expect(codes(flagsFor({ estimate: taxable(20_000_000) }))).not.toContain('MLS_EXPOSURE');
  });
});

describe('message wording', () => {
  it('no rule message ever says "you can claim"', () => {
    for (const rule of FLAG_RULES) {
      const source = `${rule.message.toString()} ${rule.instances?.toString() ?? ''}`;
      expect(source.toLowerCase(), rule.code).not.toContain('you can claim');
    }
  });
});
