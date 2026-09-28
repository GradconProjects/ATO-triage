/**
 * Opportunity flags: something in the answers suggests a deduction or saving worth checking.
 * Messages always say "check whether"; they never tell the user what they can claim.
 */
import { Q, GROUPS } from '../questions/ids';
import { dollarsToCents } from '../calc/money';
import { answerKey, formatCents, hasComputedDeduction, perInstance, sumOverItems } from './helpers';
import type { FlagInstance, FlagRule } from './types';

const ATO = {
  allowances: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/income-you-must-declare/employment-income/allowances-and-reimbursements',
  car: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/cars-transport-and-travel/motor-vehicle-and-car-expenses',
  clothing: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/clothes-and-items-you-wear-at-work',
  mls: 'https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/medicare-levy-surcharge',
};

/** Allowance type -> deduction categories that would show the matching expense was entered. */
export const ALLOWANCE_CATEGORIES: Record<string, readonly string[]> = {
  car_km: ['car'],
  tool: ['tools'],
  uniform_laundry: ['clothing', 'laundry'],
  travel: ['work_travel', 'overnight_travel'],
  meal: ['overnight_travel'],
};

const ALLOWANCE_LABELS: Record<string, string> = {
  car_km: 'car or kilometre',
  tool: 'tool',
  uniform_laundry: 'uniform or laundry',
  travel: 'travel',
  meal: 'meal',
};

export const ALLOWANCE_NO_EXPENSE: FlagRule = perInstance(
  {
    code: 'ALLOWANCE_NO_EXPENSE',
    kind: 'opportunity',
    severity: 'info',
    atoRef: ATO.allowances,
  },
  (a, ctx): FlagInstance[] => {
    const out: FlagInstance[] = [];
    for (const it of a.items(GROUPS.allowance)) {
      const type = a.string(Q.allow.type, it.id);
      if (!type) continue;
      const categories = ALLOWANCE_CATEGORIES[type];
      if (!categories) continue;
      if (a.string(Q.allow.nature, it.id) === 'reimbursement') continue;
      if (hasComputedDeduction(ctx.estimate, categories)) continue;
      const amount = a.cents(Q.allow.amount, it.id);
      const amountText = amount !== undefined ? ` of ${formatCents(amount)}` : '';
      out.push({
        questionIds: [answerKey(Q.allow.type, it.id)],
        message: `You received a ${ALLOWANCE_LABELS[type] ?? type} allowance${amountText} but no matching expense has been entered. The allowance is taxable income; check whether you spent your own money on this, because that spending may be a deduction.`,
      });
    }
    return out;
  },
);

export const DSW_CLIENT_TRAVEL_UNCLAIMED: FlagRule = {
  code: 'DSW_CLIENT_TRAVEL_UNCLAIMED',
  kind: 'opportunity',
  severity: 'info',
  questionIds: [Q.dsw.clientToClient, Q.ded.carAny],
  atoRef: ATO.car,
  when: (a, ctx) => ctx.activeTags.has('dsw') && a.string(Q.dsw.clientToClient) === 'yes_own_car' && !hasComputedDeduction(ctx.estimate, ['car']),
  message: () =>
    'You said you drove your own car between clients during the day, but no car expense has been entered. Travel between clients is usually deductible. Check whether you have a record of those kilometres.',
};

export const CONSTR_PPE_UNCLAIMED: FlagRule = {
  code: 'CONSTR_PPE_UNCLAIMED',
  kind: 'opportunity',
  severity: 'info',
  questionIds: [Q.con.ppe, Q.con.ppeAmount],
  atoRef: ATO.clothing,
  when: (a, ctx) => {
    if (!ctx.activeTags.has('construction')) return false;
    const ppe = (a.list(Q.con.ppe) ?? []).filter((v) => v !== 'none' && v !== 'not_sure');
    if (ppe.length === 0) return false;
    return (a.cents(Q.con.ppeAmount) ?? 0) === 0;
  },
  message: () =>
    'You said you bought protective gear such as boots, hi-vis or a hard hat, but no amount has been entered. Protective equipment you paid for yourself is usually deductible. Check whether you have receipts or bank records for it.',
};

export const CHEF_ELIGIBLE_CLOTHING: readonly string[] = ['checked_pants', 'jacket', 'apron', 'non_slip_shoes', 'hat'] as const;

export const CHEF_LAUNDRY_UNCLAIMED: FlagRule = {
  code: 'CHEF_LAUNDRY_UNCLAIMED',
  kind: 'opportunity',
  severity: 'info',
  questionIds: [Q.chef.clothing, Q.chef.laundry],
  atoRef: ATO.clothing,
  when: (a, ctx) => {
    if (!ctx.activeTags.has('chef_hospitality')) return false;
    const clothing = a.list(Q.chef.clothing) ?? [];
    if (!clothing.some((v) => CHEF_ELIGIBLE_CLOTHING.includes(v))) return false;
    return !hasComputedDeduction(ctx.estimate, ['laundry']);
  },
  message: () =>
    'You wear chef clothing such as checked pants, a jacket or non-slip shoes, but no laundry amount has been entered. Washing occupation-specific or protective clothing may be deductible. Check whether you wash it yourself and how often.',
};

export const NO_HOSPITAL_COVER: readonly string[] = ['none', 'extras_only', 'part_year'] as const;

export const MLS_EXPOSURE: FlagRule = {
  code: 'MLS_EXPOSURE',
  kind: 'opportunity',
  severity: 'info',
  questionIds: [Q.phi.cover],
  atoRef: ATO.mls,
  when: (a, ctx) => {
    const cover = a.string(Q.phi.cover);
    if (cover === undefined || !NO_HOSPITAL_COVER.includes(cover)) return false;
    const t = ctx.estimate.totals;
    const own = t.taxableIncomeCents + sumOverItems(a, Q.emp.rfb, GROUPS.employer) + sumOverItems(a, Q.emp.resc, GROUPS.employer);
    const spouse = a.string(Q.fam.spouse);
    const hasSpouse = spouse === 'all_year' || spouse === 'part_year';
    const children = Math.max(0, Math.trunc(a.number(Q.fam.dependantsCount) ?? 0));
    const isFamily = hasSpouse || children > 0;
    const spouseIncome = hasSpouse ? (a.cents(Q.fam.spouseTaxableIncome) ?? 0) + (a.cents(Q.fam.spouseRfb) ?? 0) + (a.cents(Q.fam.spouseRsc) ?? 0) : 0;
    const income = own + spouseIncome;
    const base = ctx.rules.mls.tiers.find((tier) => tier.tier === 0);
    if (!base) return false;
    const limit = isFamily ? base.familyTo : base.singleTo;
    if (limit === null) return false;
    const thresholdCents = dollarsToCents(limit + (isFamily ? ctx.rules.mls.familyChildIncrement * Math.max(0, children - 1) : 0));
    return income >= Math.round(thresholdCents * 0.9);
  },
  message: (a, ctx) =>
    `You had no private hospital cover for at least part of the year and your income for Medicare levy surcharge purposes is near or above the threshold. ${
      ctx.estimate.totals.mlsCents > 0 ? `The estimate includes a surcharge of ${formatCents(ctx.estimate.totals.mlsCents)}. ` : ''
    }Check whether a basic hospital policy would cost less than the surcharge next year.`,
};

export const OPPORTUNITY_RULES: FlagRule[] = [ALLOWANCE_NO_EXPENSE, DSW_CLIENT_TRAVEL_UNCLAIMED, CONSTR_PPE_UNCLAIMED, CHEF_LAUNDRY_UNCLAIMED, MLS_EXPOSURE];
