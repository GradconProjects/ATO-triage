/** M1 tax year and purpose, M2 residency. All universal. */
import type { Question } from '../engine/types';
import { Q } from './ids';
import { and, eq, flatten, isIn, money, opt, single, singleAllowListed, yesNoUnsure, date } from './shared';

export const FY_OPTIONS = [
  opt('2023-24', '2023–24 (1 July 2023 to 30 June 2024)'),
  opt('2024-25', '2024–25 (1 July 2024 to 30 June 2025)'),
  opt('2025-26', '2025–26 (1 July 2025 to 30 June 2026)'),
  opt('2026-27', '2026–27 (1 July 2026 to 30 June 2027)'),
];

const RES_OPTIONS = [
  opt('resident_full', 'Australian resident for tax for the whole year', 'You lived in Australia all year, or were away only for short trips. Most people who live here are residents for tax.'),
  opt('became_resident', 'I became an Australian resident during the year', 'You arrived to live in Australia part-way through the year. We will ask the date.'),
  opt('ceased_resident', 'I stopped being an Australian resident during the year', 'You left Australia to live overseas part-way through the year. We will ask the date.'),
  opt('foreign_full', 'Foreign resident for the whole year', 'You lived outside Australia all year but had Australian income, such as rent or wages.'),
  opt('temporary', 'Temporary resident (temporary visa holder)', 'You live here on a temporary visa such as a 482 or 485. Some foreign income is exempt; we flag this for review.'),
  opt('whm', 'Working holiday maker (417 or 462 visa)', 'Working holiday makers have their own tax rates on their working holiday income.'),
];

export const CORE_QUESTIONS: Question[] = flatten(
  // ---- M1 core ----
  singleAllowListed(Q.core.fy, 'core', 'Which financial year is this for?', FY_OPTIONS, {
    help: 'The tax rates, thresholds, rates per kilometre and other figures change every year. Picking the year selects the right rule table.',
    feeds: ['rule_set'],
  }),
  singleAllowListed(Q.core.purpose, 'core', 'Why are you doing this today?', [
    opt('pre_lodgment', 'Estimate my refund or debt before I lodge'),
    opt('assessment_review', 'Check an assessment I already received', 'Compare our estimate with the notice of assessment the ATO sent you.'),
    opt('amendment', 'See whether an amendment is worth doing', 'You already lodged and think something was missed or wrong.'),
    opt('planning', 'Plan for next year', 'A what-if estimate to see how choices change the result.'),
  ], { help: 'Your answer changes what the report compares against. It never changes any tax figure.' }),
  single(Q.core.lodged, 'core', 'Has a tax return for this year already been lodged?', [
    opt('yes_mygov', 'Yes, I lodged it myself through myGov / myTax'),
    opt('yes_agent', 'Yes, a tax agent lodged it for me'),
    opt('no', 'No, not yet'),
  ], { help: 'If a return was lodged we can compare our estimate with what the ATO assessed.' }),
  money(Q.core.assessedResult, 'core', 'What was the result on your notice of assessment?', {
    help: 'Enter a refund as a positive amount, or a debt (an amount you had to pay) as a negative amount. It is on the notice the ATO sent after lodgment.',
    allowNegative: true,
    feeds: ['comparison'],
    showIf: and(isIn(Q.core.lodged, ['yes_mygov', 'yes_agent']), isIn(Q.core.purpose, ['amendment', 'assessment_review'])),
  }),

  // ---- M2 residency ----
  single(Q.res.status, 'residency', 'For this financial year, which best describes your residency for tax?', RES_OPTIONS, {
    help: 'Residency for tax is about where you live, not your citizenship or visa alone. It decides which tax scale applies, whether you get the tax-free threshold, and whether foreign income is taxed here.',
    feeds: ['tax_scale', 'medicare'],
  }),
  date(Q.res.arrivalDate, 'residency', 'On what date did you become an Australian resident?', {
    help: 'Usually the date you arrived to live in Australia. The tax-free threshold is pro-rated from this date.',
    showIf: eq(Q.res.status, 'became_resident'),
    validation: [{ kind: 'inFinancialYear' }],
    feeds: ['tax_scale'],
  }),
  date(Q.res.departureDate, 'residency', 'On what date did you stop being an Australian resident?', {
    help: 'Usually the date you left Australia to live overseas. The tax-free threshold is pro-rated to this date.',
    showIf: eq(Q.res.status, 'ceased_resident'),
    validation: [{ kind: 'inFinancialYear' }],
    feeds: ['tax_scale'],
  }),
  money(Q.res.whmIncome, 'residency', 'How much did you earn while on a working holiday visa this year?', {
    help: 'Working holiday income is taxed under its own scale. Enter the total gross wages from your income statements for this year. It should match the employer amounts you enter later; we use it to pick the scale, not to add income twice.',
    showIf: eq(Q.res.status, 'whm'),
    feeds: ['tax_scale'],
    calc: { special: 'whm_income' },
    validation: [{ kind: 'min', value: 0 }],
  }),
  yesNoUnsure(Q.res.dual, 'residency', 'Were you also treated as a tax resident of another country this year?', {
    help: 'Some people are residents of two countries at once. A tax treaty then decides which country taxes what. We flag this for review; it does not change the estimate.',
  }),
);
