import { describe, expect, it } from 'vitest';
import type { OccupationTag, Question } from '@/src/engine/types';
import { GENERIC_OCCUPATION_TAGS } from '@/src/engine/types';
import { activeTagSet, isEligible } from '@/src/engine/occupation-filter';
import { Q } from '@/src/questions/ids';
import { ctx, item, notSure, q, rec, view } from './fixtures';

describe('activeTagSet', () => {
  it('is empty with no occupations, no employers and no tag answers', () => {
    expect(activeTagSet(ctx(), view(), [])).toEqual(new Set());
  });

  it('takes tags from profile occupations including the deep-module tag', () => {
    const tags = activeTagSet(ctx({ profileOccupations: ['disability_support_worker'] }), view(), []);
    expect(tags.has('dsw')).toBe(true);
    expect(tags.has('all_employees')).toBe(true);
    expect(tags.has('vehicle_travel')).toBe(true);
    expect(tags.has('construction')).toBe(false);
    expect(tags.has('tools_equipment')).toBe(false);
  });

  it('unions several profile occupations', () => {
    const tags = activeTagSet(ctx({ profileOccupations: ['chef', 'carpenter'] }), view(), []);
    expect(tags.has('chef_hospitality')).toBe(true);
    expect(tags.has('construction')).toBe(true);
    expect(tags.has('fifo')).toBe(true);
  });

  it('adds tags from each employer item occupation answer (answered only)', () => {
    const items = [item('e1', 'employer', 0), item('e2', 'employer', 1), item('e3', 'employer', 2)];
    const a = view([
      rec(Q.emp.occupation, 'chef', { item: 'e1' }),
      rec(Q.emp.occupation, 'disability_support_worker', { item: 'e2', state: 'imported', source: 'document' }),
      notSure(Q.emp.occupation, 'e3'),
    ], items);
    const tags = activeTagSet(ctx(), a, []);
    expect(tags.has('chef_hospitality')).toBe(true);
    expect(tags.has('dsw')).toBe(false);
    expect(tags.has('all_employees')).toBe(true);
  });

  it('always includes all_employees when any employer item exists, even unanswered', () => {
    const tags = activeTagSet(ctx(), view([], [item('e1', 'employer')]), []);
    expect(tags).toEqual(new Set(['all_employees']));
  });

  it('"other" occupation on the profile gives all_employees only', () => {
    const tags = activeTagSet(ctx({ profileOccupations: ['other'] }), view(), []);
    expect(tags).toEqual(new Set(['all_employees']));
  });

  it('addsTags: single value maps through the map', () => {
    const bank: Question[] = [q({ id: 'bus.sole_trader', type: 'yes_no_unsure', addsTags: { yes: ['sole_trader'] } })];
    expect(activeTagSet(ctx(), view([rec('bus.sole_trader', 'yes')]), bank).has('sole_trader')).toBe(true);
    expect(activeTagSet(ctx(), view([rec('bus.sole_trader', 'no')]), bank).has('sole_trader')).toBe(false);
    expect(activeTagSet(ctx(), view([notSure('bus.sole_trader')]), bank).has('sole_trader')).toBe(false);
    expect(activeTagSet(ctx(), view([rec('bus.sole_trader', 'yes', { state: 'imported', source: 'document' })]), bank).has('sole_trader')).toBe(false);
  });

  it('addsTags: multi values union, across any repeater item', () => {
    const bank: Question[] = [q({ id: 'con.commute', type: 'multi', repeaterGroup: 'employer', addsTags: { fifo_dido: ['fifo'], several: ['vehicle_travel'] } })];
    const a = view([rec('con.commute', ['fifo_dido'], { item: 'e1' }), rec('con.commute', ['several', 'unknown'], { item: 'e2' })]);
    const tags = activeTagSet(ctx(), a, bank);
    expect(tags.has('fifo')).toBe(true);
    expect(tags.has('vehicle_travel')).toBe(true);
    expect(tags.size).toBe(2);
  });

  it('other_tags ticks become active tags directly', () => {
    const a = view([rec(Q.emp.otherTags, ['tools_equipment', 'home_office', 'bogus'], { item: 'e1' })], [item('e1', 'employer')]);
    const tags = activeTagSet(ctx(), a, []);
    expect(tags.has('tools_equipment')).toBe(true);
    expect(tags.has('home_office')).toBe(true);
    expect(tags.has('vehicle_travel')).toBe(false);
  });

  it('other_tags not_sure adds every generic tag', () => {
    const a = view([notSure(Q.emp.otherTags, 'e1', true)], [item('e1', 'employer')]);
    const tags = activeTagSet(ctx(), a, []);
    for (const t of GENERIC_OCCUPATION_TAGS) expect(tags.has(t)).toBe(true);
    expect(tags.has('dsw')).toBe(false);
    expect(tags.has('sole_trader')).toBe(false);
  });
});

describe('isEligible', () => {
  const tags = new Set<OccupationTag>(['all_employees', 'dsw']);
  it('universal questions are always eligible', () => {
    expect(isEligible(q({ id: 'a.b' }), tags)).toBe(true);
    expect(isEligible(q({ id: 'a.b' }), new Set())).toBe(true);
    expect(isEligible(q({ id: 'a.b', occupationTags: [] }), new Set())).toBe(true);
  });
  it('tagged questions need any intersecting tag', () => {
    expect(isEligible(q({ id: 'a.b', occupationTags: ['dsw'] }), tags)).toBe(true);
    expect(isEligible(q({ id: 'a.b', occupationTags: ['construction', 'dsw'] }), tags)).toBe(true);
    expect(isEligible(q({ id: 'a.b', occupationTags: ['construction'] }), tags)).toBe(false);
    expect(isEligible(q({ id: 'a.b', occupationTags: ['all_employees'] }), new Set())).toBe(false);
  });
});
