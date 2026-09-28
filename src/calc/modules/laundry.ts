import { EVIDENCE_OPTIONS, Q } from '../../questions/ids';
import type { CalcContext } from '../context';
import { resolvePaid } from '../reimbursement';

export const ELIGIBLE_CLOTHING = ['compulsory_uniform', 'registered_uniform', 'protective', 'occupation_specific'] as const;
export const ELIGIBLE_DSW_CLOTHING = ['compulsory_logo', 'registered', 'protective'] as const;
export const INELIGIBLE_CHEF_CLOTHING = ['plain_black', 'none', 'not_sure'] as const;

/** Is any eligible work clothing (uniform, protective, occupation-specific) recorded anywhere? */
export function hasEligibleClothing(cx: CalcContext): { eligible: boolean; inputs: string[] } {
  const general = cx.a.list(Q.ded.clothingType) ?? [];
  const dsw = cx.a.list(Q.dsw.clothing) ?? [];
  const chef = cx.a.list(Q.chef.clothing) ?? [];
  const eligible =
    general.some((v) => (ELIGIBLE_CLOTHING as readonly string[]).includes(v)) ||
    dsw.some((v) => (ELIGIBLE_DSW_CLOTHING as readonly string[]).includes(v)) ||
    chef.some((v) => !(INELIGIBLE_CHEF_CLOTHING as readonly string[]).includes(v));
  return { eligible, inputs: [Q.ded.clothingType, Q.dsw.clothing, Q.chef.clothing] };
}

/**
 * Laundry: (loadsWorkOnly x perLoadWorkOnly + loadsMixed x perLoadMixed) x weeks, in cents.
 * Without written evidence the claim is capped at the rule table's no-evidence cap.
 * Requires an eligible clothing answer, else review.
 */
export function computeLaundry(cx: CalcContext): number {
  const rules = cx.rules;
  const triggered = cx.a.string(Q.ded.laundryAny) === 'yes' || cx.a.string(Q.dsw.laundry) === 'yes' || cx.a.string(Q.chef.laundry) === 'yes';
  if (!triggered) {
    if (cx.a.isNotSure(Q.ded.laundryAny) || cx.a.isNotSure(Q.dsw.laundry) || cx.a.isNotSure(Q.chef.laundry)) {
      cx.setStatus('laundry', 'manual_review');
      cx.review('laundry', 'Not sure whether eligible work clothing was laundered at home.', [Q.ded.laundryAny]);
    } else cx.setStatus('laundry', 'not_applicable');
    return 0;
  }
  const inputs = [Q.ded.laundryAny, Q.dsw.laundry, Q.chef.laundry, Q.ded.laundryLoadsWorkOnly, Q.ded.laundryLoadsMixed, Q.ded.laundryWeeks, Q.ded.laundryEvidence];
  const workOnly = cx.a.number(Q.ded.laundryLoadsWorkOnly) ?? 0;
  const mixed = cx.a.number(Q.ded.laundryLoadsMixed) ?? 0;
  const weeks = cx.a.number(Q.ded.laundryWeeks);
  const toReview = (reason: string, ids: string[], amount: number, formula: string) => {
    cx.setStatus('laundry', 'manual_review');
    cx.review('laundry', reason, ids, amount);
    cx.markUncertain(Q.ded.laundryLoadsWorkOnly, Q.ded.laundryLoadsMixed);
    cx.lines.review({ id: 'ded.laundry', section: 'deductions', label: 'Laundry', amountCents: amount, ruleId: `${rules.fy}.laundry`, inputs, formula, note: reason, category: 'laundry' });
    return 0;
  };
  const clothing = hasEligibleClothing(cx);
  const raw = weeks === undefined ? 0 : Math.round((workOnly * rules.laundry.perLoadWorkOnly + mixed * rules.laundry.perLoadMixed) * weeks);
  const formula = `(${workOnly} x ${rules.laundry.perLoadWorkOnly}c + ${mixed} x ${rules.laundry.perLoadMixed}c) x ${weeks ?? '?'} weeks`;
  if (!clothing.eligible) return toReview('Laundry can only be claimed for eligible work clothing (uniform, protective or occupation-specific); none was recorded.', clothing.inputs, raw, formula);
  if (weeks === undefined) return toReview('Number of weeks not answered.', [Q.ded.laundryWeeks], raw, formula);
  if (workOnly + mixed <= 0) return toReview('Loads per week not answered.', [Q.ded.laundryLoadsWorkOnly, Q.ded.laundryLoadsMixed], 0, formula);
  const paid = resolvePaid(cx, 'ded.laundry', null, raw);
  if (paid.kind === 'excluded') {
    cx.setStatus('laundry', 'computed');
    cx.lines.excluded({ id: 'ded.laundry', section: 'deductions', label: 'Laundry', amountCents: raw, ruleId: `${rules.fy}.laundry`, inputs: [...inputs, ...paid.inputs], formula, note: paid.note ?? 'Reimbursed.', category: 'laundry' });
    return 0;
  }
  if (paid.kind === 'review') return toReview(paid.note ?? 'Reimbursement unknown.', paid.inputs, raw, formula);
  const evidence = cx.a.value(Q.ded.laundryEvidence);
  const evList = typeof evidence === 'string' ? [evidence] : Array.isArray(evidence) ? evidence.filter((x): x is string => typeof x === 'string') : [];
  const noEvidence = evList.length === 0 || evList.includes(EVIDENCE_OPTIONS.none) || evList.includes(EVIDENCE_OPTIONS.estimateOnly);
  let amount = raw;
  let note: string | undefined;
  if (noEvidence && raw > rules.laundry.noEvidenceCap) {
    amount = rules.laundry.noEvidenceCap;
    note = `Capped at ${rules.laundry.noEvidenceCap / 100} because no written evidence was kept.`;
    cx.markUncertain(Q.ded.laundryLoadsWorkOnly, Q.ded.laundryLoadsMixed);
  }
  cx.setStatus('laundry', 'computed');
  cx.lines.computed({ id: 'ded.laundry', section: 'deductions', label: 'Laundry of work clothing', amountCents: amount, ruleId: `${rules.fy}.laundry`, inputs, formula: note ? `${formula} = ${raw / 100}, capped` : formula, category: 'laundry', detail: { loadsWorkOnly: workOnly, loadsMixed: mixed, weeks, rawCents: raw, capped: amount !== raw }, ...(note ? { note } : {}) });
  return amount;
}
