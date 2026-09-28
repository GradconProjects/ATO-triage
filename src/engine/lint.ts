/**
 * Question bank lint (Section 4 "Option-set rules" plus the structural rules in CONTRACT
 * "Things that must never exist"). Returns [] when the bank is clean; each string is one
 * problem, prefixed with the rule number and the question id.
 */
import type { Condition, Question } from './types';

/** Single/multi questions that legitimately have no `not_sure` option. */
export const NOT_SURE_ALLOWLIST: readonly string[] = ['core.fy', 'core.purpose', 'comp.lse.fy', 'gate.checks'] as const;

export const ID_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

const FORBIDDEN_ID_FRAGMENTS = ['tfn', 'bank_account', 'bsb', 'date_of_birth', 'dob'] as const;

const YES_NO_UNSURE_VALUES = ['yes', 'no', 'not_sure'] as const;

/** Id segments that contain a forbidden token but are amounts rather than identifiers. */
const SENSITIVE_ID_EXEMPT_SEGMENTS: readonly string[] = ['tfn_withheld'] as const;

/** True when any dot-segment of the id equals `token` or contains it as an underscore-delimited token. */
function segmentsContainToken(id: string, token: string): boolean {
  for (const seg of id.split('.')) {
    if (SENSITIVE_ID_EXEMPT_SEGMENTS.includes(seg)) continue;
    if (seg === token) return true;
    if (seg.startsWith(`${token}_`) || seg.endsWith(`_${token}`) || seg.includes(`_${token}_`)) return true;
  }
  return false;
}

function conditionRefs(c: Condition): string[] {
  if ('all' in c) return c.all.flatMap(conditionRefs);
  if ('any' in c) return c.any.flatMap(conditionRefs);
  if ('not' in c) return conditionRefs(c.not);
  if ('occupation' in c) return [];
  return [c.q];
}

/** True when some leaf of the condition is `{ q: id, includes: value }` or `{ q: id, eq: value }` / `in` containing it. */
function conditionMentionsOption(c: Condition, id: string, value: string): boolean {
  if ('all' in c) return c.all.some((x) => conditionMentionsOption(x, id, value));
  if ('any' in c) return c.any.some((x) => conditionMentionsOption(x, id, value));
  if ('not' in c) return conditionMentionsOption(c.not, id, value);
  if ('occupation' in c) return false;
  if (c.q !== id) return false;
  if ('includes' in c) return c.includes === value;
  if ('eq' in c) return c.eq === value;
  if ('in' in c) return c.in.includes(value);
  return false;
}

function labelDescribesOutcome(label: string): boolean {
  const l = label.toLowerCase();
  return l.startsWith('i can claim') || l.includes('you can claim') || l.includes('deductible');
}

export function lintQuestionBank(questions: Question[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const byId = new Map<string, Question>();
  const groupIds = new Set<string>();

  for (const q of questions) {
    if (q.type === 'repeater' && q.repeater) groupIds.add(q.repeater.groupId);
  }

  for (const q of questions) {
    const tag = `[${q.id}]`;

    // 6. unique ids
    if (ids.has(q.id)) problems.push(`rule 6 ${tag}: duplicate question id`);
    ids.add(q.id);
    byId.set(q.id, q);

    // 15. id shape
    if (!ID_PATTERN.test(q.id)) problems.push(`rule 15 ${tag}: id must match module.topic.item (lowercase, digits, underscores, at least one dot)`);

    // 9. sensitive ids (token match on each dot segment; `tfn_withheld` is an amount, not the identifier)
    for (const frag of FORBIDDEN_ID_FRAGMENTS) {
      if (segmentsContainToken(q.id, frag)) problems.push(`rule 9 ${tag}: id must not contain "${frag}"`);
    }

    // 1. yes_no_unsure option set
    if (q.type === 'yes_no_unsure' && q.options !== undefined) {
      const values = q.options.map((o) => o.value);
      const exact = values.length === 3 && YES_NO_UNSURE_VALUES.every((v) => values.includes(v));
      if (!exact) problems.push(`rule 1 ${tag}: yes_no_unsure must have no options or exactly yes/no/not_sure`);
    }

    if (q.type === 'single' || q.type === 'multi') {
      const options = q.options ?? [];

      // 10. at least two options
      if (options.length < 2) problems.push(`rule 10 ${tag}: ${q.type} must have at least 2 options`);

      // 2. not_sure present unless allow-listed
      if (!NOT_SURE_ALLOWLIST.includes(q.id) && !options.some((o) => o.value === 'not_sure')) {
        problems.push(`rule 2 ${tag}: ${q.type} must include a not_sure option (or be allow-listed)`);
      }

      // 14. exclusive is meaningless on single
      if (q.type === 'single' && options.some((o) => o.exclusive)) {
        problems.push(`rule 14 ${tag}: exclusive options make no sense on a single question`);
      }

      // 3. screening multi: none (exclusive), other, and an "other" text follow-up
      if (q.type === 'multi' && q.screening) {
        const none = options.find((o) => o.value === 'none');
        if (!none) problems.push(`rule 3 ${tag}: screening multi must have a "none" option`);
        else if (!none.exclusive) problems.push(`rule 3 ${tag}: the "none" option must be exclusive`);
        if (!options.some((o) => o.value === 'other')) problems.push(`rule 3 ${tag}: screening multi must have an "other" option`);
        const followUpIds = [`${q.id}.other_text`, `${q.id}_other`];
        const followUp = questions.find((x) => followUpIds.includes(x.id) && x.type === 'text');
        if (!followUp) {
          problems.push(`rule 3 ${tag}: needs a text follow-up with id ${followUpIds.join(' or ')}`);
        } else if (!followUp.showIf || !conditionMentionsOption(followUp.showIf, q.id, 'other')) {
          problems.push(`rule 3 ${tag}: follow-up ${followUp.id} must showIf ${q.id} includes "other"`);
        }
      }
    }

    // 4. labels describe facts, not outcomes
    for (const o of q.options ?? []) {
      if (labelDescribesOutcome(o.label)) problems.push(`rule 4 ${tag}: option "${o.value}" label describes an outcome: "${o.label}"`);
    }

    // 5. one question asks one thing
    if (q.prompt.includes(' and/or ')) problems.push(`rule 5 ${tag}: prompt must not contain "and/or"`);

    // 8. no defaults
    if ('defaultValue' in q || 'default' in q) problems.push(`rule 8 ${tag}: defaults are forbidden`);

    // 11. repeaterGroup references a declared repeater
    if (q.repeaterGroup !== undefined && !groupIds.has(q.repeaterGroup)) {
      problems.push(`rule 11 ${tag}: repeaterGroup "${q.repeaterGroup}" has no repeater question declaring it`);
    }

    // 12/13. deduction meta
    if (q.deduction) {
      if (q.type !== 'money') problems.push(`rule 12 ${tag}: deduction meta is only allowed on money questions`);
      if (!q.id.startsWith(q.deduction.base)) problems.push(`rule 12 ${tag}: deduction.base "${q.deduction.base}" must prefix the id`);
      if (!q.atoRef) problems.push(`rule 13 ${tag}: deduction questions must carry an atoRef`);
    }
  }

  // 7. showIf references resolve (after all ids collected)
  for (const q of questions) {
    if (!q.showIf) continue;
    for (const ref of conditionRefs(q.showIf)) {
      if (!byId.has(ref)) problems.push(`rule 7 [${q.id}]: showIf references unknown question "${ref}"`);
    }
  }

  return problems;
}
