import { describe, expect, it } from 'vitest';
import { AnswerView, activeTagSet, visibleQuestions } from '@/src/engine';
import type { AnswerRecord, CaseContext, Question, RepeaterItem } from '@/src/engine/types';
import { QUESTION_BANK } from '@/src/questions';
import { Q } from '@/src/questions/ids';

const BANK = [...QUESTION_BANK] as Question[];

function rec(questionId: string, value: unknown, repeaterItemId: string | null = null): AnswerRecord {
  return { questionId, repeaterItemId, value, state: 'answered', source: 'user', version: 1 };
}

function visibleIds(occupations: string[], answers: AnswerRecord[] = [], items: RepeaterItem[] = []): Set<string> {
  const ctx: CaseContext = { fy: '2025-26', profileOccupations: occupations };
  const view = new AnswerView(answers, items);
  const tags = activeTagSet(ctx, view, BANK);
  return new Set(visibleQuestions(BANK, view, ctx, tags).map((v) => v.question.id));
}

const startsWith = (ids: Set<string>, prefix: string) => [...ids].filter((id) => id.startsWith(prefix));

describe('question visibility by occupation', () => {
  it('a chef sees chef.* and no dsw.* or con.* questions', () => {
    const ids = visibleIds(['chef']);
    expect(startsWith(ids, 'dsw.')).toEqual([]);
    expect(startsWith(ids, 'con.')).toEqual([]);
    expect(startsWith(ids, 'chef.').length).toBeGreaterThan(5);
    expect(ids.has(Q.chef.knivesAny)).toBe(true);
    // chef routes tools through chef.knives.any, so the generic tools screen is hidden
    expect(ids.has(Q.ded.toolAny)).toBe(false);
    expect(ids.has(Q.ded.laundryAny)).toBe(false);
  });

  it('a disability support worker sees dsw.* and no con.* or chef.* questions', () => {
    const ids = visibleIds(['disability_support_worker']);
    expect(startsWith(ids, 'con.')).toEqual([]);
    expect(startsWith(ids, 'chef.')).toEqual([]);
    expect(startsWith(ids, 'dsw.').length).toBeGreaterThan(5);
    expect(ids.has(Q.dsw.clientToClient)).toBe(true);
    expect(ids.has(Q.ded.carAny)).toBe(true); // vehicle_travel tag
    expect(ids.has(Q.ded.wfhAny)).toBe(false); // routed via dsw.home_office
    expect(ids.has(Q.ded.toolAny)).toBe(false); // no tools_equipment tag
  });

  it('a construction worker sees con.* and no dsw.* or chef.* questions', () => {
    const ids = visibleIds(['carpenter']);
    expect(startsWith(ids, 'dsw.')).toEqual([]);
    expect(startsWith(ids, 'chef.')).toEqual([]);
    expect(startsWith(ids, 'con.').length).toBeGreaterThan(5);
    expect(ids.has(Q.con.commute)).toBe(true);
    expect(ids.has(Q.allow.any)).toBe(false); // routed via con.allowances
    expect(ids.has('ded.overnight.any')).toBe(false); // routed via con.overnight
  });

  it('"other" with no ticks sees no deep module and no tagged deduction categories', () => {
    const ids = visibleIds(['other']);
    expect(startsWith(ids, 'dsw.')).toEqual([]);
    expect(startsWith(ids, 'con.')).toEqual([]);
    expect(startsWith(ids, 'chef.')).toEqual([]);
    expect(ids.has(Q.ded.carAny)).toBe(false);
    expect(ids.has('ded.gifts.any')).toBe(true); // universal
  });

  it('universal questions are visible to everyone', () => {
    for (const occ of ['chef', 'disability_support_worker', 'carpenter', 'other', 'office_professional']) {
      const ids = visibleIds([occ]);
      expect(ids.has(Q.res.status), occ).toBe(true);
      expect(ids.has(Q.emp.repeater), occ).toBe(true);
      expect(ids.has(Q.core.fy), occ).toBe(true);
      expect(ids.has(Q.fam.spouse), occ).toBe(true);
      expect(ids.has(Q.inv.interestAny), occ).toBe(true);
      expect(ids.has(Q.loan.types), occ).toBe(true);
    }
  });

  it('rent.any = yes reveals the rental repeater', () => {
    expect(visibleIds(['chef']).has(Q.rent.repeater)).toBe(false);
    expect(visibleIds(['chef'], [rec(Q.rent.any, 'yes')]).has(Q.rent.repeater)).toBe(true);
    expect(visibleIds(['chef'], [rec(Q.rent.any, 'no')]).has(Q.rent.repeater)).toBe(false);
  });

  it('a deep-module trigger reveals the shared M14 detail questions', () => {
    const ids = visibleIds(['disability_support_worker'], [rec(Q.dsw.phone, 'yes'), rec(Q.dsw.homeOffice, 'yes')]);
    expect(ids.has(Q.ded.phoneAmount)).toBe(true);
    expect(ids.has(Q.ded.wfhMethod)).toBe(true);
    const off = visibleIds(['disability_support_worker'], [rec(Q.dsw.phone, 'no')]);
    expect(off.has(Q.ded.phoneAmount)).toBe(false);
  });

  it('an employer item occupation adds deep-module questions', () => {
    const items: RepeaterItem[] = [{ id: 'e1', groupId: 'employer', sortOrder: 0 }];
    const ids = visibleIds(['other'], [rec(Q.emp.occupation, 'chef', 'e1')], items);
    expect(startsWith(ids, 'chef.').length).toBeGreaterThan(5);
  });
});
