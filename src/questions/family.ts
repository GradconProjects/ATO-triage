/** M3 family, Medicare and private health. All universal. */
import type { Question } from '../engine/types';
import { GROUPS, Q } from './ids';
import { all, eq, flatten, gt, isIn, money, not, num, opt, repeater, single, text, yesNoUnsure, dateRange } from './shared';

const SPOUSE = isIn(Q.fam.spouse, ['all_year', 'part_year']);
// The rebate applies to hospital, extras (general) and combined policies, so extras-only cover counts here.
const PHI_COVERED = isIn(Q.phi.cover, ['whole_year', 'part_year', 'extras_only']);
const FROM_STATEMENT = eq(Q.phi.policySource, 'statement');
const OWN_FIGURES = eq(Q.phi.policySource, 'own_figures');
const NOT_STATEMENT = not(eq(Q.phi.policySource, 'statement'));

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
  text(Q.phi.policyMembership, 'family', 'What is the membership number? (optional)', {
    repeaterGroup: GROUPS.phiPolicy, showIf: PHI_COVERED, required: false, validation: [{ kind: 'maxLength', value: 40 }],
    help: 'Label C on the insurer\'s statement. It lets us spot the same policy entered for both spouses.',
  }),
  single(Q.phi.policySource, 'family', 'Do you have the insurer\'s private health insurance statement for this policy?', [
    opt('statement', 'Yes, I will enter the lines from the statement', 'Most accurate: the statement shows your own share, already without any lifetime health cover loading.'),
    opt('own_figures', 'No, I will enter what was paid', 'We estimate your share; the result is marked as approximate.'),
  ], { repeaterGroup: GROUPS.phiPolicy, showIf: PHI_COVERED, required: false, feeds: ['phi_rebate'] }),
  money(Q.phi.policyJ1, 'family', 'Statement line 1 (1 July to 31 March): premiums eligible for rebate (label J)', {
    repeaterGroup: GROUPS.phiPolicy, showIf: all(PHI_COVERED, FROM_STATEMENT), feeds: ['phi_rebate'], validation: [{ kind: 'min', value: 0 }],
  }),
  money(Q.phi.policyK1, 'family', 'Statement line 1: rebate received (label K)', {
    repeaterGroup: GROUPS.phiPolicy, showIf: all(PHI_COVERED, FROM_STATEMENT), feeds: ['phi_rebate'], validation: [{ kind: 'min', value: 0 }],
    help: 'Enter 0 only if the statement shows $0 (you paid full price and claim the rebate at tax time).',
  }),
  single(Q.phi.policyL1, 'family', 'Statement line 1: benefit code (label L)', [
    opt('30', '30 (oldest person covered under 65)'), opt('35', '35 (oldest person 65 to 69)'), opt('40', '40 (oldest person 70 or over)'),
  ], { repeaterGroup: GROUPS.phiPolicy, showIf: all(PHI_COVERED, FROM_STATEMENT), feeds: ['phi_rebate'] }),
  money(Q.phi.policyJ2, 'family', 'Statement line 2 (1 April to 30 June): premiums eligible for rebate (label J)', {
    repeaterGroup: GROUPS.phiPolicy, showIf: all(PHI_COVERED, FROM_STATEMENT), feeds: ['phi_rebate'], validation: [{ kind: 'min', value: 0 }],
  }),
  money(Q.phi.policyK2, 'family', 'Statement line 2: rebate received (label K)', {
    repeaterGroup: GROUPS.phiPolicy, showIf: all(PHI_COVERED, FROM_STATEMENT), feeds: ['phi_rebate'], validation: [{ kind: 'min', value: 0 }],
  }),
  single(Q.phi.policyL2, 'family', 'Statement line 2: benefit code (label L)', [
    opt('31', '31 (oldest person covered under 65)'), opt('36', '36 (oldest person 65 to 69)'), opt('41', '41 (oldest person 70 or over)'),
  ], { repeaterGroup: GROUPS.phiPolicy, showIf: all(PHI_COVERED, FROM_STATEMENT), feeds: ['phi_rebate'] }),
  single(Q.phi.policyCoveredAs, 'family', 'How were you covered by this policy?', [
    opt('adult', 'As an adult on the policy (on my own, or with a spouse or others)'),
    opt('dependant', 'Only as a dependant on someone else\'s policy', 'Dependants get no rebate in their own return; the policy still counts as hospital cover.'),
  ], { repeaterGroup: GROUPS.phiPolicy, showIf: PHI_COVERED, required: false, feeds: ['phi_rebate'] }),
  single(Q.phi.policyElection, 'family', 'Who claims the rebate for this policy at tax time?', [
    opt('my_share', 'I claim my share only', 'My spouse claims their own share in their return.'),
    opt('both_shares', 'I claim my share and my spouse\'s eligible share', 'Allowed only if we were covered for the same period, were together on 30 June, and my spouse agrees. My spouse then claims nothing for this policy.'),
    opt('spouse_claims_mine', 'My spouse claims my share in their return', 'Then this return includes no rebate for this policy.'),
  ], { repeaterGroup: GROUPS.phiPolicy, showIf: all(PHI_COVERED, SPOUSE), feeds: ['phi_rebate'], help: 'Your statement shows only your share. A share can be claimed in one return only.' }),
  yesNoUnsure(Q.phi.policySpouseShare, 'family', 'Do all three conditions for claiming your spouse\'s share apply?', {
    repeaterGroup: GROUPS.phiPolicy, showIf: eq(Q.phi.policyElection, 'both_shares'), feeds: ['phi_rebate'],
    help: 'Your spouse agreed that you claim it; you were both covered by this policy for the same period; you were together on 30 June. Your spouse then leaves their share out of their own return, so it is claimed only once.',
  }),
  money(Q.phi.policySpouseJ1, 'family', 'Spouse\'s statement line 1 (1 July to 31 March): premiums eligible (label J)', { repeaterGroup: GROUPS.phiPolicy, showIf: eq(Q.phi.policyElection, 'both_shares'), feeds: ['phi_rebate'], validation: [{ kind: 'min', value: 0 }], help: 'From your spouse\'s own statement. Do not copy your figures: your shares can differ.' }),
  money(Q.phi.policySpouseK1, 'family', 'Spouse\'s statement line 1: rebate received (label K)', { repeaterGroup: GROUPS.phiPolicy, showIf: eq(Q.phi.policyElection, 'both_shares'), feeds: ['phi_rebate'], validation: [{ kind: 'min', value: 0 }] }),
  single(Q.phi.policySpouseL1, 'family', 'Spouse\'s statement line 1: benefit code (label L)', [opt('30', '30'), opt('35', '35'), opt('40', '40')], { repeaterGroup: GROUPS.phiPolicy, showIf: eq(Q.phi.policyElection, 'both_shares'), feeds: ['phi_rebate'] }),
  money(Q.phi.policySpouseJ2, 'family', 'Spouse\'s statement line 2 (1 April to 30 June): premiums eligible (label J)', { repeaterGroup: GROUPS.phiPolicy, showIf: eq(Q.phi.policyElection, 'both_shares'), feeds: ['phi_rebate'], validation: [{ kind: 'min', value: 0 }] }),
  money(Q.phi.policySpouseK2, 'family', 'Spouse\'s statement line 2: rebate received (label K)', { repeaterGroup: GROUPS.phiPolicy, showIf: eq(Q.phi.policyElection, 'both_shares'), feeds: ['phi_rebate'], validation: [{ kind: 'min', value: 0 }] }),
  single(Q.phi.policySpouseL2, 'family', 'Spouse\'s statement line 2: benefit code (label L)', [opt('31', '31'), opt('36', '36'), opt('41', '41')], { repeaterGroup: GROUPS.phiPolicy, showIf: eq(Q.phi.policyElection, 'both_shares'), feeds: ['phi_rebate'] }),
  yesNoUnsure(Q.phi.policySpouseConfirmed, 'family', 'Has your spouse confirmed the same choice for their own return?', {
    repeaterGroup: GROUPS.phiPolicy, showIf: all(PHI_COVERED, SPOUSE), required: false, feeds: ['phi_rebate'],
    help: 'Both returns must match, so each share is claimed exactly once. If your spouse is a linked profile here, we check it for you.',
  }),
  money(Q.phi.policyPremiums, 'family', 'What were the total premiums paid for this policy?', {
    help: 'Everything paid for the year, before any rebate reduction. If your statement is available, choose the statement option instead.',
    repeaterGroup: GROUPS.phiPolicy,
    showIf: all(PHI_COVERED, NOT_STATEMENT),
    feeds: ['phi_rebate'],
    validation: [{ kind: 'min', value: 0 }],
  }),
  money(Q.phi.policyRebate, 'family', 'How much rebate did you already receive as a premium reduction?', {
    help: 'The reduction the insurer gave you on the premiums. Enter 0 only if you paid full price.',
    repeaterGroup: GROUPS.phiPolicy,
    showIf: all(PHI_COVERED, NOT_STATEMENT),
    feeds: ['phi_rebate'],
    validation: [{ kind: 'min', value: 0 }],
  }),
  single(Q.phi.policyAmountBasis, 'family', 'Is that premium the full policy amount, or your own share from a statement?', [
    opt('full_policy', 'The full amount for the whole policy', 'We divide it equally between the adults covered (whoever paid). Amounts paid from a bank account may already be reduced by the rebate or include ineligible amounts, so the result is approximate.'),
    opt('my_share', 'Only my share, as allocated by the insurer'),
  ], { repeaterGroup: GROUPS.phiPolicy, showIf: all(PHI_COVERED, NOT_STATEMENT), feeds: ['phi_rebate'] }),
  num(Q.phi.policyAdults, 'family', 'How many adults were covered by this policy?', {
    repeaterGroup: GROUPS.phiPolicy, showIf: all(PHI_COVERED, eq(Q.phi.policyAmountBasis, 'full_policy')), feeds: ['phi_rebate'], validation: [{ kind: 'min', value: 1 }, { kind: 'max', value: 6 }],
    help: 'Premiums are shared equally between the adults covered, whoever paid. Dependent children are not counted.',
  }),
  money(Q.phi.policyLhc, 'family', 'How much of the premiums was lifetime health cover loading? (optional)', {
    repeaterGroup: GROUPS.phiPolicy, showIf: all(PHI_COVERED, NOT_STATEMENT), required: false, feeds: ['phi_rebate'], validation: [{ kind: 'min', value: 0 }],
    help: 'No rebate is paid on the loading. Leave blank if there was none.',
  }),
  single(Q.phi.policyAge, 'family', 'How old was the oldest person covered by this policy?', [
    opt('under65', 'Under 65'), opt('65_69', '65 to 69'), opt('70plus', '70 or over'),
  ], { repeaterGroup: GROUPS.phiPolicy, showIf: all(PHI_COVERED, NOT_STATEMENT), feeds: ['phi_rebate'], help: 'The rebate percentage depends on the age of the oldest person covered.' }),
  yesNoUnsure(Q.phi.policyRebateConfirmed, 'family', 'Did you pay the full premium with no rebate reduction at all?', {
    repeaterGroup: GROUPS.phiPolicy, showIf: all(PHI_COVERED, NOT_STATEMENT), required: false, feeds: ['phi_rebate'],
    help: 'Needed when the rebate received is $0: a $0 entry is only used as "no reduction" once you confirm it.',
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
