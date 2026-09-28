/** M15 super contributions. Universal. */
import type { Question } from '../engine/types';
import { Q } from './ids';
import { ATO, deductionSet, flatten, isIn, money, opt, single, yes, yesNoUnsure, all } from './shared';

const PERSONAL_ON = yes(Q.supc.personalAny);
const SPOUSE = isIn(Q.fam.spouse, ['all_year', 'part_year']);

export const SUPER_QUESTIONS: Question[] = flatten(
  yesNoUnsure(Q.supc.personalAny, 'super_contributions', 'Did you make personal after-tax super contributions that you intend to claim as a deduction?', {
    atoRef: ATO.personalSuper, feeds: ['deductions'],
    help: 'Money you paid into super from your own bank account (not salary sacrifice). You can claim it only if you gave the fund a "notice of intent" and the fund acknowledged it in writing before you lodge.',
  }),
  ...deductionSet({
    base: 'supc.personal', module: 'super_contributions', category: 'personal_super', treatment: 'D', atoRef: ATO.personalSuper, showIf: PERSONAL_ON,
    paidPrompt: 'Did you pay the contribution from your own after-tax money?',
    prompt: 'How much do you intend to claim as a personal super deduction?',
    help: 'The amount on your notice of intent. It counts towards the concessional cap along with employer super.',
    feeds: ['deductions', 'super_contribution'],
    purpose: [
      single(Q.supc.noi, 'super_contributions', 'What is the status of your notice of intent to claim?', [
        opt('acknowledged', 'Lodged with the fund, and the fund has acknowledged it in writing', 'This is required before the deduction is allowed.'),
        opt('lodged_not_acknowledged', 'Lodged with the fund, but no acknowledgement yet', 'The deduction is blocked until the acknowledgement arrives.'),
        opt('not_yet', 'Not lodged yet', 'You must lodge it with the fund before you lodge your tax return, or before the end of the next financial year if earlier.'),
      ], { feeds: ['deductions', 'super_contribution'], help: 'Without an acknowledged notice, the ATO will not allow the deduction. We treat a missing acknowledgement as a blocker.' }),
    ],
  }),
  single(Q.supc.tsbRange, 'super_contributions', 'What was your total super balance on 30 June of the previous year?', [
    opt('under_500k', 'Under $500,000', 'You may be able to use unused concessional cap from up to five earlier years.'),
    opt('over_500k', '$500,000 or more', 'Carry-forward of unused cap is not available.'),
  ], { showIf: PERSONAL_ON, feeds: ['super_contribution'], help: 'Your fund statement or myGov shows the balance. It decides whether you can use unused cap from earlier years.' }),
  yesNoUnsure(Q.supc.carryForward, 'super_contributions', 'Do you intend to use unused concessional cap from earlier years?', {
    showIf: all(PERSONAL_ON, { q: Q.supc.tsbRange, eq: 'under_500k' }), feeds: ['super_contribution'],
    help: 'Unused cap from the previous five years can be carried forward if your total super balance was under $500,000. myGov shows your unused amounts.',
  }),
  yesNoUnsure('supc.spouse.any', 'super_contributions', 'Did you pay super contributions for your spouse this year?', {
    showIf: SPOUSE, feeds: ['offsets'],
    help: 'Contributions you paid into your spouse\'s super may earn a tax offset of up to $540 if their income was low.',
  }),
  money(Q.supc.spouseAmount, 'super_contributions', 'How much did you contribute to your spouse\'s super?', {
    showIf: yes('supc.spouse.any'), feeds: ['offsets'], validation: [{ kind: 'min', value: 0 }],
    help: 'The offset depends on your spouse\'s income entered earlier.',
  }),
);
