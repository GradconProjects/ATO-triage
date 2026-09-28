/**
 * DEDUCTION_RATIO_HIGH thresholds: work-related deductions as a fraction of salary income above
 * which a claim is flagged for evidence checking. Keyed the way Section 9 names them.
 */
import type { OccupationTag } from '../engine/types';

export const DEDUCTION_RATIOS = {
  default: 0.1,
  dsw: 0.08,
  construction: 0.15,
  chef: 0.1,
  office: 0.06,
} as const;

export type DeductionRatioKey = keyof typeof DEDUCTION_RATIOS;

/** Occupation registry ids that use the `office` ratio. */
export const OFFICE_OCCUPATION_IDS: readonly string[] = ['office_professional'] as const;

/**
 * Pick the ratio for a case. With several occupations the most generous ratio applies so a
 * mixed-occupation case is not flagged on the strictest one.
 */
export function deductionRatioFor(activeTags: Set<OccupationTag>, occupationIds: readonly string[]): { key: DeductionRatioKey; ratio: number } {
  const candidates: DeductionRatioKey[] = [];
  if (activeTags.has('dsw')) candidates.push('dsw');
  if (activeTags.has('construction')) candidates.push('construction');
  if (activeTags.has('chef_hospitality')) candidates.push('chef');
  if (occupationIds.some((id) => OFFICE_OCCUPATION_IDS.includes(id))) candidates.push('office');
  if (candidates.length === 0) return { key: 'default', ratio: DEDUCTION_RATIOS.default };
  let best: DeductionRatioKey = candidates[0]!;
  for (const k of candidates) if (DEDUCTION_RATIOS[k] > DEDUCTION_RATIOS[best]) best = k;
  return { key: best, ratio: DEDUCTION_RATIOS[best] };
}
