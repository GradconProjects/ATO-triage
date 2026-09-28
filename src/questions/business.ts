/** M13 business, sole trader, partnerships and trusts. Universal; answering "yes" to sole trader adds the sole_trader tag. */
import type { Question } from '../engine/types';
import { GROUPS, Q } from './ids';
import { flatten, money, multi, noneOption, opt, repeater, single, text, yes, yesNoUnsure } from './shared';

const P = GROUPS.partnershipTrust;
const ST = yes(Q.bus.soleTrader);
const PT = yes(Q.bus.ptAny);

export const BUSINESS_QUESTIONS: Question[] = flatten(
  yesNoUnsure(Q.bus.soleTrader, 'business', 'Did you run a business as a sole trader this year?', {
    help: 'Working for yourself under your own ABN: contracting, gig work, a side business, or freelancing. Business income is taxed with your other income, and business costs reduce it.',
    addsTags: { yes: ['sole_trader'] },
    feeds: ['business'],
  }),
  text(Q.bus.abn, 'business', 'What is your ABN? (optional)', {
    showIf: ST,
    help: 'Optional. Helps match the business to ATO records.',
    validation: [{ kind: 'pattern', value: '^\\s*\\d{2}\\s?\\d{3}\\s?\\d{3}\\s?\\d{3}\\s*$', message: 'An ABN is 11 digits.' }],
  }),
  money(Q.bus.income, 'business', 'What was the total business income (sales, fees) for the year?', {
    showIf: ST, income: { category: 'business', treatment: 'I' }, calc: { business: 'income' }, feeds: ['business'], validation: [{ kind: 'min', value: 0 }],
    help: 'All amounts you invoiced or received for the business, excluding GST if you are registered.',
  }),
  money(Q.bus.expenses, 'business', 'What were the total business expenses for the year?', {
    showIf: ST, calc: { business: 'expenses' }, feeds: ['business'], validation: [{ kind: 'min', value: 0 }],
    help: 'Costs of running the business: materials, subcontractors, insurance, vehicle, phone, software. Keep the breakdown for your records; we ask for the total here.',
  }),
  yesNoUnsure(Q.bus.gst, 'business', 'Were you registered for GST?', {
    showIf: ST, feeds: ['business'],
    help: 'If registered, enter income and expenses without GST. Registration is required once turnover reaches $75,000.',
  }),
  yesNoUnsure(Q.bus.psi80, 'business', 'Did 80% or more of the business income come from one client?', {
    showIf: ST, feeds: ['business'],
    help: 'Income mainly from your own skills (personal services income) has special rules. Income mostly from one client is the first test.',
  }),
  yesNoUnsure(Q.bus.psiResults, 'business', 'Were you paid to produce a result, using your own tools, with liability for fixing defects?', {
    showIf: ST, feeds: ['business'],
    help: 'This is the "results test". Passing it means the personal services income rules do not restrict your deductions.',
  }),
  yesNoUnsure(Q.bus.psiUnrelated, 'business', 'Did you get work from two or more unrelated clients through advertising or word of mouth?', {
    showIf: ST, feeds: ['business'],
    help: 'The "unrelated clients test". Any "not sure" on the PSI questions sends the business to manual review.',
  }),
  yesNoUnsure('bus.loss', 'business', 'Did the business make a loss this year?', {
    showIf: ST, feeds: ['business'],
    help: 'A business loss can only offset other income if one of the non-commercial loss tests is met. Otherwise it is carried forward.',
  }),
  multi('bus.loss.tests', 'business', 'Which of these applied to the business?', [
    opt('income_20k', 'Business income was at least $20,000'),
    opt('profit_3_of_5', 'It made a profit in at least 3 of the last 5 years'),
    opt('property_500k', 'It uses real property worth at least $500,000'),
    opt('assets_100k', 'It uses other assets worth at least $100,000'),
    noneOption('None of these'),
  ], { showIf: yes('bus.loss'), feeds: ['business'], help: 'The non-commercial loss tests. If none apply, the loss is deferred; either way it goes to manual review.' }),

  // ---- Partnerships and trusts ----
  yesNoUnsure(Q.bus.ptAny, 'business', 'Did you receive a share of income from a partnership or a family trust this year?', {
    help: 'Not managed funds (those are in Investments). A business partnership or a discretionary trust sends you a distribution statement.',
    feeds: ['income'],
  }),
  repeater(Q.bus.ptRepeater, 'business', 'Your partnership or trust distributions', {
    groupId: P, itemLabel: 'Partnership or trust', addLabel: 'Add another partnership or trust', minItems: 1, labelFrom: Q.bus.ptName,
  }, { showIf: PT }),
  text(Q.bus.ptName, 'business', 'What is the name of the partnership or trust?', { repeaterGroup: P, showIf: PT, required: true, validation: [{ kind: 'maxLength', value: 120 }] }),
  single('bus.pt.type', 'business', 'Is it a partnership or a trust?', [opt('partnership', 'Partnership'), opt('trust', 'Trust')], { repeaterGroup: P, showIf: PT, feeds: ['income'] }),
  money(Q.bus.ptShare, 'business', 'What was your share of the net income (or loss) for the year?', {
    repeaterGroup: P, showIf: PT, allowNegative: true, income: { category: 'partnership_trust', treatment: 'I' }, feeds: ['income'],
    help: 'From the distribution statement. Enter a partnership loss as a negative amount; losses are routed to review.',
  }),
  money(Q.bus.ptCredits, 'business', 'What franking credits or other tax credits came with the distribution?', {
    repeaterGroup: P, showIf: PT, required: false, credit: 'franking_credit', feeds: ['credits'], validation: [{ kind: 'min', value: 0 }],
    help: 'Leave blank if none.',
  }),
);
