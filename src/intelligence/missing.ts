/**
 * Missing flags: something the estimate needs has not been answered or confirmed.
 */
import { Q, GROUPS } from '../questions/ids';
import { answerKey, formatCents, perInstance, questionById } from './helpers';
import type { FlagInstance, FlagRule } from './types';

const ATO = {
  noi: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/how-to-save-more-in-your-super/personal-super-contributions',
  wfh: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/working-from-home-expenses',
  capitalLosses: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/capital-losses',
  crypto: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/crypto-asset-investments',
  whm: 'https://www.ato.gov.au/individuals-and-families/coming-to-australia-or-going-overseas/coming-to-australia/working-holiday-makers',
  medicareExemption: 'https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/medicare-levy/medicare-levy-exemption',
  phiRebate: 'https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/private-health-insurance-rebate',
  prefill: 'https://www.ato.gov.au/individuals-and-families/your-tax-return/before-you-prepare-your-tax-return/pre-fill-information',
};

export const SUPER_NOI_MISSING: FlagRule = {
  code: 'SUPER_NOI_MISSING',
  kind: 'missing',
  severity: 'blocker',
  questionIds: [Q.supc.personalAmount, Q.supc.noi],
  atoRef: ATO.noi,
  when: (a) => (a.cents(Q.supc.personalAmount) ?? 0) > 0 && a.string(Q.supc.noi) !== 'acknowledged',
  message: (a) =>
    `You entered ${formatCents(a.cents(Q.supc.personalAmount) ?? 0)} of personal super contributions but your fund has not acknowledged a notice of intent to claim. The deduction has been removed until the fund's acknowledgement is received. Check whether the notice has been lodged with the fund and acknowledged in writing.`,
};

export const WEAK_HOURS_RECORDS: readonly string[] = ['estimate', 'none'] as const;

export const WFH_NO_RECORD: FlagRule = {
  code: 'WFH_NO_RECORD',
  kind: 'missing',
  severity: 'warning',
  questionIds: [Q.ded.wfhMethod, Q.ded.wfhHoursRecord],
  atoRef: ATO.wfh,
  when: (a) => {
    if (a.string(Q.ded.wfhMethod) !== 'fixed_rate') return false;
    const record = a.string(Q.ded.wfhHoursRecord);
    return record === undefined || WEAK_HOURS_RECORDS.includes(record);
  },
  message: () =>
    'You are using the fixed rate for working from home, but there is no record of the actual hours you worked at home. The fixed rate needs a record of all hours for the year (a diary, roster or timesheet), not an estimate. Check whether you have such a record.',
};

export const PRIOR_LOSSES_UNANSWERED: FlagRule = {
  code: 'PRIOR_LOSSES_UNANSWERED',
  kind: 'missing',
  severity: 'warning',
  questionIds: [Q.cgt.priorLosses],
  atoRef: ATO.capitalLosses,
  when: (a) => a.items(GROUPS.cgtEvent).length > 0 && a.state(Q.cgt.priorLosses) !== 'answered',
  message: () =>
    'You sold an asset this year but have not said whether you have capital losses from earlier years. Losses carried forward reduce the gain before tax, so the estimate may be too high. Check last year\'s return for a net capital loss carried forward.',
};

export const CRYPTO_METHOD_MISSING: FlagRule = {
  code: 'CRYPTO_METHOD_MISSING',
  kind: 'missing',
  severity: 'warning',
  questionIds: [Q.cgt.cryptoMethod],
  atoRef: ATO.crypto,
  when: (a) => {
    const hasCrypto =
      (a.list(Q.cgt.events) ?? []).includes('crypto') || a.items(GROUPS.cgtEvent).some((it) => a.string(Q.cgt.assetType, it.id) === 'crypto');
    if (!hasCrypto) return false;
    const method = a.string(Q.cgt.cryptoMethod);
    return method === undefined || method === 'not_sure';
  },
  message: () =>
    'You had crypto disposals but have not said how you matched each sale to its purchase (specific identification or first-in first-out). The method changes the gain. Check what your exchange records or tax software used.',
};

export const WHM_INCOME_MISSING: FlagRule = {
  code: 'WHM_INCOME_MISSING',
  kind: 'missing',
  severity: 'warning',
  questionIds: [Q.res.status, Q.res.whmIncome],
  atoRef: ATO.whm,
  when: (a) => a.string(Q.res.status) === 'whm' && !a.has(Q.res.whmIncome),
  message: () =>
    'You were a working holiday maker but have not entered the income earned while on that visa. Working holiday income is taxed at its own rates from the first dollar, so the estimate cannot apply them yet. Check your income statement for the amount.',
};

export const MEDICARE_EXEMPTION_DAYS_MISSING: FlagRule = {
  code: 'MEDICARE_EXEMPTION_DAYS_MISSING',
  kind: 'missing',
  severity: 'warning',
  questionIds: [Q.med.exemption, Q.med.exemptDays],
  atoRef: ATO.medicareExemption,
  when: (a) => a.string(Q.med.exemption) === 'part_year' && a.number(Q.med.exemptDays) === undefined,
  message: () =>
    'You said you were exempt from the Medicare levy for part of the year but have not entered the number of days. The levy is reduced by the exempt days, so the full levy has been estimated for now. Check your Medicare entitlement statement for the dates.',
};

/**
 * "Yes" with nothing behind it: a visible list (interest accounts, employers, policies...) with no
 * entries, or a visible required amount with no answer at all. The item is not counted, so the
 * estimate is incomplete: an unresolved issue, never a silent zero.
 */
export const UNRESOLVED_AMOUNT: FlagRule = perInstance(
  { code: 'UNRESOLVED_AMOUNT', kind: 'missing', severity: 'warning' },
  (a, ctx): FlagInstance[] => {
    const out: FlagInstance[] = [];
    for (const q of ctx.questions) {
      if (q.type === 'repeater' && q.repeater && ctx.visible.has(q.id) && (q.repeater.minItems ?? 0) > 0 && a.items(q.repeater.groupId).length === 0) {
        out.push({ questionIds: [q.id], message: `"${q.prompt}": you answered yes, but nothing has been added yet, so it is not counted. Add the details (or change the earlier answer).` });
      }
      if (q.type === 'money' && q.required && !q.repeaterGroup && ctx.visible.has(q.id) && a.get(q.id) === undefined && (q.income || q.deduction || q.credit)) {
        out.push({ questionIds: [q.id], message: `"${q.prompt}" has no amount yet, so it is not counted in the estimate.` });
      }
    }
    return out;
  },
);

export const IMPORT_UNCONFIRMED: FlagRule = perInstance(
  { code: 'IMPORT_UNCONFIRMED', kind: 'missing', severity: 'warning', atoRef: ATO.prefill },
  (a, ctx): FlagInstance[] =>
    a
      .records()
      .filter((r) => r.state === 'imported')
      .sort((x, y) => answerKey(x.questionId, x.repeaterItemId).localeCompare(answerKey(y.questionId, y.repeaterItemId)))
      .map((r) => ({
        questionIds: [answerKey(r.questionId, r.repeaterItemId)],
        message: `"${questionById(ctx, r.questionId)?.prompt ?? r.questionId}" was filled from a document or last year's case and has not been confirmed. Imported figures are not used until you confirm them. Check the value and confirm it.`,
      })),
);

export const SKIPPED_REQUIRED: FlagRule = perInstance(
  { code: 'SKIPPED_REQUIRED', kind: 'missing', severity: 'warning' },
  (a, ctx): FlagInstance[] =>
    a
      .records()
      .filter((r) => r.state === 'skipped' && (questionById(ctx, r.questionId)?.required ?? true))
      .sort((x, y) => answerKey(x.questionId, x.repeaterItemId).localeCompare(answerKey(y.questionId, y.repeaterItemId)))
      .map((r) => ({
        questionIds: [answerKey(r.questionId, r.repeaterItemId)],
        message: `"${questionById(ctx, r.questionId)?.prompt ?? r.questionId}" was skipped. It is needed for the estimate, so go back and answer it.`,
      })),
);

export const MISSING_RULES: FlagRule[] = [
  SUPER_NOI_MISSING,
  WFH_NO_RECORD,
  PRIOR_LOSSES_UNANSWERED,
  CRYPTO_METHOD_MISSING,
  WHM_INCOME_MISSING,
  MEDICARE_EXEMPTION_DAYS_MISSING,
  UNRESOLVED_AMOUNT,
  IMPORT_UNCONFIRMED,
  SKIPPED_REQUIRED,
];
