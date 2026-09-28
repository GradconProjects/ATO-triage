/** M10 rental property. Universal. Expenses feed the rental special module (no DeductionMeta). */
import type { Question } from '../engine/types';
import { GROUPS, Q } from './ids';
import { ATO, all, flatten, gt, money, num, percent, repeater, text, yes, yesNoUnsure, dateRange } from './shared';

const R = GROUPS.rentalProperty;
const ON = yes(Q.rent.any);

function exp(id: string, prompt: string, help: string, kind: string): Question {
  return money(id, 'rental', prompt, {
    repeaterGroup: R, showIf: ON, help, feeds: ['rental'], calc: { rental: 'expense', kind }, atoRef: ATO.rental, validation: [{ kind: 'min', value: 0 }],
  });
}

export const RENTAL_QUESTIONS: Question[] = flatten(
  yesNoUnsure(Q.rent.any, 'rental', 'Did you own a property that was rented out, or available for rent, this year?', {
    help: 'Include a room in your home, a holiday home listed on a short-stay site, or a property you own with someone else. Rent is income and the running costs can reduce it.',
    feeds: ['rental'],
  }),
  repeater(Q.rent.repeater, 'rental', 'Your rental properties', {
    groupId: R, itemLabel: 'Rental property', addLabel: 'Add another property', minItems: 1, labelFrom: Q.rent.address,
  }, { showIf: ON, help: 'One entry per property. Enter the whole property\'s figures; we apply your ownership share.' }),
  text(Q.rent.address, 'rental', 'What is the property address?', { repeaterGroup: R, showIf: ON, required: true, validation: [{ kind: 'maxLength', value: 200 }] }),
  percent(Q.rent.ownershipPct, 'rental', 'What percentage of the property do you own?', {
    repeaterGroup: R, showIf: ON, feeds: ['rental'],
    help: 'Use the share on the title. Joint owners usually split 50/50. Income and expenses are split by this share, not by who paid.',
  }),
  dateRange(Q.rent.available, 'rental', 'Between which dates was the property available for rent this year?', {
    repeaterGroup: R, showIf: ON, feeds: ['rental'], validation: [{ kind: 'inFinancialYear' }],
    help: 'The period it was rented or genuinely advertised for rent. Expenses only count for this period.',
  }),
  num(Q.rent.daysRented, 'rental', 'How many days was it actually rented?', {
    repeaterGroup: R, showIf: ON, feeds: ['rental'], validation: [{ kind: 'min', value: 0 }, { kind: 'max', value: 366 }],
  }),
  num(Q.rent.daysPrivate, 'rental', 'How many days did you, family or friends use it privately?', {
    repeaterGroup: R, showIf: ON, feeds: ['rental'], validation: [{ kind: 'min', value: 0 }, { kind: 'max', value: 366 }],
    help: 'Private use days reduce the expenses you can claim. Enter 0 if none.',
  }),
  money(Q.rent.income, 'rental', 'How much rent was received for the whole property?', {
    repeaterGroup: R, showIf: ON, income: { category: 'rent', treatment: 'I' }, calc: { rental: 'income' }, feeds: ['rental'], validation: [{ kind: 'min', value: 0 }],
    help: 'Gross rent before agent fees, from the agent\'s annual statement or your bank records. Include short-stay platform payouts.',
  }),
  exp(Q.rent.expInterest, 'How much loan interest was charged on the property?', 'Interest only, not the principal repayments. From the lender\'s annual statement.', 'interest'),
  exp(Q.rent.expCouncil, 'How much were council rates?', 'Council rates for the year.', 'council'),
  exp(Q.rent.expWater, 'How much were water rates?', 'Water charges you paid (not the tenant).', 'water'),
  exp(Q.rent.expInsurance, 'How much was landlord or building insurance?', 'Building, contents and landlord insurance premiums.', 'insurance'),
  exp(Q.rent.expAgent, 'How much were property agent fees?', 'Management fees, letting fees and advertising from the agent statement.', 'agent'),
  exp(Q.rent.expRepairs, 'How much did you spend on repairs?', 'Fixing wear and damage from renting, such as a broken hot water system. Improvements are capital and go under capital works.', 'repairs'),
  exp(Q.rent.expCapitalWorks, 'How much were capital works (building or renovation costs)?', 'Structural work such as a new roof, extension or kitchen. Claimed at 2.5% a year, not all at once. Flagged for review.', 'capital_works'),
  exp(Q.rent.expDepreciation, 'How much is the depreciation (decline in value) of fittings?', 'From a quantity surveyor\'s depreciation schedule. Enter 0 if you do not have one.', 'depreciation'),
  exp(Q.rent.expOther, 'How much were other rental expenses?', 'Body corporate fees, land tax, pest control, gardening, cleaning, accounting for the property.', 'other'),
  yesNoUnsure(Q.rent.initialRepairs, 'rental', 'Were any of the repairs done to fix problems that existed when you bought the property?', {
    repeaterGroup: R, showIf: all(ON, gt(Q.rent.expRepairs, 0)), feeds: ['rental'],
    help: '"Initial repairs" fix damage that was there at purchase. They are capital, not a repair deduction, so we flag them.',
  }),
  yesNoUnsure(Q.rent.shortStay, 'rental', 'Was the property used for short stays or as a holiday home?', {
    repeaterGroup: R, showIf: ON, feeds: ['rental'],
    help: 'Short-stay lets and holiday homes need a stricter split between rented days, available days and private days.',
  }),
);
