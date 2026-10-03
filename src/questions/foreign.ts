/** M12 foreign income. Universal; temporary residents get an extra sourcing question. */
import type { Question } from '../engine/types';
import { FOREIGN_TYPES, Q } from './ids';
import { eq, flatten, includes, includesAny, money, opt, screening, yesNoUnsure } from './shared';

const FGN_LABELS: Record<(typeof FOREIGN_TYPES)[number], { option: string; amount: string; help: string }> = {
  employment: { option: 'Wages or salary earned overseas', amount: 'How much foreign employment income did you earn (in AUD)?', help: 'Convert to Australian dollars at the rate on the day paid, or the ATO average rate for the year.' },
  pension: { option: 'A foreign pension or annuity', amount: 'How much foreign pension did you receive (in AUD)?', help: 'Most foreign pensions are taxable here for residents. Some have a deductible "undeducted purchase price".' },
  rent: { option: 'Rent from an overseas property', amount: 'What was the net rent from overseas property (in AUD)?', help: 'Rent received less the property\'s expenses, converted to AUD.' },
  investment: { option: 'Foreign interest, dividends or fund income', amount: 'How much foreign investment income did you receive (in AUD)?', help: 'Include foreign tax withheld in the gross amount; enter the tax separately below.' },
  other: { option: 'Other foreign income', amount: 'How much was the other foreign income (in AUD)?', help: 'Describe it above; we list it for review.' },
};

const ANY_FOREIGN = includesAny(Q.fgn.received, [...FOREIGN_TYPES]);
const RESIDENCY_TREATMENT = {
  byQuestion: Q.res.status,
  map: { resident_full: 'I', became_resident: 'I', ceased_resident: 'I', foreign_full: 'R', temporary: 'R', whm: 'R' },
  fallback: 'R',
} as const;

export const FOREIGN_QUESTIONS: Question[] = flatten(
  ...screening(Q.fgn.received, 'foreign', 'Did you receive any income from outside Australia this year?', FOREIGN_TYPES.filter((t) => t !== 'other').map((t) => opt(t, FGN_LABELS[t].option)), {
    help: 'Australian residents are taxed on worldwide income, with a credit for foreign tax already paid. Foreign and temporary residents are treated differently, so we route those to review.',
  }),
  ...FOREIGN_TYPES.map((t) =>
    money(Q.fgn.amount(t), 'foreign', FGN_LABELS[t].amount, {
      showIf: includes(Q.fgn.received, t),
      help: FGN_LABELS[t].help,
      // 'Other' foreign income is unclassified, so it is always reviewed.
      income: { category: 'foreign', treatment: t === 'other' ? 'R' : { ...RESIDENCY_TREATMENT, map: { ...RESIDENCY_TREATMENT.map } } },
      feeds: ['income'],
      validation: [{ kind: 'min', value: 0 }],
    }),
  ),
  money(Q.fgn.taxPaid, 'foreign', 'How much foreign tax did you pay on that income (in AUD)?', {
    showIf: ANY_FOREIGN,
    help: 'Tax paid to the other country on the income above. It can be claimed as a foreign income tax offset. Enter 0 if none.',
    credit: 'foreign_tax_paid',
    feeds: ['credits', 'offsets'],
    validation: [{ kind: 'min', value: 0 }],
  }),
  yesNoUnsure(Q.fgn.assetsOver50k, 'foreign', 'Did you own overseas assets worth AUD 50,000 or more at any time this year?', {
    help: 'Overseas property, shares, bank accounts or crypto on foreign exchanges. The tax return asks this question; it does not change the estimate.',
  }),
  yesNoUnsure(Q.fgn.tempForeignSourced, 'foreign', 'Was the foreign income earned from a source outside Australia while you were a temporary resident?', {
    showIf: eq(Q.res.status, 'temporary'),
    help: 'Temporary residents generally do not pay Australian tax on foreign-sourced income (other than employment income earned while here). We flag this for review.',
    feeds: ['income'],
  }),
);
