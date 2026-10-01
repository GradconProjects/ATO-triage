import { describe, expect, it } from 'vitest';
import { GROUPS, Q } from '@/src/questions/ids';
import { getRuleSet } from '@/src/rules';
import { a, c, item, lineById, run } from './fixture';

// Real 2025-26 rule set: tier 2 (family 236,001-316,000) under 65 = 8.095% (Jul-Mar), 8.038% (Apr-Jun).
const rules = getRuleSet('2025-26');
const items = [item('p1', GROUPS.phiPolicy)];
const family = (own: number) => [
  a(Q.emp.gross, c(own), 'e1'), a(Q.fam.spouse, 'all_year'), a(Q.fam.spouseTaxableIncome, c(240000)), a(Q.fam.spouseRfb, 0), a(Q.fam.spouseRsc, 0),
  a(Q.phi.cover, 'whole_year'), a(Q.phi.policySource, 'statement'), a(Q.phi.policyCoveredAs, 'adult', 'p1'),
];
// $4,500 eligible family premiums for the year, split by the insurer into two equal adult shares
// per statement period: Jul-Mar 3,375 (1,687.50 each), Apr-Jun 1,125 (562.50 each); nothing received upfront.
const myLines = [a(Q.phi.policySource, 'statement', 'p1'), a(Q.phi.policyJ1, c(1687.5), 'p1'), a(Q.phi.policyK1, 0, 'p1'), a(Q.phi.policyL1, '30', 'p1'), a(Q.phi.policyJ2, c(562.5), 'p1'), a(Q.phi.policyK2, 0, 'p1'), a(Q.phi.policyL2, '31', 'p1')];
const spouseLines = [a(Q.phi.policySpouseJ1, c(1687.5), 'p1'), a(Q.phi.policySpouseK1, 0, 'p1'), a(Q.phi.policySpouseL1, '30', 'p1'), a(Q.phi.policySpouseJ2, c(562.5), 'p1'), a(Q.phi.policySpouseK2, 0, 'p1'), a(Q.phi.policySpouseL2, '31', 'p1')];
const opts = { items, rules, fy: '2025-26' as const };

describe('PHI rebate with family premiums and spouse elections', () => {
  it('equal individual shares: about $181.81 in each return (statement-level rounding)', () => {
    const est = run([...family(10000), ...myLines, a(Q.phi.policyElection, 'my_share', 'p1'), a(Q.phi.policySpouseConfirmed, 'yes', 'p1')], opts);
    // 1,687.50 x 8.095% = 136.60; 562.50 x 8.038% = 45.21
    expect(lineById(est, 'offset.phi@p1').amountCents).toBe(18181);
    expect(lineById(est, 'offset.phi@p1').section).toBe('refundable_offsets');
    expect(est.totals.refundableOffsetsCents).toBe(18181);
  });
  it('claiming both eligible shares: about $363.62 on one return', () => {
    const est = run([...family(10000), ...myLines, ...spouseLines, a(Q.phi.policyElection, 'both_shares', 'p1'), a(Q.phi.policySpouseShare, 'yes', 'p1'), a(Q.phi.policySpouseConfirmed, 'yes', 'p1')], opts);
    expect(lineById(est, 'offset.phi@p1').amountCents).toBe(36362);
    expect(lineById(est, 'offset.phi@p1').detail?.['includes']).toContain('spouse');
  });
  it('the other spouse then gets nothing for the same premiums (never $363 twice)', () => {
    const est = run([...family(10000), ...myLines, a(Q.phi.policyElection, 'spouse_claims_mine', 'p1'), a(Q.phi.policySpouseConfirmed, 'yes', 'p1')], opts);
    expect(lineById(est, 'offset.phi@p1').status).toBe('excluded');
    expect(est.totals.refundableOffsetsCents).toBe(0);
  });
  it('both shares are not included without the conditions, the spouse\'s own lines and their confirmation', () => {
    const noConditions = run([...family(10000), ...myLines, ...spouseLines, a(Q.phi.policyElection, 'both_shares', 'p1'), a(Q.phi.policySpouseConfirmed, 'yes', 'p1')], opts);
    expect(lineById(noConditions, 'offset.phi@p1').status).toBe('manual_review');
    const noSpouseLines = run([...family(10000), ...myLines, a(Q.phi.policyElection, 'both_shares', 'p1'), a(Q.phi.policySpouseShare, 'yes', 'p1'), a(Q.phi.policySpouseConfirmed, 'yes', 'p1')], opts);
    expect(lineById(noSpouseLines, 'offset.phi@p1').status).toBe('manual_review');
    const unconfirmed = run([...family(10000), ...myLines, ...spouseLines, a(Q.phi.policyElection, 'both_shares', 'p1'), a(Q.phi.policySpouseShare, 'yes', 'p1')], opts);
    expect(lineById(unconfirmed, 'offset.phi@p1').status).toBe('manual_review');
  });
  it('an unresolved election is review, not zero', () => {
    const est = run([...family(10000), ...myLines], opts);
    expect(lineById(est, 'offset.phi@p1').status).toBe('manual_review');
    expect(est.manualReview.some((r) => r.module === 'phi_rebate')).toBe(true);
  });
  it('premiums already allocated by the insurer are not halved again', () => {
    const est = run([...family(10000), ...myLines, a(Q.phi.policyElection, 'my_share', 'p1'), a(Q.phi.policySpouseConfirmed, 'yes', 'p1')], opts);
    expect(lineById(est, 'offset.phi@p1').detail?.['eligiblePremiumsCents']).toBe(c(2250));
  });
  it('upfront rebate already received: no adjustment when it matches, recovery when it exceeds', () => {
    const matched = [a(Q.phi.policyJ1, c(1687.5), 'p1'), a(Q.phi.policyK1, c(136.6), 'p1'), a(Q.phi.policyL1, '30', 'p1'), a(Q.phi.policyJ2, c(562.5), 'p1'), a(Q.phi.policyK2, c(45.21), 'p1'), a(Q.phi.policyL2, '31', 'p1')];
    const est = run([...family(10000), a(Q.phi.policySource, 'statement', 'p1'), ...matched, a(Q.phi.policyElection, 'my_share', 'p1'), a(Q.phi.policySpouseConfirmed, 'yes', 'p1')], opts);
    expect(lineById(est, 'offset.phi@p1').amountCents).toBe(0);
    const base = [a(Q.phi.policyJ1, c(1687.5), 'p1'), a(Q.phi.policyK1, c(273.2), 'p1'), a(Q.phi.policyL1, '30', 'p1'), a(Q.phi.policyJ2, c(562.5), 'p1'), a(Q.phi.policyK2, c(90.42), 'p1'), a(Q.phi.policyL2, '31', 'p1')];
    const over = run([...family(10000), a(Q.phi.policySource, 'statement', 'p1'), ...base, a(Q.phi.policyElection, 'my_share', 'p1'), a(Q.phi.policySpouseConfirmed, 'yes', 'p1')], opts);
    expect(over.totals.phiLiabilityCents).toBe(18181);
    expect(lineById(over, 'offset.phi@p1').section).toBe('phi_recovery');
  });
  it('split statement periods use each period\'s own rate', () => {
    const est = run([...family(10000), ...myLines, a(Q.phi.policyElection, 'my_share', 'p1'), a(Q.phi.policySpouseConfirmed, 'yes', 'p1')], opts);
    expect(lineById(est, 'offset.phi@p1').formula).toContain('8.095%');
    expect(lineById(est, 'offset.phi@p1').formula).toContain('8.038%');
  });
  it('a total family premium with no confirmed allocation is unresolved for a couple', () => {
    const est = run([...family(10000).filter((x) => x.id !== Q.phi.policySource), a(Q.phi.policyPremiums, c(4500), 'p1'), a(Q.phi.policyRebate, 0, 'p1'), a(Q.phi.policyElection, 'my_share', 'p1')], opts);
    expect(lineById(est, 'offset.phi@p1').status).toBe('manual_review');
    expect(est.totals.refundableOffsetsCents).toBe(0);
  });
  it('a spouse\'s reportable super answered "not sure" leaves the tier unresolved', () => {
    const est = run([...family(10000).filter((x) => x.id !== Q.fam.spouseRsc), a(Q.fam.spouseRsc, 'not_sure', null), ...myLines, a(Q.phi.policyElection, 'my_share', 'p1')].map((x) => (x.id === Q.fam.spouseRsc ? { ...x, state: 'not_sure' as const } : x)), opts);
    expect(lineById(est, 'offset.phi@p1').status).toBe('manual_review');
  });
  it('a low-income taxpayer with nil tax still receives the refundable rebate', () => {
    const est = run([...family(8000), ...myLines, a(Q.phi.policyElection, 'my_share', 'p1'), a(Q.phi.policySpouseConfirmed, 'yes', 'p1')], opts);
    expect(est.totals.grossTaxCents).toBe(0);
    expect(est.totals.resultCents).toBe(18181);
  });
});

describe('PHI elections across linked profiles', () => {
  it('flags conflicting elections for the same membership number', async () => {
    const { PHI_ELECTION_CONFLICT } = await import('@/src/intelligence/consistency');
    const { mkInput } = await import('./fixture');
    const input = mkInput([a(Q.phi.policyMembership, 'C 123456', 'p1'), a(Q.phi.policyElection, 'both_shares', 'p1')], { items });
    const ctx = { answers: input.answers, visible: input.visible, linkedPhi: [{ profileName: 'Spouse', membership: 'C123456', election: 'my_share' }] } as never;
    expect(PHI_ELECTION_CONFLICT.instances!(input.answers, ctx)).toHaveLength(1);
    const ok = { answers: input.answers, visible: input.visible, linkedPhi: [{ profileName: 'Spouse', membership: 'C123456', election: 'spouse_claims_mine' }] } as never;
    expect(PHI_ELECTION_CONFLICT.instances!(input.answers, ok)).toHaveLength(0);
  });
});
