/** M13 business, sole trader, partnerships and trusts. Universal; answering "yes" to sole trader adds the sole_trader tag. */
import type { Question } from '../engine/types';
import { GROUPS, Q } from './ids';
import { all, flatten, money, multi, noneOption, opt, percent, repeater, single, text, yes, yesNoUnsure } from './shared';

const BA = GROUPS.businessActivity;
const BA_ON = yes(Q.bus.activityAny);
const LOSS_TEST_OPTIONS = [
  opt('income_20k', 'Business income was at least $20,000'),
  opt('profit_3_of_5', 'It made a profit in at least 3 of the last 5 years'),
  opt('property_500k', 'It uses real property worth at least $500,000'),
  opt('assets_100k', 'It uses other assets worth at least $100,000'),
  noneOption('None of these'),
];

const P = GROUPS.partnershipTrust;
const ST = yes(Q.bus.soleTrader);
const PT = yes(Q.bus.ptAny);
const BIL = GROUPS.businessIncomeLine;
const BEL = GROUPS.businessExpenseLine;
const INCOME_MORE = all(ST, yes(Q.bus.incomeMoreAny));
const EXPENSE_MORE = all(ST, yes(Q.bus.expenseMoreAny));

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
  // ---- Extra itemised income and expenses (added to the totals above) ----
  yesNoUnsure(Q.bus.incomeMoreAny, 'business', 'Do you want to add more business income, item by item?', {
    showIf: ST, required: false, feeds: ['business'],
    help: 'For example a second client, a platform payout or a grant. Each item is added to the income above, so do not include anything already counted there.',
  }),
  repeater(Q.bus.incomeLineRepeater, 'business', 'More business income', {
    groupId: BIL, itemLabel: 'Income item', addLabel: 'Add more income', minItems: 1, labelFrom: Q.bus.incomeLineName,
  }, { showIf: INCOME_MORE }),
  text(Q.bus.incomeLineName, 'business', 'What was this income?', { repeaterGroup: BIL, showIf: INCOME_MORE, required: true, validation: [{ kind: 'maxLength', value: 120 }] }),
  money(Q.bus.incomeLineAmount, 'business', 'How much was it for the year?', {
    repeaterGroup: BIL, showIf: INCOME_MORE, calc: { business: 'income' }, feeds: ['business'], validation: [{ kind: 'min', value: 0 }],
    help: 'Excluding GST if you are registered.',
  }),
  yesNoUnsure(Q.bus.expenseMoreAny, 'business', 'Do you want to add more business expenses, item by item?', {
    showIf: ST, required: false, feeds: ['business'],
    help: 'Each item is added to the expenses above, so do not include anything already counted there. Personal expenses (for example your employee work deductions) do not go here.',
  }),
  repeater(Q.bus.expenseLineRepeater, 'business', 'More business expenses', {
    groupId: BEL, itemLabel: 'Expense item', addLabel: 'Add more expenses', minItems: 1, labelFrom: Q.bus.expenseLineName,
  }, { showIf: EXPENSE_MORE }),
  text(Q.bus.expenseLineName, 'business', 'What was this expense?', { repeaterGroup: BEL, showIf: EXPENSE_MORE, required: true, validation: [{ kind: 'maxLength', value: 120 }] }),
  single(Q.bus.expenseLineKind, 'business', 'What type of expense was it?', [
    opt('materials', 'Materials or stock'),
    opt('subcontractors', 'Subcontractors or contract labour'),
    opt('vehicle', 'Vehicle costs for the business'),
    opt('phone_internet', 'Phone and internet'),
    opt('insurance', 'Business insurance'),
    opt('rent', 'Rent or premises'),
    opt('software', 'Software and subscriptions'),
    opt('advertising', 'Advertising'),
    opt('fees', 'Bank, accounting or professional fees'),
    opt('equipment', 'Equipment or tools that last more than a year', 'Usually claimed over its life (or under small business rules), so it is checked separately.'),
    opt('other', 'Other'),
  ], { repeaterGroup: BEL, showIf: EXPENSE_MORE, feeds: ['business'] }),
  money(Q.bus.expenseLineAmount, 'business', 'How much was it for the year?', {
    repeaterGroup: BEL, showIf: EXPENSE_MORE, calc: { business: 'expenses' }, feeds: ['business'], validation: [{ kind: 'min', value: 0 }],
    help: 'Excluding GST if you are registered.',
  }),
  percent(Q.bus.expenseLinePct, 'business', 'What percentage was for the business? (optional)', {
    repeaterGroup: BEL, showIf: EXPENSE_MORE, required: false, feeds: ['business'],
    help: 'Only the business share counts. Leave blank if it was 100% for the business.',
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
  multi(Q.bus.lossTests, 'business', 'Which of these applied to the business?', LOSS_TEST_OPTIONS, { showIf: yes('bus.loss'), feeds: ['business'], help: 'The non-commercial loss tests. If none apply, the loss is deferred to a later year instead of reducing your other income.' }),
  text(Q.bus.name, 'business', 'In a few words, what does the business do? (optional)', {
    showIf: ST, required: false, validation: [{ kind: 'maxLength', value: 120 }],
    help: 'For example "electrical contracting" or "crypto trading". Keeps each business activity separate in the report.',
  }),
  money(Q.bus.priorDeferred, 'business', 'Deferred business losses from earlier years for this business (optional)', {
    showIf: ST, required: false, calc: { business: 'prior_deferred' }, feeds: ['business'], validation: [{ kind: 'min', value: 0 }],
    help: 'A loss from an earlier year that could not be used because no non-commercial loss test was met. It can only be used against future profit from this same activity. Leave blank if none.',
  }),

  // ---- Separate business activities ----
  yesNoUnsure(Q.bus.activityAny, 'business', 'Did you run any other, separate business activity this year?', {
    required: false, feeds: ['business'],
    help: 'For example crypto or futures trading carried on as a business, or selling trading signals. Each activity keeps its own income, expenses and losses. Occasional investing is not a business; enter those sales under Capital gains.',
  }),
  repeater(Q.bus.activityRepeater, 'business', 'Your other business activities', {
    groupId: BA, itemLabel: 'Business activity', addLabel: 'Add another business activity', minItems: 1, labelFrom: Q.bus.activityName,
  }, { showIf: BA_ON, help: 'One entry per separate activity. Enter each expense once, under the activity it belongs to.' }),
  text(Q.bus.activityName, 'business', 'What is this activity called?', { repeaterGroup: BA, showIf: BA_ON, required: true, validation: [{ kind: 'maxLength', value: 120 }] }),
  single(Q.bus.activityKind, 'business', 'What kind of activity is it?', [
    opt('crypto_trading', 'Crypto trading carried on as a business'),
    opt('derivatives_trading', 'Futures, CFD or other derivatives trading carried on as a business'),
    opt('trading_signals', 'Providing or selling trading signals or courses'),
    opt('other', 'Another kind of business'),
  ], { repeaterGroup: BA, showIf: BA_ON, feeds: ['business'] }),
  text(Q.bus.activityAbn, 'business', 'ABN for this activity (optional)', {
    repeaterGroup: BA, showIf: BA_ON, required: false,
    validation: [{ kind: 'pattern', value: '^\\s*\\d{2}\\s?\\d{3}\\s?\\d{3}\\s?\\d{3}\\s*$', message: 'An ABN is 11 digits.' }],
  }),
  money(Q.bus.activityIncome, 'business', 'What was the income from this activity for the year?', {
    repeaterGroup: BA, showIf: BA_ON, calc: { business: 'activity_income' }, feeds: ['business'], validation: [{ kind: 'min', value: 0 }],
    help: 'Sales, fees or trading gains of this activity. Enter 0 if it earned nothing.',
  }),
  money(Q.bus.activityExpSubscriptions, 'business', 'Signal, data or research subscriptions for this activity (optional)', {
    repeaterGroup: BA, showIf: BA_ON, required: false, calc: { business: 'activity_expense' }, feeds: ['business'], validation: [{ kind: 'min', value: 0 }],
    help: 'Enter each subscription here once. Do not also enter it as a work deduction or as a separate loss: it already reduces this activity\'s result.',
  }),
  money(Q.bus.activityExpPlatform, 'business', 'Exchange, platform or brokerage fees for this activity (optional)', {
    repeaterGroup: BA, showIf: BA_ON, required: false, calc: { business: 'activity_expense' }, feeds: ['business'], validation: [{ kind: 'min', value: 0 }],
  }),
  money(Q.bus.activityExpOther, 'business', 'All other expenses of this activity (optional)', {
    repeaterGroup: BA, showIf: BA_ON, required: false, calc: { business: 'activity_expense' }, feeds: ['business'], validation: [{ kind: 'min', value: 0 }],
    help: 'Everything not entered above. Leave out personal costs and anything already claimed elsewhere.',
  }),
  multi(Q.bus.activityLossTests, 'business', 'If this activity made a loss, which of these applied to it?', LOSS_TEST_OPTIONS, {
    repeaterGroup: BA, showIf: BA_ON, required: false, feeds: ['business'],
    help: 'Only matters for a loss. If none applies, the loss is deferred and cannot reduce your other income this year.',
  }),
  money(Q.bus.activityPriorDeferred, 'business', 'Deferred losses from earlier years for this activity (optional)', {
    repeaterGroup: BA, showIf: BA_ON, required: false, calc: { business: 'prior_deferred' }, feeds: ['business'], validation: [{ kind: 'min', value: 0 }],
    help: 'Only the unused deferred loss of this activity from earlier years. Capital losses are entered separately under Capital gains.',
  }),

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
