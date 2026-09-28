/** M6 WorkCover, compensation, Lump Sum E and termination payments. Universal. */
import type { Option, Question } from '../engine/types';
import { GROUPS, Q } from './ids';
import { flatten, includes, money, opt, repeater, screening, single, singleAllowListed, text, yesNoUnsure, date } from './shared';

const L = GROUPS.lumpSumEYear;
const ARREARS = includes(Q.comp.received, 'arrears');

/** Financial years a Lump Sum E amount can relate to (accrual years). Allow-listed: no not_sure. */
export const LSE_FY_OPTIONS: Option[] = [
  '2015-16', '2016-17', '2017-18', '2018-19', '2019-20', '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26',
].map((fy) => opt(fy, fy.replace('-', '–')));

function amt(id: string, type: string, prompt: string, income: Question['income'], help: string, feeds: string[]): Question {
  return money(id, 'compensation', prompt, { showIf: includes(Q.comp.received, type), income, help, feeds, validation: [{ kind: 'min', value: 0 }] });
}

export const COMPENSATION_QUESTIONS: Question[] = flatten(
  ...screening(Q.comp.received, 'compensation', 'Did you receive any of these payments this year?', [
    opt('weekly', 'Weekly or periodic WorkCover / workers compensation payments', 'Regular payments that replaced your wages while you were off work. These are income.'),
    opt('arrears', 'Arrears (back pay) of weekly compensation payments', 'A lump sum of weekly payments that related to earlier years. This can qualify for a special offset.'),
    opt('medical', 'Medical, treatment or rehabilitation reimbursements', 'Money paid to cover treatment costs. Not income.'),
    opt('impairment', 'Permanent impairment or non-economic loss lump sum', 'A one-off payment for a permanent injury. Usually not income, but it depends on the terms.'),
    opt('economic_loss', 'Economic loss or loss of earning capacity lump sum', 'A one-off payment for lost future earnings. Treatment depends on the settlement; flagged for review.'),
    opt('common_law', 'Common-law settlement or damages', 'A court or negotiated settlement for an injury. Usually capital, but flagged for review.'),
    opt('interest', 'Interest on a compensation payment', 'Interest added to a late payment. Interest is income.'),
    opt('legal', 'Legal costs reimbursed to me', 'Money paid to cover your legal fees. Not income.'),
    opt('income_protection', 'Income protection insurance payments', 'Payments from a policy that replaces your income. These are income.'),
    opt('sickness', 'Sickness or accident insurance payments', 'Payments from a sickness or accident policy. These are income.'),
  ], {
    help: 'Compensation payments are treated differently depending on what they replace: wages, treatment costs, or a permanent injury. Ticking the right ones lets the report show the usual treatment of each.',
  }),

  amt(Q.comp.weeklyAmount, 'weekly', 'What was the total of the weekly compensation payments?', { category: 'compensation', treatment: 'I' }, 'Use the payment summary or income statement from the insurer or employer.', ['income']),
  money(Q.comp.weeklyWithheld, 'compensation', 'How much tax was withheld from the weekly payments?', {
    showIf: includes(Q.comp.received, 'weekly'), credit: 'payg_withheld', feeds: ['credits'], validation: [{ kind: 'min', value: 0 }],
    help: 'Shown on the payment summary. It is credited against your tax.',
  }),

  amt(Q.comp.arrearsAmount, 'arrears', 'What was the total of the arrears payment?', { category: 'lump_sum_e', treatment: 'I' }, 'The lump sum of back pay you received this year. We will ask which earlier years it relates to.', ['income', 'lspia']),
  date('comp.arrears.date', 'compensation', 'On what date was the arrears payment made?', { showIf: ARREARS, validation: [{ kind: 'inFinancialYear' }], feeds: ['lspia'], help: 'The payment date decides which amounts accrued more than 12 months earlier.' }),

  amt(Q.comp.medicalAmount, 'medical', 'What was the total of the medical or treatment reimbursements?', { category: 'compensation', treatment: 'N' }, 'Recorded but not added to income.', ['income']),

  amt(Q.comp.impairmentAmount, 'impairment', 'How much was the permanent impairment lump sum?', { category: 'compensation', treatment: 'R' }, 'Usually a capital payment, not income, but it depends on the settlement terms. We list it for review, never add it silently.', ['income']),

  amt(Q.comp.economicLossAmount, 'economic_loss', 'How much was the economic loss lump sum?', { category: 'compensation', treatment: 'R' }, 'Treatment depends on whether it replaces income or compensates for a capital loss. Listed for review.', ['income']),

  amt(Q.comp.commonLawAmount, 'common_law', 'How much was the common-law settlement?', { category: 'compensation', treatment: 'R' }, 'Personal injury settlements are usually not income, but the terms decide. Listed for review.', ['income']),

  amt(Q.comp.interestAmount, 'interest', 'How much interest did you receive on the compensation?', { category: 'interest', treatment: 'I' }, 'Interest is assessable income even when the main payment is not.', ['income']),
  amt(Q.comp.legalAmount, 'legal', 'How much of your legal costs were reimbursed?', { category: 'compensation', treatment: 'N' }, 'Recorded but not added to income.', ['income']),
  amt(Q.comp.incomeProtectionAmount, 'income_protection', 'How much did you receive from income protection insurance?', { category: 'compensation', treatment: 'I' }, 'Use the insurer\'s payment summary. These payments replace wages, so they are income.', ['income']),
  money('comp.income_protection.withheld', 'compensation', 'How much tax was withheld from the income protection payments?', {
    showIf: includes(Q.comp.received, 'income_protection'), credit: 'payg_withheld', feeds: ['credits'], validation: [{ kind: 'min', value: 0 }], required: false,
    help: 'Insurers sometimes withhold tax. Leave blank if none was withheld.',
  }),
  amt(Q.comp.sicknessAmount, 'sickness', 'How much did you receive from sickness or accident insurance?', { category: 'compensation', treatment: 'I' }, 'These payments replace wages, so they are income.', ['income']),
  text(Q.comp.otherText, 'compensation', 'Who paid the other compensation amount?', { showIf: includes(Q.comp.received, 'other'), validation: [{ kind: 'maxLength', value: 120 }] }),
  amt(Q.comp.otherAmount, 'other', 'How much was the other compensation amount?', { category: 'compensation', treatment: 'R' }, 'Listed for review so its treatment can be checked.', ['income']),

  // ---- Lump Sum E accrual years ----
  repeater(Q.comp.lseRepeater, 'compensation', 'Which earlier years does the back pay relate to?', {
    groupId: L,
    itemLabel: 'Earlier financial year',
    addLabel: 'Add another year',
    minItems: 1,
    labelFrom: Q.comp.lseFy,
  }, {
    help: 'Add one entry per earlier year the arrears cover. If the total is $1,200 or more, a lump sum in arrears offset may reduce your tax; it needs each year\'s amount.',
    showIf: ARREARS,
  }),
  singleAllowListed(Q.comp.lseFy, 'compensation', 'Which financial year does this part of the back pay relate to?', LSE_FY_OPTIONS, {
    repeaterGroup: L, showIf: ARREARS, feeds: ['lspia'],
    help: 'The year the money should originally have been paid, not the year you received it.',
  }),
  money(Q.comp.lseAmount, 'compensation', 'How much of the back pay relates to this year?', {
    repeaterGroup: L, showIf: ARREARS, feeds: ['lspia'], validation: [{ kind: 'min', value: 0 }],
    help: 'The payer\'s letter or statement usually breaks the lump sum down by year.',
  }),
  yesNoUnsure(Q.comp.lseOver12m, 'compensation', 'Did this amount accrue more than 12 months before it was paid?', {
    repeaterGroup: L, showIf: ARREARS, feeds: ['lspia'],
    help: 'Only amounts that were owed for more than 12 months before payment count towards the offset.',
  }),
  money(Q.comp.lseTaxableIncome, 'compensation', 'What was your taxable income in that earlier year, if you know it?', {
    repeaterGroup: L, showIf: ARREARS, required: false, feeds: ['lspia'], validation: [{ kind: 'min', value: 0 }],
    help: 'From that year\'s notice of assessment. The offset compares the tax you pay now with the tax you would have paid then. Leave blank if you cannot find it; we will flag it.',
  }),

  // ---- Termination payments ----
  ...screening(Q.comp.etpReceived, 'compensation', 'Did you receive any of these when a job ended?', [
    opt('etp', 'An employment termination payment (ETP)', 'A payment shown on a separate ETP payment summary, such as a golden handshake, payment in lieu of notice, or the taxable part of a redundancy.'),
    opt('unused_leave', 'Unused annual or long service leave paid out', 'These appear as Lump Sum A or B on the income statement. Enter them in the employer section.'),
    opt('redundancy', 'A genuine redundancy payment', 'The tax-free part appears as Lump Sum D; any excess is an ETP.'),
  ], {
    help: 'Payments when a job ends have their own tax rules. ETPs are routed to manual review because each part is taxed differently.',
  }),
  money(Q.comp.etpAmount, 'compensation', 'What was the total ETP amount on the payment summary?', {
    showIf: includes(Q.comp.etpReceived, 'etp'), income: { category: 'etp', treatment: 'R' }, feeds: ['income'], validation: [{ kind: 'min', value: 0 }],
    help: 'The taxable component plus any tax-free component. We list it for manual review.',
  }),
  single(Q.comp.etpCode, 'compensation', 'Which ETP code is shown on the payment summary?', [
    opt('R', 'R', 'Paid because of redundancy, invalidity, early retirement, or a compensation settlement.'),
    opt('O', 'O', 'Any other reason, such as resignation or retirement.'),
    opt('S', 'S', 'Code R payment relating to an earlier termination, received this year.'),
    opt('P', 'P', 'Code O payment relating to an earlier termination, received this year.'),
    opt('D', 'D', 'Death benefit paid to a dependant.'),
    opt('N', 'N', 'Death benefit paid to a non-dependant.'),
    opt('B', 'B', 'Death benefit, dependant, earlier termination.'),
    opt('T', 'T', 'Death benefit, non-dependant, earlier termination.'),
  ], { showIf: includes(Q.comp.etpReceived, 'etp'), help: 'The code sets the tax rate cap that applies to the ETP.' }),
  money('etp.withheld', 'compensation', 'How much tax was withheld from the ETP?', {
    showIf: includes(Q.comp.etpReceived, 'etp'), credit: 'payg_withheld', feeds: ['credits'], validation: [{ kind: 'min', value: 0 }],
  }),
  money('etp.redundancy.amount', 'compensation', 'What was the total redundancy payment?', {
    showIf: includes(Q.comp.etpReceived, 'redundancy'), income: { category: 'etp', treatment: 'R' }, feeds: ['income'], validation: [{ kind: 'min', value: 0 }],
    help: 'The whole redundancy amount. The tax-free part (Lump Sum D) should also be on the income statement; we reconcile them in review.',
  }),
);
