import { validateRuleSet, type RuleSet } from './schema';

/**
 * Rule table for the 2023–24 income year (1 July 2023 – 30 June 2024).
 * All thresholds are whole dollars; rates are decimal fractions; cents-per-unit values are cents.
 * Every value is backed by a `sources` row. See `verificationNotes` for anything not confirmed.
 */
const ruleSet: RuleSet = validateRuleSet({
  fy: '2023-24',
  version: '2023-24.2',
  verifiedOn: '2026-09-28',
  verificationNotes: [
    'Confirmed against ato.gov.au page text on 2026-09-28: resident, foreign-resident and WHM scales; LITO; SAPTO ($32,279/$50,119 single, $28,974/$41,790 couple — the pre-2024-25 thresholds, confirmed by the ATO withholding-declaration SAPTO calculator page and the M1 2024 note that SAPTO ceases at $50,119); Medicare low-income thresholds (M1 2024: single $26,000/$32,500, SAPTO $41,089/$51,361, family upper $54,807, SAPTO family upper $71,497, child upper increment $5,034); MLS tiers; car 85c; WFH 67c; concessional cap $27,500; HELP bands (ATO study-loan page, Table 4).',
    'Medicare family LOWER thresholds ($43,846, SAPTO family $57,198, child increment $4,027) confirmed via search snippets of the Treasury Laws Amendment (Cost of Living—Medicare Levy) Act 2024 / ATO pages rather than full ATO page text; upper values are consistent with lower × 1.25.',
    'PHI rebate percentages for 2023-24 were confirmed from hica.com.au "Previous Rebate Tiers" (1 July 2023 – 30 June 2024: 24.608/28.710/32.812 base; 16.405/20.507/24.608 tier 1; 8.202/12.303/16.405 tier 2) and the Department of Health circular PHI 17/24 stating the 1 April 2024 rebate adjustment factor was 1.000 (no change), so the Apr–Jun percentages equal the Jul–Mar percentages. The ATO prior-year PHI page itself could not be fetched.',
    'laundry ($1 / 50c per load, $150 cap without written evidence), instantDeductionThreshold ($300), cgtDiscountRate (50%), carryForwardTsbLimit ($500,000) and partYearThreshold ($13,464 + $395/month) confirmed from ATO page text. lspiaMinimum ($1,200) is a schema literal and was NOT independently confirmed by search.',
  ].join(' '),

  residentScale: [
    { from: 0, to: 18200, rate: 0, base: 0 },
    { from: 18201, to: 45000, rate: 0.19, base: 0 },
    { from: 45001, to: 120000, rate: 0.325, base: 5092 },
    { from: 120001, to: 180000, rate: 0.37, base: 29467 },
    { from: 180001, to: null, rate: 0.45, base: 51667 },
  ],
  foreignResidentScale: [
    { from: 0, to: 120000, rate: 0.325, base: 0 },
    { from: 120001, to: 180000, rate: 0.37, base: 39000 },
    { from: 180001, to: null, rate: 0.45, base: 61200 },
  ],
  whmScale: [
    { from: 0, to: 45000, rate: 0.15, base: 0 },
    { from: 45001, to: 120000, rate: 0.325, base: 6750 },
    { from: 120001, to: 180000, rate: 0.37, base: 31125 },
    { from: 180001, to: null, rate: 0.45, base: 53325 },
  ],

  lito: {
    max: 700,
    taper1: { from: 37500, to: 45000, rate: 0.05 },
    taper2: { from: 45000, to: 66667, rate: 0.015 },
  },

  sapto: {
    single: { maxOffset: 2230, shadeOutFrom: 32279, cutOut: 50119 },
    coupleEach: { maxOffset: 1602, shadeOutFrom: 28974, cutOut: 41790 },
    taperRate: 0.125,
  },

  medicare: {
    rate: 0.02,
    phaseInRate: 0.1,
    lowIncome: {
      single: { lower: 26000, upper: 32500 },
      family: { lower: 43846, upper: 54807 },
      sapto: { lower: 41089, upper: 51361 },
      saptoFamily: { lower: 57198, upper: 71497 },
      familyChildIncrement: 4027,
    },
  },

  mls: {
    tiers: [
      { tier: 0, singleTo: 93000, familyTo: 186000, rate: 0 },
      { tier: 1, singleTo: 108000, familyTo: 216000, rate: 0.01 },
      { tier: 2, singleTo: 144000, familyTo: 288000, rate: 0.0125 },
      { tier: 3, singleTo: null, familyTo: null, rate: 0.015 },
    ],
    familyChildIncrement: 1500,
  },

  // Percentages (24.608 = 24.608%). 1 April 2024 adjustment factor was 1.000, so both periods match.
  phiRebate: [
    { tier: 0, under65: 24.608, age65to69: 28.71, age70plus: 32.812, under65Apr: 24.608, age65to69Apr: 28.71, age70plusApr: 32.812 },
    { tier: 1, under65: 16.405, age65to69: 20.507, age70plus: 24.608, under65Apr: 16.405, age65to69Apr: 20.507, age70plusApr: 24.608 },
    { tier: 2, under65: 8.202, age65to69: 12.303, age70plus: 16.405, under65Apr: 8.202, age65to69Apr: 12.303, age70plusApr: 16.405 },
    { tier: 3, under65: 0, age65to69: 0, age70plus: 0, under65Apr: 0, age65to69Apr: 0, age70plusApr: 0 },
  ],

  carCentsPerKm: 85,
  carMaxKm: 5000,
  wfhFixedRatePerHour: 67,
  laundry: { perLoadWorkOnly: 100, perLoadMixed: 50, noEvidenceCap: 15000 },
  instantDeductionThreshold: 300,
  concessionalCap: 27500,
  carryForwardTsbLimit: 500000,
  cgtDiscountRate: 0.5,

  // Rate applies to the WHOLE repayment income once above the band's `from`.
  studyLoan: {
    method: 'total_income_rate',
    bands: [
      { from: 0, to: 51549, rate: 0 },
      { from: 51550, to: 59518, rate: 0.01 },
      { from: 59519, to: 63089, rate: 0.02 },
      { from: 63090, to: 66875, rate: 0.025 },
      { from: 66876, to: 70888, rate: 0.03 },
      { from: 70889, to: 75140, rate: 0.035 },
      { from: 75141, to: 79649, rate: 0.04 },
      { from: 79650, to: 84429, rate: 0.045 },
      { from: 84430, to: 89494, rate: 0.05 },
      { from: 89495, to: 94865, rate: 0.055 },
      { from: 94866, to: 100557, rate: 0.06 },
      { from: 100558, to: 106590, rate: 0.065 },
      { from: 106591, to: 112985, rate: 0.07 },
      { from: 112986, to: 119764, rate: 0.075 },
      { from: 119765, to: 126950, rate: 0.08 },
      { from: 126951, to: 134568, rate: 0.085 },
      { from: 134569, to: 142642, rate: 0.09 },
      { from: 142643, to: 151200, rate: 0.095 },
      { from: 151201, to: null, rate: 0.1 },
    ],
  },

  lspiaMinimum: 1200,
  partYearThreshold: { base: 13464, perMonth: 395 },

  sources: [
    { key: 'residentScale', url: 'https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents', checkedOn: '2026-09-28' },
    { key: 'foreignResidentScale', url: 'https://www.ato.gov.au/tax-rates-and-codes/tax-rates-foreign-residents', checkedOn: '2026-09-28' },
    { key: 'whmScale', url: 'https://www.ato.gov.au/tax-rates-and-codes/tax-rates-working-holiday-makers', checkedOn: '2026-09-28' },
    { key: 'lito', url: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/tax-offsets/low-income-tax-offset', checkedOn: '2026-09-28' },
    { key: 'sapto', url: 'https://www.ato.gov.au/forms-and-instructions/withholding-declaration-calculating-your-tax-offset/calculate-a-seniors-and-pensioners-tax-offset', checkedOn: '2026-09-28' },
    { key: 'sapto', url: 'https://www.ato.gov.au/individuals-and-families/your-tax-return/instructions-to-complete-your-tax-return/paper-tax-return-instructions/2024/tax-return/medicare-levy-questions-m1-m2/m1-medicare-levy-reduction-or-exemption-2024', checkedOn: '2026-09-28' },
    { key: 'medicare', url: 'https://www.ato.gov.au/individuals-and-families/your-tax-return/instructions-to-complete-your-tax-return/paper-tax-return-instructions/2024/tax-return/medicare-levy-questions-m1-m2/m1-medicare-levy-reduction-or-exemption-2024', checkedOn: '2026-09-28' },
    { key: 'medicare', url: 'https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/medicare-levy/medicare-levy-reduction/medicare-levy-reduction-for-low-income-earners', checkedOn: '2026-09-28' },
    { key: 'mls', url: 'https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/medicare-levy-surcharge/medicare-levy-surcharge-income-thresholds-and-rates', checkedOn: '2026-09-28' },
    { key: 'phiRebate', url: 'https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/private-health-insurance-rebate/income-thresholds-and-rates-for-the-private-health-insurance-rebate', checkedOn: '2026-09-28' },
    { key: 'phiRebate', url: 'https://www.health.gov.au/news/phi-circulars/phi-1724-private-health-insurance-rebate-adjustment-factor-effective-1-april-2024', checkedOn: '2026-09-28' },
    { key: 'carCentsPerKm', url: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/work-related-deductions/cars-transport-and-travel/motor-vehicle-and-car-expenses/expenses-for-a-car-you-own-or-lease/cents-per-kilometre-method', checkedOn: '2026-09-28' },
    { key: 'wfhFixedRatePerHour', url: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/work-related-deductions/working-from-home-expenses/fixed-rate-method', checkedOn: '2026-09-28' },
    { key: 'laundry', url: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/work-related-deductions/clothes-and-items-you-wear-at-work/clothing-laundry-and-dry-cleaning-expenses', checkedOn: '2026-09-28' },
    { key: 'instantDeductionThreshold', url: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/work-related-deductions/tools-computers-and-items-you-use-for-work', checkedOn: '2026-09-28' },
    { key: 'concessionalCap', url: 'https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/contributions-caps', checkedOn: '2026-09-28' },
    { key: 'carryForwardTsbLimit', url: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/concessional-contributions-cap', checkedOn: '2026-09-28' },
    { key: 'cgtDiscountRate', url: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/cgt-discount', checkedOn: '2026-09-28' },
    { key: 'studyLoan', url: 'https://www.ato.gov.au/tax-rates-and-codes/study-and-training-support-loans-rates-and-repayment-thresholds', checkedOn: '2026-09-28' },
    { key: 'lspiaMinimum', url: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/tax-offsets/lump-sum-payment-in-arrears-tax-offset' },
    { key: 'partYearThreshold', url: 'https://www.ato.gov.au/individuals-and-families/your-tax-return/instructions-to-complete-your-tax-return/mytax-instructions/2024/adjustments/part-year-tax-free-threshold', checkedOn: '2026-09-28' },
  ],
});

export default ruleSet;
