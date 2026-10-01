import { Q } from '../../questions/ids';
import type { DeductionCategory, DeductionMeta, Treatment, TreatmentByAnswer } from '../../engine/types';
import type { CalcContext } from '../context';
import { lineId } from '../explain';
import { dollarsToCents, pct } from '../money';
import { resolvePaid, weakEvidence, workPct as workPctFor } from '../reimbursement';
import { resolveTreatment } from '../treatment';
import { declineInValueLine } from './decline-in-value';
import { ELIGIBLE_CLOTHING, ELIGIBLE_DSW_CLOTHING, INELIGIBLE_CHEF_CLOTHING } from './laundry';

/** Ids owned by the special modules (car, home office, laundry, super contributions). */
export const SPECIAL_DEDUCTION_IDS = new Set<string>([
  Q.ded.carAny, Q.ded.carMethod, Q.ded.carKm, Q.ded.carCount, Q.ded.carKm2, Q.ded.carTripTypes, Q.ded.carException, Q.ded.carLogbookPct, Q.ded.carTotalCosts, Q.ded.carPaid, Q.ded.carEvidence,
  Q.ded.wfhAny, Q.ded.wfhMethod, Q.ded.wfhHours, Q.ded.wfhHoursRecord, Q.ded.wfhActualCosts, Q.ded.wfhWorkPct,
  Q.ded.laundryAny, Q.ded.laundryLoadsWorkOnly, Q.ded.laundryLoadsMixed, Q.ded.laundryWeeks, Q.ded.laundryEvidence,
  Q.supc.personalAny, Q.supc.personalAmount, Q.supc.noi, Q.supc.tsbRange, Q.supc.carryForward, Q.supc.spouseAmount,
]);

interface KnownDeduction {
  category: DeductionCategory;
  base: string;
  treatment: Treatment | TreatmentByAnswer;
  capitalThreshold?: boolean;
}

const byStage = (q: string, renewal: Treatment): TreatmentByAnswer => ({ byQuestion: q, map: { first: 'N', first_check: 'N', renewal, employer_paid: 'N' } });

/** Section 7 treatments for the ids in Q, used when the bank carries no `deduction` meta for them. */
export const KNOWN_DEDUCTIONS: Record<string, KnownDeduction> = {
  [Q.ded.travelAmount]: { category: 'work_travel', base: 'ded.travel', treatment: 'D' },
  [Q.ded.overnightAmount]: { category: 'overnight_travel', base: 'ded.overnight', treatment: 'D' },
  [Q.ded.clothingAmount]: { category: 'clothing', base: 'ded.clothing', treatment: 'D' },
  [Q.ded.toolCost]: { category: 'tools', base: 'ded.tool', treatment: 'D', capitalThreshold: true },
  [Q.ded.phoneAmount]: { category: 'phone_internet', base: 'ded.phone', treatment: 'D' },
  [Q.ded.selfEdAmount]: { category: 'self_education', base: 'ded.selfed', treatment: { byQuestion: Q.ded.selfEdRelated, map: { current_duties: 'D', new_role: 'N' } } },
  [Q.ded.unionAmount]: { category: 'union_professional', base: 'ded.union', treatment: 'D' },
  [Q.ded.subscriptionsAmount]: { category: 'subscriptions', base: 'ded.subscriptions', treatment: 'D' },
  [Q.ded.sunAmount]: { category: 'sun_protection', base: 'ded.sun', treatment: 'D' },
  [Q.ded.taxAffairsAmount]: { category: 'tax_affairs', base: 'ded.tax_affairs', treatment: 'D' },
  [Q.ded.giftsAmount]: { category: 'gifts_donations', base: 'ded.gifts', treatment: 'D' },
  [Q.ded.incomeProtectionAmount]: { category: 'income_protection', base: 'ded.income_protection', treatment: 'D' },
  [Q.ded.investmentAmount]: { category: 'investment', base: 'ded.investment', treatment: 'D' },
  [Q.dsw.clientCostsAmount]: { category: 'other_work', base: 'dsw.client_costs', treatment: 'R' },
  [Q.dsw.clothingAmount]: { category: 'clothing', base: 'dsw.clothing', treatment: 'D' },
  [Q.dsw.firstAidAmount]: { category: 'first_aid', base: 'dsw.first_aid', treatment: { byQuestion: Q.dsw.firstAid, map: { designated: 'D', required: 'R', personal_choice: 'R', employer_paid: 'N' } } },
  [Q.dsw.checksAmount]: { category: 'licences', base: 'dsw.checks', treatment: { byQuestion: Q.dsw.checksStage, map: { first_check: 'N', renewal: 'R', employer_paid: 'N' } } },
  [Q.dsw.trainingAmount]: { category: 'self_education', base: 'dsw.training', treatment: { byQuestion: Q.dsw.training, map: { current_duties: 'D', new_role: 'N', employer_paid: 'N' } } },
  [Q.dsw.conferencesAmount]: { category: 'self_education', base: 'dsw.conferences', treatment: 'D' },
  [Q.dsw.vaccinationsAmount]: { category: 'other_work', base: 'dsw.vaccinations', treatment: 'N' },
  [Q.con.toolRepairsAmount]: { category: 'tools', base: 'con.tool_repairs', treatment: 'D' },
  [Q.con.ppeAmount]: { category: 'clothing', base: 'con.ppe', treatment: 'D' },
  [Q.con.everydayClothingAmount]: { category: 'clothing', base: 'con.everyday_clothing', treatment: 'N' },
  [Q.con.licenceAmount]: { category: 'licences', base: 'con.licences', treatment: byStage(Q.con.licenceStage, 'D') },
  [Q.con.fifoAmount]: { category: 'overnight_travel', base: 'con.fifo', treatment: { byQuestion: Q.con.fifo, map: { employer_paid: 'N', lafha: 'R', self_paid: 'R', none: 'N' } } },
  [Q.chef.sharpeningAmount]: { category: 'tools', base: 'chef.sharpening', treatment: 'D' },
  [Q.chef.clothingAmount]: { category: 'clothing', base: 'chef.clothing', treatment: 'D' },
  [Q.chef.certAmount]: { category: 'licences', base: 'chef.certificates', treatment: byStage(Q.chef.certStage, 'D') },
  [Q.chef.coursesAmount]: { category: 'self_education', base: 'chef.courses', treatment: { byQuestion: Q.chef.courses, map: { current_job: 'D', new_career: 'N', none: 'N' } } },
  [Q.chef.overtimeMealAmount]: { category: 'other_work', base: 'chef.overtime_meal', treatment: { byQuestion: Q.chef.overtimeMealAllowance, map: { yes: 'D', no: 'N' } } },
};

export const NON_WORK_CATEGORIES = new Set<DeductionCategory>(['gifts_donations', 'tax_affairs', 'income_protection', 'personal_super', 'investment', 'rental']);

export const CATEGORY_LABELS: Record<DeductionCategory, string> = {
  car: 'Car expenses',
  work_travel: 'Work travel',
  overnight_travel: 'Overnight travel',
  clothing: 'Work clothing',
  laundry: 'Laundry',
  tools: 'Tools and equipment',
  home_office: 'Home office',
  phone_internet: 'Phone and internet',
  self_education: 'Self-education and training',
  union_professional: 'Union and professional fees',
  subscriptions: 'Subscriptions',
  licences: 'Licences, checks and certificates',
  sun_protection: 'Sun protection',
  first_aid: 'First aid',
  other_work: 'Other work expenses',
  gifts_donations: 'Gifts and donations',
  tax_affairs: 'Cost of managing tax affairs',
  income_protection: 'Income protection insurance',
  personal_super: 'Personal super contribution',
  investment: 'Investment expenses',
  rental: 'Rental expenses',
};

export interface DeductionsResult {
  deductionsCents: number;
  workRelatedCents: number;
}

type Resolved = { treatment: Treatment; inputs: string[]; note?: string; formula: string };

const CLOTHING_NOTE_PLAIN = 'Plain or everyday clothing is private, even if worn only at work.';

function clothingTreatment(cx: CalcContext, id: string, itemId: string | null): Resolved | undefined {
  let typeQ: string;
  let eligible: readonly string[];
  let ineligible: readonly string[];
  let invert = false;
  if (id === Q.ded.clothingAmount) {
    typeQ = Q.ded.clothingType;
    eligible = ELIGIBLE_CLOTHING;
    ineligible = ['plain', 'none'];
  } else if (id === Q.dsw.clothingAmount) {
    typeQ = Q.dsw.clothing;
    eligible = ELIGIBLE_DSW_CLOTHING;
    ineligible = ['plain', 'none'];
  } else if (id === Q.chef.clothingAmount) {
    typeQ = Q.chef.clothing;
    eligible = [];
    ineligible = INELIGIBLE_CHEF_CLOTHING;
    invert = true;
  } else return undefined;
  const list = cx.scopedList(typeQ, itemId);
  if (!list || list.length === 0 || list.includes('not_sure')) {
    return { treatment: 'R', inputs: [typeQ], note: cx.scopedNotSure(typeQ, itemId) ? 'Not sure what type of clothing this was.' : 'Type of clothing not answered.', formula: 'clothing type unknown' };
  }
  const isEligible = invert ? list.some((v) => !ineligible.includes(v)) : list.some((v) => eligible.includes(v));
  const hasIneligible = list.some((v) => (invert ? ineligible.includes(v) : !eligible.includes(v)) && v !== 'none');
  if (isEligible && hasIneligible) {
    return { treatment: 'R', inputs: [typeQ], note: 'Eligible and plain or everyday clothing were bought together: only the eligible items can be claimed, so the total needs to be split.', formula: `mixed clothing (${list.join(', ')})` };
  }
  if (isEligible) return { treatment: 'D', inputs: [typeQ], formula: `eligible clothing (${list.join(', ')})` };
  return { treatment: 'N', inputs: [typeQ], note: CLOTHING_NOTE_PLAIN, formula: `clothing type ${list.join(', ')} not deductible` };
}

/** Courses entered under occupation questions (chef courses, support-worker training). */
const OCCUPATION_COURSE_AMOUNTS = [Q.chef.coursesAmount, Q.dsw.trainingAmount];

/**
 * The general self-education entry may be the same course already entered under the job
 * questions. Until the user says it is a different course, it is held for review (not added a
 * second time); when confirmed the same, it is excluded as a duplicate.
 */
function selfEdDuplicate(cx: CalcContext): Resolved | undefined {
  const occupational = OCCUPATION_COURSE_AMOUNTS.filter((q) => cx.visible.has(q) && (cx.a.cents(q) ?? 0) > 0);
  if (!occupational.length) return undefined;
  const same = cx.a.string(Q.ded.selfEdSameCourse);
  if (same === 'different') return undefined;
  if (same === 'same') return { treatment: 'N', inputs: [Q.ded.selfEdSameCourse, ...occupational], note: 'Same course as the one entered under your job questions: counted once, there.', formula: 'duplicate course entry' };
  return { treatment: 'R', inputs: [Q.ded.selfEdSameCourse, ...occupational], note: 'A course is also entered under your job questions. Confirm whether this is the same course (counted once) or a different one.', formula: 'possible duplicate course' };
}

function giftsTreatment(cx: CalcContext, itemId: string | null): Resolved {
  const dgr = cx.scopedString(Q.ded.giftsDgr, itemId);
  if (dgr === 'yes') return { treatment: 'D', inputs: [Q.ded.giftsDgr], formula: 'gift to a deductible gift recipient' };
  if (dgr === 'no') return { treatment: 'N', inputs: [Q.ded.giftsDgr], note: 'Only gifts of $2 or more to a deductible gift recipient (DGR) are deductible.', formula: 'recipient is not a DGR' };
  return { treatment: 'R', inputs: [Q.ded.giftsDgr], note: cx.scopedNotSure(Q.ded.giftsDgr, itemId) ? 'Not sure whether the recipient is a DGR; check the ABN lookup.' : 'DGR status not answered.', formula: 'DGR status unknown' };
}

/** Step 2: data-driven deductions (car, home office, laundry and super are separate modules). */
export function computeDeductions(cx: CalcContext): DeductionsResult {
  const rules = cx.rules;
  const fy = rules.fy;
  const threshold = dollarsToCents(rules.instantDeductionThreshold);
  const res: DeductionsResult = { deductionsCents: 0, workRelatedCents: 0 };
  let touched = false;

  // Candidate questions: bank questions with deduction meta, plus known ids missing from the bank.
  const candidates: Array<{ id: string; meta: DeductionMeta; prompt?: string }> = [];
  const seen = new Set<string>();
  for (const q of cx.questions) {
    if (q.type !== 'money' || !q.deduction || SPECIAL_DEDUCTION_IDS.has(q.id)) continue;
    candidates.push({ id: q.id, meta: q.deduction, prompt: q.prompt });
    seen.add(q.id);
  }
  for (const [id, k] of Object.entries(KNOWN_DEDUCTIONS)) {
    if (seen.has(id) || SPECIAL_DEDUCTION_IDS.has(id)) continue;
    const q = cx.question(id);
    if (q && q.type !== 'money') continue;
    candidates.push({ id, meta: { category: k.category, base: k.base, treatment: k.treatment, ...(k.capitalThreshold ? { capitalThreshold: true } : {}) }, prompt: q?.prompt });
  }

  for (const c of candidates) {
    const { id, meta } = c;
    for (const { itemId, cents, key } of cx.centsInstances(id)) {
      touched = true;
      const base = meta.base;
      const itemText = cx.scopedString(`${base}.item`, itemId);
      const label = `${CATEGORY_LABELS[meta.category] ?? meta.category}${itemText ? `: ${itemText}` : ''}`;
      const lid = lineId(`ded.${id}`, itemId);
      const inputs = [id];
      const detail: Record<string, string | number | boolean | null | undefined> = { amountCents: cents, category: meta.category };

      // Treatment.
      let r: Resolved;
      const clothing = clothingTreatment(cx, id, itemId);
      if (clothing) r = clothing;
      else if (id === Q.ded.giftsAmount) r = giftsTreatment(cx, itemId);
      else if (id === Q.ded.selfEdAmount && selfEdDuplicate(cx)) r = selfEdDuplicate(cx)!;
      else if (meta.category === 'phone_internet' && cx.a.string(Q.ded.wfhMethod) === 'fixed_rate') {
        // The fixed rate already covers phone and internet use while working at home.
        r = { treatment: 'R', inputs: [Q.ded.wfhMethod], note: 'You chose the working-from-home fixed rate, which already covers phone and internet use while working at home. Only separate work use outside those hours can be claimed, with records.', formula: 'possible overlap with the fixed rate' };
      }
      else {
        const t = resolveTreatment(cx, meta.treatment, itemId, 'D');
        r = { treatment: t.treatment, inputs: t.via ? [t.via] : [], formula: t.via ? `${t.via} = ${t.value ?? 'unanswered'} -> ${t.treatment}` : `treatment ${t.treatment}`, ...(t.fallback ? { note: `Depends on ${t.via}, which has no usable answer.` } : {}) };
      }
      inputs.push(...r.inputs);
      const weak = weakEvidence(cx, base, itemId);
      detail['evidence'] = weak ? 'weak' : (cx.scopedString(`${base}.evidence`, itemId) ?? 'not_answered');
      if (weak) {
        cx.markUncertain(key);
        inputs.push(`${base}.evidence`);
      }

      if (r.treatment === 'N') {
        cx.lines.excluded({ id: lid, section: 'deductions', label, amountCents: cents, ruleId: `${fy}.deduction.${meta.category}`, inputs, formula: `${cents / 100}: ${r.formula}`, note: r.note ?? 'Not deductible.', category: meta.category, itemId, detail });
        continue;
      }
      if (r.treatment === 'R' || r.treatment === 'I') {
        const note = r.note ?? 'Deductibility needs manual review.';
        cx.lines.review({ id: lid, section: 'deductions', label, amountCents: cents, ruleId: `${fy}.deduction.${meta.category}`, inputs, formula: `${cents / 100}: ${r.formula}`, note, category: meta.category, itemId, detail });
        cx.review('deductions', `${label}: ${note}`, inputs, cents);
        cx.markUncertain(key);
        cx.setStatus('deductions', 'manual_review');
        continue;
      }

      // D or C: reimbursement, then work %.
      const paid = resolvePaid(cx, base, itemId, cents);
      inputs.push(...paid.inputs);
      if (paid.kind === 'excluded') {
        cx.lines.excluded({ id: lid, section: 'deductions', label, amountCents: cents, ruleId: `${fy}.deduction.${meta.category}`, inputs, formula: `${cents / 100} reimbursed`, note: paid.note ?? 'Reimbursed.', category: meta.category, itemId, detail });
        continue;
      }
      if (paid.kind === 'review') {
        cx.lines.review({ id: lid, section: 'deductions', label, amountCents: cents, ruleId: `${fy}.deduction.${meta.category}`, inputs, formula: `${cents / 100}: reimbursement unknown`, note: paid.note ?? 'Reimbursement unknown.', category: meta.category, itemId, detail });
        cx.review('deductions', `${label}: ${paid.note ?? 'reimbursement unknown'}`, inputs, cents);
        cx.markUncertain(key);
        cx.setStatus('deductions', 'manual_review');
        continue;
      }
      const wp = workPctFor(cx, base, itemId);
      if (wp === undefined) {
        cx.lines.review({ id: lid, section: 'deductions', label, amountCents: paid.netCents, ruleId: `${fy}.deduction.${meta.category}`, inputs: [...inputs, `${base}.work_pct`], formula: `${paid.netCents / 100} x work % (missing)`, note: 'Work-use percentage not answered.', category: meta.category, itemId, detail });
        cx.review('deductions', `${label}: work-use percentage not answered.`, [`${base}.work_pct`], paid.netCents);
        cx.markUncertain(key);
        cx.setStatus('deductions', 'manual_review');
        continue;
      }
      if (cx.exists(`${base}.work_pct`)) inputs.push(`${base}.work_pct`);
      detail['workPct'] = wp;
      detail['reimbursedCents'] = paid.reimbursedCents;

      const isCapital = r.treatment === 'C' || (meta.capitalThreshold === true && cents >= threshold);
      let amount: number;
      if (isCapital) {
        amount = declineInValueLine(cx, { idPrefix: `ded.${id}`, itemId, label, category: meta.category, costCents: paid.netCents, workPct: wp, inputs, effectiveLifeQ: `${base}.effective_life`, dateQ: `${base}.date`, openingValueQ: `${base}.opening_value`, key });
      } else {
        amount = pct(paid.netCents, wp);
        cx.lines.computed({ id: lid, section: 'deductions', label, amountCents: amount, ruleId: `${fy}.deduction.${meta.category}`, inputs, formula: `${paid.reimbursedCents ? `(${cents / 100} - ${paid.reimbursedCents / 100} reimbursed)` : `${cents / 100}`} x ${wp}%${meta.capitalThreshold ? ` (under $${rules.instantDeductionThreshold}: immediate)` : ''}${r.formula && r.inputs.length ? `; ${r.formula}` : ''}`, category: meta.category, itemId, detail, ...(paid.note ? { note: paid.note } : {}) });
      }
      res.deductionsCents += amount;
      if (!NON_WORK_CATEGORIES.has(meta.category)) res.workRelatedCents += amount;
    }
  }
  if (!touched) cx.setStatus('deductions', 'not_applicable');
  else if (cx.moduleStatus['deductions'] !== 'manual_review') cx.setStatus('deductions', 'computed');
  return res;
}
