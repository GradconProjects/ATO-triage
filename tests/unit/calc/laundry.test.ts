import { describe, expect, it } from 'vitest';
import { Q } from '@/src/questions/ids';
import { a, lineById, notSure, run } from './fixture';

const eligible = [a(Q.ded.clothingType, ['compulsory_uniform'])];

describe('laundry', () => {
  it('3 work-only loads x 48 weeks with receipts = $144', () => {
    const est = run([...eligible, a(Q.ded.laundryAny, 'yes'), a(Q.ded.laundryLoadsWorkOnly, 3), a(Q.ded.laundryWeeks, 48), a(Q.ded.laundryEvidence, 'receipts')]);
    expect(lineById(est, 'ded.laundry').amountCents).toBe(14400);
    expect(est.moduleStatus['laundry']).toBe('computed');
  });
  it('mixed loads at 50c', () => {
    const est = run([...eligible, a(Q.ded.laundryAny, 'yes'), a(Q.ded.laundryLoadsWorkOnly, 2), a(Q.ded.laundryLoadsMixed, 2), a(Q.ded.laundryWeeks, 40), a(Q.ded.laundryEvidence, 'diary')]);
    expect(lineById(est, 'ded.laundry').amountCents).toBe((200 + 100) * 40);
  });
  it('no evidence caps at $150', () => {
    const est = run([...eligible, a(Q.ded.laundryAny, 'yes'), a(Q.ded.laundryLoadsWorkOnly, 4), a(Q.ded.laundryWeeks, 48), a(Q.ded.laundryEvidence, 'none')]);
    const l = lineById(est, 'ded.laundry');
    expect(l.amountCents).toBe(15000);
    expect(l.note).toContain('Capped');
  });
  it('estimate only also caps', () => {
    expect(lineById(run([...eligible, a(Q.ded.laundryAny, 'yes'), a(Q.ded.laundryLoadsWorkOnly, 4), a(Q.ded.laundryWeeks, 48), a(Q.ded.laundryEvidence, 'estimate_only')]), 'ded.laundry').amountCents).toBe(15000);
  });
  it('evidence unanswered is treated as no evidence', () => {
    expect(lineById(run([...eligible, a(Q.ded.laundryAny, 'yes'), a(Q.ded.laundryLoadsWorkOnly, 4), a(Q.ded.laundryWeeks, 48)]), 'ded.laundry').amountCents).toBe(15000);
  });
  it('with evidence the full amount applies', () => {
    expect(lineById(run([...eligible, a(Q.ded.laundryAny, 'yes'), a(Q.ded.laundryLoadsWorkOnly, 4), a(Q.ded.laundryWeeks, 48), a(Q.ded.laundryEvidence, ['receipts', 'diary'])]), 'ded.laundry').amountCents).toBe(19200);
  });
  it('under the cap with no evidence is not reduced', () => {
    expect(lineById(run([...eligible, a(Q.ded.laundryAny, 'yes'), a(Q.ded.laundryLoadsWorkOnly, 1), a(Q.ded.laundryWeeks, 48), a(Q.ded.laundryEvidence, 'none')]), 'ded.laundry').amountCents).toBe(4800);
  });
  it('no eligible clothing -> review', () => {
    const est = run([a(Q.ded.clothingType, ['plain']), a(Q.ded.laundryAny, 'yes'), a(Q.ded.laundryLoadsWorkOnly, 3), a(Q.ded.laundryWeeks, 48)]);
    expect(lineById(est, 'ded.laundry').status).toBe('manual_review');
    expect(lineById(est, 'ded.laundry').provisional).toBe(true);
  });
  it('DSW laundry with a logo uniform', () => {
    expect(lineById(run([a(Q.dsw.clothing, ['compulsory_logo']), a(Q.dsw.laundry, 'yes'), a(Q.ded.laundryLoadsWorkOnly, 2), a(Q.ded.laundryWeeks, 50), a(Q.ded.laundryEvidence, 'receipts')]), 'ded.laundry').amountCents).toBe(10000);
  });
  it('chef laundry: plain black only -> review; jacket -> computed', () => {
    expect(lineById(run([a(Q.chef.clothing, ['plain_black']), a(Q.chef.laundry, 'yes'), a(Q.ded.laundryLoadsWorkOnly, 3), a(Q.ded.laundryWeeks, 48)]), 'ded.laundry').status).toBe('manual_review');
    expect(lineById(run([a(Q.chef.clothing, ['jacket']), a(Q.chef.laundry, 'yes'), a(Q.ded.laundryLoadsWorkOnly, 3), a(Q.ded.laundryWeeks, 48), a(Q.ded.laundryEvidence, 'receipts')]), 'ded.laundry').amountCents).toBe(14400);
  });
  it('weeks missing -> review', () => {
    expect(lineById(run([...eligible, a(Q.ded.laundryAny, 'yes'), a(Q.ded.laundryLoadsWorkOnly, 3)]), 'ded.laundry').status).toBe('manual_review');
  });
  it('not triggered -> not applicable; not sure -> review', () => {
    expect(run([...eligible, a(Q.ded.laundryAny, 'no')]).moduleStatus['laundry']).toBe('not_applicable');
    expect(run([...eligible, notSure(Q.ded.laundryAny)]).moduleStatus['laundry']).toBe('manual_review');
  });
});
