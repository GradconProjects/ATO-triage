/**
 * Review flags: the answer or the estimate needs a human look before it is relied on.
 */
import { Q, GROUPS, EVIDENCE_OPTIONS } from '../questions/ids';
import { dollarsToCents } from '../calc/money';
import {
  answerKey,
  describeResult,
  formatCents,
  occupationIds,
  pctText,
  perInstance,
  promptOf,
  questionById,
  salaryCents,
  sumOverItems,
  workRelatedDeductionsCents,
} from './helpers';
import { deductionRatioFor } from './ratios';
import type { FlagInstance, FlagRule } from './types';

const ATO = {
  records: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/records-you-need-to-keep',
  deductions: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim',
  lspia: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/tax-offsets/lump-sum-payment-in-arrears-tax-offset',
  compensation: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/income-you-must-declare/other-income/compensation-and-insurance-payments',
  residency: 'https://www.ato.gov.au/individuals-and-families/coming-to-australia-or-going-overseas/your-tax-residency',
  temporaryResident: 'https://www.ato.gov.au/individuals-and-families/coming-to-australia-or-going-overseas/coming-to-australia/temporary-residents-and-super',
  dualResident: 'https://www.ato.gov.au/individuals-and-families/coming-to-australia-or-going-overseas/your-tax-residency/dual-residents',
  partYear: 'https://www.ato.gov.au/individuals-and-families/coming-to-australia-or-going-overseas/your-tax-residency/part-year-residents',
  mainResidence: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/property-and-capital-gains-tax/your-main-residence-home',
  etp: 'https://www.ato.gov.au/individuals-and-families/jobs-and-employment-types/working-as-an-employee/leaving-your-job/employment-termination-payments',
  superIncome: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/tax-on-super-benefits',
  psi: 'https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/personal-services-income',
  losses: 'https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/losses',
  taxReady: 'https://www.ato.gov.au/individuals-and-families/your-tax-return/before-you-prepare-your-tax-return/income-statement-and-payment-summaries',
  amendment: 'https://www.ato.gov.au/individuals-and-families/your-tax-return/check-the-progress-of-your-tax-return/correct-amend-your-tax-return',
  occupationTags: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/occupation-and-industry-specific-guides',
};

function withStop(text: string): string {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

export const ANY_NOT_SURE: FlagRule = perInstance(
  { code: 'ANY_NOT_SURE', kind: 'review', severity: 'warning' },
  (a, ctx): FlagInstance[] =>
    a
      .records()
      .filter((r) => r.state === 'not_sure')
      .sort((x, y) => answerKey(x.questionId, x.repeaterItemId).localeCompare(answerKey(y.questionId, y.repeaterItemId)))
      .map((r) => {
        const q = questionById(ctx, r.questionId);
        const hint = q?.help ? withStop(q.help) : 'the answer against your records or income statement.';
        return {
          questionIds: [answerKey(r.questionId, r.repeaterItemId)],
          message: `You answered Not sure to: ${q?.prompt ?? r.questionId}. Check ${hint}`,
        };
      }),
);

export const DEDUCTION_RATIO_HIGH: FlagRule = {
  code: 'DEDUCTION_RATIO_HIGH',
  kind: 'review',
  severity: 'warning',
  questionIds: [Q.emp.gross],
  atoRef: ATO.deductions,
  when: (_a, ctx) => {
    const salary = salaryCents(ctx.estimate);
    if (salary <= 0) return false;
    const work = workRelatedDeductionsCents(ctx.estimate);
    if (work <= 0) return false;
    const { ratio } = deductionRatioFor(ctx.activeTags, occupationIds(ctx, GROUPS.employer, Q.emp.occupation));
    return work > salary * ratio;
  },
  message: (_a, ctx) => {
    const salary = salaryCents(ctx.estimate);
    const work = workRelatedDeductionsCents(ctx.estimate);
    const { ratio } = deductionRatioFor(ctx.activeTags, occupationIds(ctx, GROUPS.employer, Q.emp.occupation));
    return `Your work-related deductions of ${formatCents(work)} are ${pctText(work, salary)} of your salary of ${formatCents(salary)}, above the ${Math.round(
      ratio * 100,
    )}% level that is typical for your occupation. Claims this high attract ATO attention. Check that you have records for every amount.`;
  },
};

export const NO_EVIDENCE: FlagRule = perInstance(
  { code: 'NO_EVIDENCE', kind: 'review', severity: 'warning', atoRef: ATO.records },
  (a, ctx): FlagInstance[] => {
    const out: FlagInstance[] = [];
    const seen = new Set<string>();
    const weak: readonly string[] = [EVIDENCE_OPTIONS.none, EVIDENCE_OPTIONS.estimateOnly];
    const records = a
      .records()
      .filter((r) => r.state === 'answered' && r.questionId.endsWith('.evidence'))
      .sort((x, y) => answerKey(x.questionId, x.repeaterItemId).localeCompare(answerKey(y.questionId, y.repeaterItemId)));
    for (const r of records) {
      const values = Array.isArray(r.value) ? r.value.filter((v): v is string => typeof v === 'string') : typeof r.value === 'string' ? [r.value] : [];
      const found = values.find((v) => weak.includes(v));
      if (!found) continue;
      const base = r.questionId.slice(0, -'.evidence'.length);
      const key = answerKey(base, r.repeaterItemId);
      if (seen.has(key)) continue;
      seen.add(key);
      const amountQ =
        ctx.questions.find((q) => q.deduction?.base === base) ??
        questionById(ctx, `${base}.amount`) ??
        questionById(ctx, `${base}.cost`) ??
        questionById(ctx, `${base}.total_costs`);
      const amountId = amountQ?.id ?? `${base}.amount`;
      const label = amountQ?.prompt ?? promptOf(ctx, r.questionId);
      const how = found === EVIDENCE_OPTIONS.none ? 'no records' : 'only an estimate';
      out.push({
        questionIds: [answerKey(amountId, r.repeaterItemId)],
        message: `You have ${how} for "${label}". A claim without written evidence is at risk if the ATO asks about it. Check whether receipts, bank statements or a diary can support the amount.`,
      });
    }
    return out;
  },
);

export const LUMP_SUM_E_LSPIA: FlagRule = {
  code: 'LUMP_SUM_E_LSPIA',
  kind: 'review',
  severity: 'warning',
  questionIds: [Q.emp.lumpE, Q.comp.arrearsAmount],
  atoRef: ATO.lspia,
  when: (a, ctx) => {
    const total = sumOverItems(a, Q.emp.lumpE, GROUPS.employer) + (a.cents(Q.comp.arrearsAmount) ?? 0);
    return total >= dollarsToCents(ctx.rules.lspiaMinimum);
  },
  message: (a) => {
    const total = sumOverItems(a, Q.emp.lumpE, GROUPS.employer) + (a.cents(Q.comp.arrearsAmount) ?? 0);
    return `You received ${formatCents(total)} as a lump sum for earlier years (Lump Sum E or back pay). A lump sum in arrears offset may reduce the tax on it, but working it out needs your taxable income for each year the payment relates to. Check the years and amounts on the payment breakdown.`;
  },
};

export const CAPITAL_LUMP_TYPES: readonly string[] = ['impairment', 'economic_loss', 'common_law'] as const;

export const WORKCOVER_CAPITAL_LUMP: FlagRule = {
  code: 'WORKCOVER_CAPITAL_LUMP',
  kind: 'review',
  severity: 'warning',
  questionIds: [Q.comp.received],
  atoRef: ATO.compensation,
  when: (a) => (a.list(Q.comp.received) ?? []).some((v) => CAPITAL_LUMP_TYPES.includes(v)),
  message: () =>
    'You received a lump sum for permanent impairment, loss of earning capacity or a common law settlement. These are usually not income, but the treatment depends on what the settlement says the money is for. The amount has been shown but not added to your income; have the settlement terms checked.',
};

export const MANUAL_REVIEW_MODULE: FlagRule = perInstance(
  { code: 'MANUAL_REVIEW_MODULE', kind: 'review', severity: 'warning' },
  (_a, ctx): FlagInstance[] =>
    ctx.estimate.manualReview.map((m) => ({
      questionIds: m.questionIds.length ? [...m.questionIds] : [m.module],
      message: `${withStop(m.reason)}${m.amountCents !== undefined ? ` Amount involved: ${formatCents(m.amountCents)}.` : ''} This part of the estimate needs a manual check.`,
    })),
);

export const NOT_SURE_OCCUPATION_TAGS: FlagRule = perInstance(
  { code: 'NOT_SURE_OCCUPATION_TAGS', kind: 'review', severity: 'info', atoRef: ATO.occupationTags },
  (a): FlagInstance[] =>
    a
      .items(GROUPS.employer)
      .filter((it) => a.isNotSure(Q.emp.otherTags, it.id))
      .map((it) => ({
        questionIds: [answerKey(Q.emp.otherTags, it.id)],
        message: 'You were not sure which kinds of work expenses apply to your job, so every expense topic has been asked. Check the ATO guide for your occupation to see which topics usually apply.',
      })),
);

export const TEMP_RESIDENT_FOREIGN_CGT: FlagRule = {
  code: 'TEMP_RESIDENT_FOREIGN_CGT',
  kind: 'review',
  severity: 'warning',
  questionIds: [Q.res.status],
  atoRef: ATO.temporaryResident,
  when: (a) => a.string(Q.res.status) === 'temporary',
  message: () =>
    'You are a temporary resident. Most foreign income and gains on assets outside Australia are not taxed here, so any foreign amounts have been set aside for review rather than added. Check that your visa still makes you a temporary resident for the whole year.',
};

export const DUAL_RESIDENT_TREATY: FlagRule = {
  code: 'DUAL_RESIDENT_TREATY',
  kind: 'review',
  severity: 'warning',
  questionIds: [Q.res.dual],
  atoRef: ATO.dualResident,
  when: (a) => a.string(Q.res.dual) === 'yes' || a.isNotSure(Q.res.dual),
  message: () =>
    'You may be a tax resident of another country as well as Australia. A tax treaty can decide which country taxes what, which changes this estimate. Check whether the other country treats you as a resident for the same period.',
};

export const PART_YEAR_RESIDENT: FlagRule = {
  code: 'PART_YEAR_RESIDENT',
  kind: 'review',
  severity: 'info',
  questionIds: [Q.res.status, Q.res.arrivalDate, Q.res.departureDate],
  atoRef: ATO.partYear,
  when: (a) => {
    const s = a.string(Q.res.status);
    return s === 'became_resident' || s === 'ceased_resident';
  },
  message: () =>
    'You were an Australian resident for only part of the year. The tax-free threshold is reduced for the months you were not a resident and income earned overseas before you arrived, or after you left, is treated differently. Check the arrival or departure date used.',
};

export const CGT_MAIN_RESIDENCE_PART: FlagRule = perInstance(
  { code: 'CGT_MAIN_RESIDENCE_PART', kind: 'review', severity: 'warning', atoRef: ATO.mainResidence },
  (a): FlagInstance[] =>
    a
      .items(GROUPS.cgtEvent)
      .filter((it) => a.string(Q.cgt.mainResidence, it.id) === 'part')
      .map((it) => ({
        questionIds: [answerKey(Q.cgt.mainResidence, it.id)],
        message: 'A property you sold was your home for only part of the time you owned it. Only part of the gain is exempt and the split depends on the days it was your home and whether it earned rent. Check the dates you lived there and any period it was rented.',
      })),
);

export const ETP_TYPES: readonly string[] = ['etp', 'unused_leave', 'redundancy'] as const;

export const ETP_REVIEW: FlagRule = {
  code: 'ETP_REVIEW',
  kind: 'review',
  severity: 'warning',
  questionIds: [Q.comp.etpReceived, Q.comp.etpAmount],
  atoRef: ATO.etp,
  when: (a) => (a.list(Q.comp.etpReceived) ?? []).some((v) => ETP_TYPES.includes(v)) || (a.cents(Q.comp.etpAmount) ?? 0) > 0,
  message: () =>
    'You received a payment when you left a job (termination payment, unused leave or redundancy). The tax on these depends on the payment code, your age and the tax-free limits, so the amount has been shown for review rather than taxed at your normal rate. Check the payment summary for the code and the tax-free part.',
};

export const SUPER_INCOME_REVIEW: FlagRule = {
  code: 'SUPER_INCOME_REVIEW',
  kind: 'review',
  severity: 'warning',
  questionIds: [Q.sup.received, Q.sup.element, Q.sup.age],
  atoRef: ATO.superIncome,
  when: (a) => {
    if (a.string(Q.sup.received) !== 'yes') return false;
    const age = a.number(Q.sup.age);
    return !(a.string(Q.sup.element) === 'taxed' && age !== undefined && age >= 60);
  },
  message: () =>
    'You received a super income stream or lump sum. Unless you are 60 or over and the fund has already paid tax on the money, part of it may be taxable with an offset. The amount has been shown for review. Check the payment summary from the fund for the taxed and untaxed parts.',
};

export const PSI_REVIEW: FlagRule = {
  code: 'PSI_REVIEW',
  kind: 'review',
  severity: 'warning',
  questionIds: [Q.bus.psiResults, Q.bus.psi80, Q.bus.psiUnrelated],
  atoRef: ATO.psi,
  when: (a) =>
    a.string(Q.bus.psiResults) === 'yes' ||
    a.string(Q.bus.psi80) === 'yes' ||
    a.isNotSure(Q.bus.psiResults) ||
    a.isNotSure(Q.bus.psi80),
  message: () =>
    'Most of your business income may come from your own skills or effort (personal services income). Special rules limit which business expenses can be deducted and may treat the income as yours even if it went through a company or trust. Check whether the results test or the 80% rule applies to you.',
};

export const BUSINESS_LOSS_REVIEW: FlagRule = {
  code: 'BUSINESS_LOSS_REVIEW',
  kind: 'review',
  severity: 'warning',
  questionIds: [Q.bus.income, Q.bus.expenses, Q.bus.ptShare],
  atoRef: ATO.losses,
  when: (a) => {
    const income = a.cents(Q.bus.income);
    const expenses = a.cents(Q.bus.expenses);
    if (income !== undefined && expenses !== undefined && expenses > income) return true;
    return a.items(GROUPS.partnershipTrust).some((it) => (a.cents(Q.bus.ptShare, it.id) ?? 0) < 0);
  },
  message: () =>
    'Your business or partnership made a loss this year. A loss from a business activity can only reduce your other income if one of the non-commercial loss tests is met; otherwise it is carried forward. The loss has been set aside for review. Check the tests before relying on the estimate.',
};

export const LOSS_CARRIED_FORWARD: FlagRule = {
  code: 'LOSS_CARRIED_FORWARD',
  kind: 'review',
  severity: 'info',
  questionIds: [],
  atoRef: ATO.losses,
  when: (_a, ctx) => {
    const t = ctx.estimate.totals;
    if (t.carriedForwardLossCents > 0) return true;
    return t.taxableIncomeCents === 0 && t.assessableIncomeCents - t.deductionsCents < 0;
  },
  message: (_a, ctx) => {
    const t = ctx.estimate.totals;
    const loss = t.carriedForwardLossCents > 0 ? t.carriedForwardLossCents : t.deductionsCents - t.assessableIncomeCents;
    return `Your deductions are more than your income this year, so taxable income is nil and a loss of ${formatCents(loss)} is carried forward. It can reduce your taxable income in a later year. Keep a record of it for next year's return.`;
  },
};

export const AMENDMENT_DIFFERENCE: FlagRule = {
  code: 'AMENDMENT_DIFFERENCE',
  kind: 'review',
  severity: 'info',
  questionIds: [Q.core.assessedResult],
  atoRef: ATO.amendment,
  when: (a) => a.has(Q.core.assessedResult),
  message: (a, ctx) => {
    const assessed = a.cents(Q.core.assessedResult) ?? 0;
    const estimated = ctx.estimate.totals.resultCents;
    const diff = estimated - assessed;
    const direction = diff > 0 ? `${formatCents(diff)} better for you` : diff < 0 ? `${formatCents(-diff)} worse for you` : 'no different';
    return `Your notice of assessment showed ${describeResult(assessed)}. This estimate shows ${describeResult(estimated)}, which is ${direction}. ${
      diff === 0 ? 'No amendment appears to be needed on these answers.' : 'That difference is what an amendment would change. Check which answers differ from what was lodged.'
    }`;
  },
};

export const INCOME_STATEMENT_NOT_TAX_READY: FlagRule = perInstance(
  { code: 'INCOME_STATEMENT_NOT_TAX_READY', kind: 'review', severity: 'warning', atoRef: ATO.taxReady },
  (a): FlagInstance[] =>
    a
      .items(GROUPS.employer)
      .filter((it) => a.string(Q.emp.taxReady, it.id) === 'no' || a.isNotSure(Q.emp.taxReady, it.id))
      .map((it) => {
        const name = a.string(Q.emp.name, it.id);
        return {
          questionIds: [answerKey(Q.emp.taxReady, it.id)],
          message: `The income statement from ${name ? `"${name}"` : 'one employer'} is not marked as tax ready, or you were not sure. Figures on an income statement can change until the employer finalises it. Check myGov for the tax ready status before relying on the amounts.`,
        };
      }),
);

export const REVIEW_RULES: FlagRule[] = [
  ANY_NOT_SURE,
  DEDUCTION_RATIO_HIGH,
  NO_EVIDENCE,
  LUMP_SUM_E_LSPIA,
  WORKCOVER_CAPITAL_LUMP,
  MANUAL_REVIEW_MODULE,
  NOT_SURE_OCCUPATION_TAGS,
  TEMP_RESIDENT_FOREIGN_CGT,
  DUAL_RESIDENT_TREATY,
  PART_YEAR_RESIDENT,
  CGT_MAIN_RESIDENCE_PART,
  ETP_REVIEW,
  SUPER_INCOME_REVIEW,
  PSI_REVIEW,
  BUSINESS_LOSS_REVIEW,
  LOSS_CARRIED_FORWARD,
  AMENDMENT_DIFFERENCE,
  INCOME_STATEMENT_NOT_TAX_READY,
];
