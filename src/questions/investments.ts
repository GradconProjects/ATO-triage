/** M9 investments: interest, dividends, trust distributions, ESS. Universal. */
import type { Question } from '../engine/types';
import { GROUPS, Q } from './ids';
import { flatten, money, opt, percent, repeater, single, text, yes, yesNoUnsure } from './shared';

const I = GROUPS.interestAccount;
const D = GROUPS.dividend;
const T = GROUPS.trustDist;
const INT = yes(Q.inv.interestAny);
const DIV = yes(Q.inv.divAny);
const TRU = yes(Q.inv.trustAny);

export const INVESTMENT_QUESTIONS: Question[] = flatten(
  // ---- Interest ----
  yesNoUnsure(Q.inv.interestAny, 'investments', 'Did you earn any bank interest this year?', {
    help: 'Interest from savings accounts, term deposits, bonds or loans you made. Banks report it to the ATO, so it should match pre-fill.',
    feeds: ['income'],
  }),
  repeater(Q.inv.interestRepeater, 'investments', 'Your interest-earning accounts', {
    groupId: I, itemLabel: 'Account', addLabel: 'Add another account', minItems: 1, labelFrom: Q.inv.interestBank,
  }, { showIf: INT, help: 'One entry per account. For a joint account enter the whole interest and your share percentage.' }),
  text(Q.inv.interestBank, 'investments', 'Which bank or institution is the account with?', { repeaterGroup: I, showIf: INT, required: true, validation: [{ kind: 'maxLength', value: 120 }] }),
  money(Q.inv.interestAmount, 'investments', 'How much interest did this account earn in total?', {
    repeaterGroup: I, showIf: INT, income: { category: 'interest', treatment: 'I' }, feeds: ['income'], validation: [{ kind: 'min', value: 0 }],
    help: 'The total interest for the whole account, before splitting between joint holders.',
  }),
  percent(Q.inv.interestSharePct, 'investments', 'What percentage of this account is yours?', {
    repeaterGroup: I, showIf: INT, feeds: ['income'],
    help: 'Enter 100 for an account in your name only, or 50 for a joint account with one other person.',
  }),
  money(Q.inv.interestTfnWithheld, 'investments', 'Was any TFN withholding tax taken from the interest?', {
    repeaterGroup: I, showIf: INT, required: false, credit: 'tfn_withheld', feeds: ['credits'], validation: [{ kind: 'min', value: 0 }],
    help: 'If you did not give the bank your tax file number, it withholds tax at the top rate. Leave blank if none.',
  }),

  // ---- Dividends ----
  yesNoUnsure(Q.inv.divAny, 'investments', 'Did you receive any dividends from shares this year?', {
    help: 'Include dividends reinvested under a dividend reinvestment plan; they are still income. Dividend statements show the franked, unfranked and franking credit amounts.',
    feeds: ['income'],
  }),
  repeater(Q.inv.divRepeater, 'investments', 'Your shareholdings that paid dividends', {
    groupId: D, itemLabel: 'Shareholding', addLabel: 'Add another shareholding', minItems: 1, labelFrom: Q.inv.divHolding,
  }, { showIf: DIV, help: 'One entry per company or ETF. Add together all dividends from the same company for the year.' }),
  text(Q.inv.divHolding, 'investments', 'Which company or fund paid the dividend?', { repeaterGroup: D, showIf: DIV, required: true, validation: [{ kind: 'maxLength', value: 120 }] }),
  money(Q.inv.divUnfranked, 'investments', 'What was the unfranked amount?', {
    repeaterGroup: D, showIf: DIV, income: { category: 'dividend_unfranked', treatment: 'I' }, feeds: ['income'], validation: [{ kind: 'min', value: 0 }],
    help: 'Shown on the dividend statement. Enter 0 if none.',
  }),
  money(Q.inv.divFranked, 'investments', 'What was the franked amount?', {
    repeaterGroup: D, showIf: DIV, income: { category: 'dividend_franked', treatment: 'I' }, feeds: ['income'], validation: [{ kind: 'min', value: 0 }],
    help: 'The cash franked dividend, before adding the franking credit. Enter 0 if none.',
  }),
  money(Q.inv.divFrankingCredit, 'investments', 'What was the franking credit?', {
    repeaterGroup: D, showIf: DIV, income: { category: 'franking_credit', treatment: 'I' }, credit: 'franking_credit', feeds: ['income', 'credits'], validation: [{ kind: 'min', value: 0 }],
    help: 'Also called imputation credit. It is added to your income and then credited back against your tax.',
  }),
  money(Q.inv.divTfnWithheld, 'investments', 'Was any TFN withholding tax taken from the dividends?', {
    repeaterGroup: D, showIf: DIV, required: false, credit: 'tfn_withheld', feeds: ['credits'], validation: [{ kind: 'min', value: 0 }],
    help: 'Leave blank if none.',
  }),
  yesNoUnsure(Q.inv.divDrp, 'investments', 'Were these dividends reinvested under a dividend reinvestment plan?', {
    repeaterGroup: D, showIf: DIV,
    help: 'Reinvested dividends are still income, and each reinvestment sets the cost base of the new shares for capital gains later.',
  }),

  // ---- Managed funds and trusts ----
  yesNoUnsure(Q.inv.trustAny, 'investments', 'Did you receive a distribution from a managed fund or trust this year?', {
    help: 'Managed funds, ETFs and unit trusts send an annual tax statement (AMIT or standard) with several labelled amounts. Each label is taxed differently.',
    feeds: ['income'],
  }),
  repeater(Q.inv.trustRepeater, 'investments', 'Your managed fund or trust statements', {
    groupId: T, itemLabel: 'Fund or trust', addLabel: 'Add another fund or trust', minItems: 1, labelFrom: Q.inv.trustName,
  }, { showIf: TRU, help: 'One entry per annual tax statement. Copy each labelled amount into the matching field.' }),
  text(Q.inv.trustName, 'investments', 'What is the name of the fund or trust?', { repeaterGroup: T, showIf: TRU, required: true, validation: [{ kind: 'maxLength', value: 120 }] }),
  money(Q.inv.trustIncome, 'investments', 'What was the non-primary production income (share of net income)?', {
    repeaterGroup: T, showIf: TRU, income: { category: 'trust', treatment: 'I' }, feeds: ['income'], validation: [{ kind: 'min', value: 0 }],
    help: 'The main income label on the statement, excluding capital gains and foreign income which have their own fields.',
  }),
  money(Q.inv.trustFrankingCredit, 'investments', 'What were the franking credits on the statement?', {
    repeaterGroup: T, showIf: TRU, income: { category: 'franking_credit', treatment: 'I' }, credit: 'franking_credit', feeds: ['income', 'credits'], validation: [{ kind: 'min', value: 0 }],
    help: 'Enter 0 if none.',
  }),
  money(Q.inv.trustCgDiscounted, 'investments', 'What was the discounted capital gain component (grossed-up amount)?', {
    repeaterGroup: T, showIf: TRU, income: { category: 'capital_gain', treatment: 'I' }, calc: { cgt: 'trust_discounted' }, feeds: ['cgt'], validation: [{ kind: 'min', value: 0 }],
    help: 'Statements usually show the gross (before discount) figure. Enter that; we apply the discount with your other capital gains.',
  }),
  money(Q.inv.trustCgOther, 'investments', 'What was the other (non-discounted) capital gain component?', {
    repeaterGroup: T, showIf: TRU, income: { category: 'capital_gain', treatment: 'I' }, calc: { cgt: 'trust_other' }, feeds: ['cgt'], validation: [{ kind: 'min', value: 0 }],
    help: 'Capital gains that do not get the 50% discount, such as short-held assets. Enter 0 if none.',
  }),
  money(Q.inv.trustForeignIncome, 'investments', 'What was the foreign income component?', {
    repeaterGroup: T, showIf: TRU, income: { category: 'foreign', treatment: 'I' }, feeds: ['income'], validation: [{ kind: 'min', value: 0 }],
    help: 'Enter 0 if none.',
  }),
  money(Q.inv.trustForeignTax, 'investments', 'How much foreign tax was paid on that foreign income?', {
    repeaterGroup: T, showIf: TRU, required: false, credit: 'foreign_tax_paid', feeds: ['credits', 'offsets'], validation: [{ kind: 'min', value: 0 }],
    help: 'Used for the foreign income tax offset. Leave blank if none.',
  }),
  money(Q.inv.trustTfnWithheld, 'investments', 'Was any TFN withholding tax taken from the distribution?', {
    repeaterGroup: T, showIf: TRU, required: false, credit: 'tfn_withheld', feeds: ['credits'], validation: [{ kind: 'min', value: 0 }],
    help: 'Leave blank if none.',
  }),

  // ---- Employee share schemes ----
  yesNoUnsure(Q.inv.ess, 'investments', 'Did you receive shares or options from your employer under an employee share scheme this year?', {
    help: 'Employers issue an ESS statement showing the discount. It can be taxed up front, deferred, or under the start-up concession. We flag ESS for review.',
    feeds: ['income'],
  }),
  single('inv.ess.type', 'investments', 'Which type of scheme does the ESS statement show?', [
    opt('taxed_upfront', 'Taxed up front (discount is income this year)'),
    opt('deferred', 'Tax-deferred scheme', 'Tax is delayed until a later "deferred taxing point", such as when you can sell.'),
    opt('startup', 'Start-up concession', 'Discount is not taxed as income; it goes into the cost base for capital gains.'),
  ], { showIf: yes(Q.inv.ess), help: 'The statement names the scheme type. It decides whether the discount is income this year.' }),
  money(Q.inv.essDiscount, 'investments', 'What is the total discount shown on the ESS statement?', {
    showIf: yes(Q.inv.ess), income: { category: 'ess', treatment: 'R' }, feeds: ['income'], validation: [{ kind: 'min', value: 0 }],
    help: 'Listed for review rather than added: the scheme type decides whether it is income this year.',
  }),
);
