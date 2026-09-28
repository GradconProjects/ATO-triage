/**
 * Occupation filtering (Section 5, CONTRACT "Occupation filtering").
 *
 * The active tag set decides which work-expense questions are eligible. It is a pure
 * function of the case context and the answers; nothing here writes an answer.
 */
import type { AnswerView } from './answers';
import type { CaseContext, OccupationTag, Question } from './types';
import { ALL_OCCUPATION_TAGS, GENERIC_OCCUPATION_TAGS } from './types';
import { GROUPS, Q } from '../questions/ids';
import { tagsForOccupations } from '../occupations/registry';

const KNOWN_TAGS: ReadonlySet<string> = new Set<string>(ALL_OCCUPATION_TAGS);

function isOccupationTag(v: unknown): v is OccupationTag {
  return typeof v === 'string' && KNOWN_TAGS.has(v);
}

/**
 * activeTagSet =
 *   tagsForOccupations(ctx.profileOccupations)
 *   ∪ for each `employer` item: tagsForOccupations([answer to Q.emp.occupation for that item])
 *   ∪ for each answered question with `addsTags`: tags mapped from its value(s)
 *   ∪ when Q.emp.otherTags is not_sure (any item): every generic tag.
 * `all_employees` is always present when the profile lists an occupation or any employer item exists.
 */
export function activeTagSet(ctx: CaseContext, answers: AnswerView, questions: Question[]): Set<OccupationTag> {
  const tags = tagsForOccupations(ctx.profileOccupations);

  const employers = answers.items(GROUPS.employer);
  for (const item of employers) {
    const occupation = answers.string(Q.emp.occupation, item.id);
    if (occupation) tagsForOccupations([occupation]).forEach((t) => tags.add(t));
  }

  if (ctx.profileOccupations.length > 0 || employers.length > 0) tags.add('all_employees');

  for (const q of questions) {
    const map = q.addsTags;
    if (!map) continue;
    for (const rec of answers.recordsFor(q.id)) {
      if (rec.state !== 'answered') continue;
      const values: unknown[] = Array.isArray(rec.value) ? rec.value : [rec.value];
      for (const v of values) {
        if (typeof v !== 'string') continue;
        map[v]?.forEach((t) => tags.add(t));
      }
    }
  }

  // The "Other / not listed" tick-box: ticks are generic tag values themselves (ids.ts),
  // so they become active tags directly even when the bank does not spell out `addsTags`.
  for (const rec of answers.recordsFor(Q.emp.otherTags)) {
    if (rec.state === 'answered' && Array.isArray(rec.value)) {
      for (const v of rec.value) if (isOccupationTag(v) && GENERIC_OCCUPATION_TAGS.includes(v)) tags.add(v);
    }
  }

  if (answers.recordsFor(Q.emp.otherTags).some((r) => r.state === 'not_sure')) {
    GENERIC_OCCUPATION_TAGS.forEach((t) => tags.add(t));
  }

  return tags;
}

/** A question with no `occupationTags` is universal; otherwise eligible if ANY tag intersects. */
export function isEligible(q: Question, tags: Set<OccupationTag>): boolean {
  if (!q.occupationTags || q.occupationTags.length === 0) return true;
  return q.occupationTags.some((t) => tags.has(t));
}
