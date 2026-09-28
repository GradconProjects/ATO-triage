/** M3 family, Medicare and private health. All universal. */
import type { Question } from '../engine/types';
import { GROUPS, Q } from './ids';
import { eq, flatten, gt, isIn, money, num, opt, repeater, single, text, yesNoUnsure, dateRange } from './shared';

const SPOUSE = isIn(Q.fam.spouse, ['all_year', 'part_year']);
const PHI_COVERED = isIn(Q.phi.cover, ['whole_year', 'part_year']);

export const FAMILY_QUESTIONS: Question[] = flatten(
  single(Q.fam.spouse, 'family', 'Did you have a spouse at any time during the year?', [
    opt('all_year', 'Yes, for the whole year', 'Married or living together as a couple (de facto) for the full financial year.'),
    opt('part_year', 'Yes, for part of the year', 'You married, moved in together, separated or were widowed during the year. We will ask the dates.'),
    opt('no', 'No'),
  ], {
    help: 'A spouse includes a de facto partner of any sex. Your spouse\'s income affects the Medicare levy surcharge, the Medicare low-income threshold and some offsets.',
    feeds: ['medicare', 'mls', 'offsets'],
  }),
  dateRange(Q.fam.spouseDates, 'family', 'Between which dates did you have a spouse this year?', {
    help: 'Enter the period you were married or living together during this financial year.',
    showIf: eq(Q.fam.spouse, 'part_year'),
    validation: [{ kind: 'inFinancialYear' }],
    feeds: ['mls'],
  }),
  money(Q.fam.spouseTaxableIncome, 'family', 'What was your spouse\'s taxable income for the year?', {
    help: 'Their taxable income from their return or estimate. The Medicare levy surcharge uses the family income, so we need both.',
    showIf: SPOUSE,
    feeds: ['mls', 'medicare', 'offsets'],
    validation: [{ kind: 'min', value: 0 }],
  }),
  money(Q.fam.spouseRfb, 'family', 'What were your spouse\'s reportable fringe benefits, if any?', {
    help: 'Shown on their income statement as "reportable fringe benefits amount". Leave blank if there were none.',
    showIf: SPOUSE,
    required: false,
    feeds: ['mls'],
  }),
  money(Q.fam.spouseRsc, 'family', 'What were your spouse\'s reportable super contributions, if any?', {
    help: 'Salary-sacrificed super or personal deductible super shown on their income statement or return. Leave blank if none.',
    showIf: SPOUSE,
    required: false,
    feeds: ['mls'],
  }),
  num(Q.fam.dependantsCount, 'family', 'How many dependent children did you have at any time this year?', {
    help: 'Children under 21, or full-time students under 25, who you supported. Enter 0 if none. Dependants raise the family thresholds for Medicare.',
    validation: [{ kind: 'min', value: 0 }, { kind: 'max', value: 20 }],
    feeds: ['medicare', 'mls'],
  }),
  yesNoUnsure(Q.fam.dependantsStudents, 'family', 'Were any of those children full-time students aged 21 to 24?', {
    help: 'Full-time students under 25 still count as dependants for Medicare purposes.',
    showIf: gt(Q.fam.dependantsCount, 0),
    feeds: ['medicare'],
  }),

  // ---- Medicare ----
  single(Q.med.exemption, 'family', 'Were you entitled to Medicare benefits for the whole year?', [
    opt('entitled_full', 'Yes, for the whole year', 'Most Australian citizens and permanent residents.'),
    opt('foreign_resident', 'No, I was a foreign resident', 'Foreign residents do not pay the Medicare levy.'),
    opt('temp_visa_mes', 'No, I was on a temporary visa without Medicare (I have a Medicare Entitlement Statement)', 'Services Australia issues a Medicare Entitlement Statement showing the days you were not entitled. You need it to claim the exemption.'),
    opt('part_year', 'Only for part of the year', 'For example you became a permanent resident part-way through the year.'),
  ], {
    help: 'The Medicare levy is 2% of taxable income. People not entitled to Medicare can be exempt for those days, but only with a Medicare Entitlement Statement.',
    feeds: ['medicare'],
  }),
  num(Q.med.exemptDays, 'family', 'How many days in the year were you NOT entitled to Medicare?', {
    help: 'Take this from your Medicare Entitlement Statement. If it was the whole year, enter 365 (366 in a leap year).',
    showIf: isIn(Q.med.exemption, ['part_year', 'temp_visa_mes']),
    validation: [{ kind: 'min', value: 0 }, { kind: 'max', value: 366 }],
    feeds: ['medicare'],
  }),

  // ---- Private health ----
  single(Q.phi.cover, 'family', 'Did you have private patient hospital cover this year?', [
    opt('whole_year', 'Yes, hospital cover for the whole year'),
    opt('part_year', 'Yes, hospital cover for part of the year', 'We will ask how many days you were covered.'),
    opt('extras_only', 'Extras only (dental, optical, physio), no hospital cover', 'Extras cover does NOT count as hospital cover, so the Medicare levy surcharge can still apply.'),
    opt('none', 'No private health insurance'),
  ], {
    help: 'The Medicare levy surcharge (an extra 1% to 1.5%) applies to higher earners without private hospital cover. Only hospital cover counts.',
    feeds: ['mls', 'phi_rebate'],
  }),
  num(Q.phi.daysCovered, 'family', 'How many days of the year did you have hospital cover?', {
    help: 'Your insurer\'s annual tax statement shows the days covered.',
    showIf: eq(Q.phi.cover, 'part_year'),
    validation: [{ kind: 'min', value: 1 }, { kind: 'max', value: 366 }],
    feeds: ['mls'],
  }),
  repeater(Q.phi.policyRepeater, 'family', 'Your private health policies', {
    groupId: GROUPS.phiPolicy,
    itemLabel: 'Health insurance policy',
    addLabel: 'Add another policy',
    minItems: 1,
    labelFrom: 'phi.policy.insurer',
  }, {
    help: 'Add one entry per policy from your insurer\'s annual tax statement. The figures feed the private health rebate check.',
    showIf: PHI_COVERED,
  }),
  text('phi.policy.insurer', 'family', 'Which insurer is this policy with?', {
    repeaterGroup: GROUPS.phiPolicy,
    showIf: PHI_COVERED,
    validation: [{ kind: 'maxLength', value: 120 }],
  }),
  money(Q.phi.policyPremiums, 'family', 'What were the total premiums paid for this policy?', {
    help: 'Use the "premiums eligible for rebate" figure on the insurer\'s annual tax statement.',
    repeaterGroup: GROUPS.phiPolicy,
    showIf: PHI_COVERED,
    feeds: ['phi_rebate'],
    validation: [{ kind: 'min', value: 0 }],
  }),
  money(Q.phi.policyRebate, 'family', 'How much rebate did you already receive as a premium reduction?', {
    help: 'The "Australian Government rebate received" figure on the statement. If you paid full price, enter 0.',
    repeaterGroup: GROUPS.phiPolicy,
    showIf: PHI_COVERED,
    feeds: ['phi_rebate'],
    validation: [{ kind: 'min', value: 0 }],
  }),
  single(Q.phi.policyTier, 'family', 'Which rebate tier did the insurer apply to this policy?', [
    opt('base', 'Base tier (highest rebate)'),
    opt('tier1', 'Tier 1'),
    opt('tier2', 'Tier 2'),
    opt('tier3', 'Tier 3 (no rebate)'),
  ], {
    help: 'The tier is on the statement, or you can tell from the rebate percentage. If your income tier was wrong, the ATO adjusts it at tax time; that is the "private health adjustment".',
    repeaterGroup: GROUPS.phiPolicy,
    showIf: PHI_COVERED,
    feeds: ['phi_rebate'],
  }),
);
