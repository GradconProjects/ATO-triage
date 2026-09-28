/** M16 offsets, study loans, tax paid and the completeness gate. Universal. */
import type { Question } from '../engine/types';
import { Q } from './ids';
import { flatten, includesAny, money, multiAllowListed, noneOption, opt, single, yes, yesNoUnsure, multi } from './shared';

const LOAN_TYPES = ['help', 'vsl', 'ssl', 'abstudy_ssl', 'aasl'];

export const OFFSET_QUESTIONS: Question[] = flatten(
  yesNoUnsure('off.payg_instalments.any', 'offsets', 'Did you pay PAYG instalments to the ATO during the year?', {
    help: 'Quarterly or annual instalments the ATO asks some people with business or investment income to pay in advance. They are credited against your tax.',
    feeds: ['credits'],
  }),
  money(Q.off.paygInstalments, 'offsets', 'How much did you pay in PAYG instalments for the year?', {
    showIf: yes('off.payg_instalments.any'), credit: 'payg_instalment', feeds: ['credits'], validation: [{ kind: 'min', value: 0 }],
    help: 'The total of the instalments for this financial year, from your ATO account.',
  }),
  single(Q.off.zone, 'offsets', 'Did you live in a remote zone, or serve overseas with the defence force, for at least half the year?', [
    opt('none', 'No'),
    opt('zone_a', 'Yes, in Zone A', 'Remote areas such as much of northern Australia. The ATO zone list shows which towns qualify.'),
    opt('zone_b', 'Yes, in Zone B', 'Less remote areas listed by the ATO.'),
    opt('special', 'Yes, in a special area of Zone A or B', 'Very remote areas, more than 250 km from an urban centre.'),
    opt('overseas_forces', 'Yes, I served overseas with the Australian Defence Force or a UN force'),
  ], { help: 'The zone tax offset is small but real. Fly-in fly-out workers whose usual home is outside the zone do not qualify. Routed to review.', feeds: ['offsets'] }),
  yesNoUnsure(Q.off.invalidCarer, 'offsets', 'Did you support an invalid or carer relative who received a disability or carer payment?', {
    help: 'A spouse, parent, or child aged 16 or over who received a disability support pension, invalidity service pension or carer payment. Routed to review.',
    feeds: ['offsets'],
  }),
  yesNoUnsure(Q.off.saptoEligible, 'offsets', 'Were you of Age Pension age at 30 June, or receiving a qualifying pension?', {
    help: 'The seniors and pensioners tax offset (SAPTO) applies if you were old enough for the Age Pension, or received certain pensions, and your income is under the limit.',
    feeds: ['offsets'],
  }),
  single(Q.off.saptoStatus, 'offsets', 'Which situation applied to you at 30 June?', [
    opt('single', 'Single'),
    opt('couple', 'Member of a couple'),
    opt('couple_separated_illness', 'Member of a couple but living apart because of illness'),
  ], { showIf: yes(Q.off.saptoEligible), feeds: ['offsets'], help: 'The offset thresholds differ for singles and couples.' }),
  yesNoUnsure('off.fito.any', 'offsets', 'Did you pay foreign tax on any income other than what you entered in the Foreign income section?', {
    help: 'For example foreign tax withheld on a payment that was reported elsewhere. Most people answer No; foreign tax on foreign income is already captured.',
    feeds: ['offsets'],
  }),
  money(Q.off.fitoPaid, 'offsets', 'How much other foreign tax did you pay (in AUD)?', {
    showIf: yes('off.fito.any'), credit: 'foreign_tax_paid', feeds: ['offsets', 'credits'], validation: [{ kind: 'min', value: 0 }],
    help: 'Used for the foreign income tax offset. Do not repeat amounts entered in the Foreign income or Investments sections.',
  }),

  // ---- Study and training support loans ----
  multi(Q.loan.types, 'offsets', 'Did you have any of these study or training loans at 1 June?', [
    opt('help', 'HELP (HECS-HELP, FEE-HELP)', 'University or higher education loans.'),
    opt('vsl', 'VET Student Loan (VSL)'),
    opt('ssl', 'Student Start-up Loan (SSL)'),
    opt('abstudy_ssl', 'ABSTUDY Student Start-up Loan'),
    opt('aasl', 'Australian Apprenticeship Support Loan (AASL, formerly Trade Support Loan)'),
    noneOption('None of these'),
  ], {
    help: 'Compulsory repayments are worked out on your repayment income (taxable income plus fringe benefits, reportable super and net investment losses) and added to your tax bill.',
    feeds: ['study_loan'],
  }),
  money(Q.loan.balance, 'offsets', 'What was the total loan balance at 1 June?', {
    showIf: includesAny(Q.loan.types, LOAN_TYPES), feeds: ['study_loan'], validation: [{ kind: 'min', value: 0 }],
    help: 'Your myGov account shows the balance. The repayment cannot exceed what you owe.',
  }),

  // ---- Completeness gate ----
  multiAllowListed(Q.gate.checks, 'offsets', 'Which of these have you done?', [
    opt('income_statements', 'I checked every income statement is "Tax ready" and entered'),
    opt('prefill', 'I reviewed the ATO pre-fill information in myGov'),
    opt('statements', 'I reviewed my bank, dividend and fund statements'),
    opt('evidence', 'I hold receipts or records for every deduction entered'),
    opt('prior_losses', 'I entered any prior-year capital or business losses'),
    opt('not_sure_reviewed', 'I went back over every "Not sure" answer'),
    noneOption('None of these yet'),
  ], {
    help: 'A report can only be marked Final when every item is ticked. Until then it stays a Draft with a watermark. Nothing here changes the estimate.',
    feeds: ['gate'],
  }),
);
