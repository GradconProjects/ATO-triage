import { validateRuleSet, type RuleSet } from './schema';

/**
 * Rule table for the 2026–27 income year (1 July 2026 – 30 June 2027).
 * All thresholds are whole dollars; rates are decimal fractions; cents-per-unit values are cents.
 * Every value is backed by a `sources` row. See `verificationNotes` for anything not confirmed
 * or carried forward from 2025–26 pending an ATO announcement.
 */
const ruleSet: RuleSet = validateRuleSet({
  fy: '2026-27',
  version: '2026-27.1',
  verifiedOn: '2026-09-28',
  verificationNotes: [
    'Confirmed against ato.gov.au page text on 2026-09-28: resident scale (15% first bracket, bases $4,020 / $31,020 / $51,370 — ATO resident tax rates page and the "new tax cuts" legislation page); SAPTO 2026-27 ($36,034 / $53,874 single, $31,847 / $44,663 each partner — ATO "Personal income tax – new tax cuts" page; max offsets unchanged); MLS tiers ($105,000 / $123,000 / $164,000 single, $210,000 / $246,000 / $328,000 family — note tier 1 upper is $123,000 not $122,000); PHI rebate percentages for 1 July 2026 – 31 March 2027 (24.118 / 28.139 / 32.158 base etc.); car 91c (2026-27); concessional cap $32,500 (indexed from 1 July 2026); HELP marginal bands (ATO study-loan page, Table 1: $69,528 / $129,717 / $186,050, base $9,028).',
    'CARRIED FORWARD, NOT CONFIRMED: (1) Medicare low-income thresholds — the 2026-27 uplift had not been announced as at 2026-09-28, so the 2025-26 values (single $28,011 / $35,013, family $47,238 / $59,047, SAPTO $44,268 / $55,335, SAPTO family $61,623 / $77,028, child $4,338) are carried forward; these are normally indexed in the May Budget and applied retrospectively. (2) PHI rebate Apr–Jun 2027 percentages — the ATO says the 1 April 2027 rates will be published in March 2027; the Jul–Mar values are repeated for the Apr fields. (3) WFH fixed rate — the ATO fixed-rate page lists 70c for 2024-25 and 2025-26 only; 70c is carried forward for 2026-27 (PCG 2023/1 has no end date). (4) Foreign-resident and WHM scales — ATO pages list up to 2025-26; the 2026-27 tax cut only changes the 16% resident bracket, which neither scale uses, so the 2025-26 scales are carried forward.',
    'Study loan is the MARGINAL method: nil to $69,528; 15c per $1 over $69,528 to $129,717; $9,028 plus 17c per $1 over $129,717 to $186,050 (ATO publishes the base as $9,028; the exact 15% × $60,189 is $9,028.35); and 10% of TOTAL repayment income from $186,051. The top band is flagged `wholeIncome: true` with base 0 — the engine must apply rate × whole repayment income for that band.',
    'laundry, instantDeductionThreshold, cgtDiscountRate, carryForwardTsbLimit and partYearThreshold confirmed from ATO page text (part-year threshold from the myTax 2026 page; the 2027 page did not exist yet). lspiaMinimum ($1,200) is a schema literal and was NOT independently confirmed by search. The ATO also references a new optional "standard deduction" for 2026-27 which is outside this rule table.',
  ].join(' '),

  residentScale: [
    { from: 0, to: 18200, rate: 0, base: 0 },
    { from: 18201, to: 45000, rate: 0.15, base: 0 },
    { from: 45001, to: 135000, rate: 0.3, base: 4020 },
    { from: 135001, to: 190000, rate: 0.37, base: 31020 },
    { from: 190001, to: null, rate: 0.45, base: 51370 },
  ],
  foreignResidentScale: [
    { from: 0, to: 135000, rate: 0.3, base: 0 },
    { from: 135001, to: 190000, rate: 0.37, base: 40500 },
    { from: 190001, to: null, rate: 0.45, base: 60850 },
  ],
  whmScale: [
    { from: 0, to: 45000, rate: 0.15, base: 0 },
    { from: 45001, to: 135000, rate: 0.3, base: 6750 },
    { from: 135001, to: 190000, rate: 0.37, base: 33750 },
    { from: 190001, to: null, rate: 0.45, base: 54100 },
  ],

  lito: {
    max: 700,
    taper1: { from: 37500, to: 45000, rate: 0.05 },
    taper2: { from: 45000, to: 66667, rate: 0.015 },
  },

  sapto: {
    single: { maxOffset: 2230, shadeOutFrom: 36034, cutOut: 53874 },
    coupleEach: { maxOffset: 1602, shadeOutFrom: 31847, cutOut: 44663 },
    taperRate: 0.125,
  },

  // Carried forward from 2025-26 pending the 2026-27 announcement (see verificationNotes).
  medicare: {
    rate: 0.02,
    phaseInRate: 0.1,
    lowIncome: {
      single: { lower: 28011, upper: 35013 },
      family: { lower: 47238, upper: 59047 },
      sapto: { lower: 44268, upper: 55335 },
      saptoFamily: { lower: 61623, upper: 77028 },
      familyChildIncrement: 4338,
    },
  },

  mls: {
    tiers: [
      { tier: 0, singleTo: 105000, familyTo: 210000, rate: 0 },
      { tier: 1, singleTo: 123000, familyTo: 246000, rate: 0.01 },
      { tier: 2, singleTo: 164000, familyTo: 328000, rate: 0.0125 },
      { tier: 3, singleTo: null, familyTo: null, rate: 0.015 },
    ],
    familyChildIncrement: 1500,
  },

  // Percentages. Jul–Mar = 1 July 2026 – 31 March 2027 (confirmed). Apr–Jun 2027 not yet published; Jul–Mar repeated.
  phiRebate: [
    { tier: 0, under65: 24.118, age65to69: 28.139, age70plus: 32.158, under65Apr: 24.118, age65to69Apr: 28.139, age70plusApr: 32.158 },
    { tier: 1, under65: 16.079, age65to69: 20.098, age70plus: 24.118, under65Apr: 16.079, age65to69Apr: 20.098, age70plusApr: 24.118 },
    { tier: 2, under65: 8.038, age65to69: 12.058, age70plus: 16.079, under65Apr: 8.038, age65to69Apr: 12.058, age70plusApr: 16.079 },
    { tier: 3, under65: 0, age65to69: 0, age70plus: 0, under65Apr: 0, age65to69Apr: 0, age70plusApr: 0 },
  ],

  carCentsPerKm: 91,
  carMaxKm: 5000,
  wfhFixedRatePerHour: 70,
  laundry: { perLoadWorkOnly: 100, perLoadMixed: 50, noEvidenceCap: 15000 },
  instantDeductionThreshold: 300,
  concessionalCap: 32500,
  carryForwardTsbLimit: 500000,
  cgtDiscountRate: 0.5,

  // Marginal: `rate` applies to dollars in the band, `base` is the repayment at the bottom of the band.
  // The final band (`wholeIncome: true`) is 10% of the WHOLE repayment income.
  studyLoan: {
    method: 'marginal',
    bands: [
      { from: 0, to: 69528, rate: 0, base: 0 },
      { from: 69529, to: 129717, rate: 0.15, base: 0 },
      { from: 129718, to: 186050, rate: 0.17, base: 9028 },
      { from: 186051, to: null, rate: 0.1, base: 0, wholeIncome: true },
    ],
  },

  lspiaMinimum: 1200,
  partYearThreshold: { base: 13464, perMonth: 395 },

  sources: [
    { key: 'residentScale', url: 'https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents', checkedOn: '2026-09-28' },
    { key: 'residentScale', url: 'https://www.ato.gov.au/about-ato/new-legislation/in-detail/individuals/personal-income-tax-new-tax-cuts-for-every-australian-taxpayer', checkedOn: '2026-09-28' },
    { key: 'foreignResidentScale', url: 'https://www.ato.gov.au/tax-rates-and-codes/tax-rates-foreign-residents', checkedOn: '2026-09-28' },
    { key: 'whmScale', url: 'https://www.ato.gov.au/tax-rates-and-codes/tax-rates-working-holiday-makers', checkedOn: '2026-09-28' },
    { key: 'lito', url: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/tax-offsets/low-income-tax-offset', checkedOn: '2026-09-28' },
    { key: 'sapto', url: 'https://www.ato.gov.au/about-ato/new-legislation/in-detail/individuals/personal-income-tax-new-tax-cuts-for-every-australian-taxpayer', checkedOn: '2026-09-28' },
    { key: 'sapto', url: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/tax-offsets/seniors-and-pensioners-tax-offset', checkedOn: '2026-09-28' },
    { key: 'medicare', url: 'https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/medicare-levy/medicare-levy-reduction/medicare-levy-reduction-for-low-income-earners', checkedOn: '2026-09-28' },
    { key: 'medicare', url: 'https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/medicare-levy/medicare-levy-reduction/medicare-levy-reduction-family-income', checkedOn: '2026-09-28' },
    { key: 'mls', url: 'https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/medicare-levy-surcharge/medicare-levy-surcharge-income-thresholds-and-rates', checkedOn: '2026-09-28' },
    { key: 'phiRebate', url: 'https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/private-health-insurance-rebate/income-thresholds-and-rates-for-the-private-health-insurance-rebate', checkedOn: '2026-09-28' },
    { key: 'carCentsPerKm', url: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/work-related-deductions/cars-transport-and-travel/motor-vehicle-and-car-expenses/expenses-for-a-car-you-own-or-lease/cents-per-kilometre-method', checkedOn: '2026-09-28' },
    { key: 'wfhFixedRatePerHour', url: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/work-related-deductions/working-from-home-expenses/fixed-rate-method', checkedOn: '2026-09-28' },
    { key: 'laundry', url: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/work-related-deductions/clothes-and-items-you-wear-at-work/clothing-laundry-and-dry-cleaning-expenses', checkedOn: '2026-09-28' },
    { key: 'instantDeductionThreshold', url: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/work-related-deductions/tools-computers-and-items-you-use-for-work', checkedOn: '2026-09-28' },
    { key: 'concessionalCap', url: 'https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/contributions-caps', checkedOn: '2026-09-28' },
    { key: 'carryForwardTsbLimit', url: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/concessional-contributions-cap', checkedOn: '2026-09-28' },
    { key: 'cgtDiscountRate', url: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/cgt-discount', checkedOn: '2026-09-28' },
    { key: 'studyLoan', url: 'https://www.ato.gov.au/tax-rates-and-codes/study-and-training-support-loans-rates-and-repayment-thresholds', checkedOn: '2026-09-28' },
    { key: 'lspiaMinimum', url: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/tax-offsets/lump-sum-payment-in-arrears-tax-offset' },
    { key: 'partYearThreshold', url: 'https://www.ato.gov.au/individuals-and-families/your-tax-return/instructions-to-complete-your-tax-return/mytax-instructions/2026/adjustments/part-year-tax-free-threshold', checkedOn: '2026-09-28' },
  ],
});

export default ruleSet;
