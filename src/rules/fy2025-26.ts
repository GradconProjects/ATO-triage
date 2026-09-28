import { validateRuleSet, type RuleSet } from './schema';

/**
 * Rule table for the 2025–26 income year (1 July 2025 – 30 June 2026).
 * All thresholds are whole dollars; rates are decimal fractions; cents-per-unit values are cents.
 * Every value is backed by a `sources` row. See `verificationNotes` for anything not confirmed.
 */
const ruleSet: RuleSet = validateRuleSet({
  fy: '2025-26',
  version: '2025-26.1',
  verifiedOn: '2026-09-28',
  verificationNotes: [
    'Confirmed against ato.gov.au page text on 2026-09-28: resident, foreign-resident and WHM scales; LITO; SAPTO ($34,919 / $52,759 single, $30,994 / $43,810 each partner — T1 2026 / myTax 2026 pages); Medicare low-income thresholds (single $28,011 / $35,013, SAPTO $44,268 / $55,335, family $47,238 / $59,047, SAPTO family $61,623 / $77,028, child increment $4,338 lower / $5,423 upper — these are the 2026-27 Budget uplift applied retrospectively to 2025-26); MLS tiers; PHI rebate percentages for both periods (1 Jul 2025 – 31 Mar 2026 and 1 Apr – 30 Jun 2026, rebate adjustment factor 0.993); car 88c; WFH 70c; concessional cap $30,000; HELP marginal bands (ATO study-loan page, Table 2).',
    'Study loan is the new MARGINAL method: nil to $67,000; 15c per $1 over $67,000 to $125,000; $8,700 plus 17c per $1 over $125,000 to $179,285; and 10% of TOTAL repayment income from $179,286. The top band is flagged `wholeIncome: true` with base 0 — the engine must apply rate × whole repayment income for that band, not a marginal calculation. The ATO publishes the cap as a band boundary ($179,286), not as a formula; the bands are modelled exactly as published.',
    'laundry, instantDeductionThreshold, cgtDiscountRate, carryForwardTsbLimit and partYearThreshold confirmed from ATO page text. lspiaMinimum ($1,200) is a schema literal and was NOT independently confirmed by search.',
  ].join(' '),

  residentScale: [
    { from: 0, to: 18200, rate: 0, base: 0 },
    { from: 18201, to: 45000, rate: 0.16, base: 0 },
    { from: 45001, to: 135000, rate: 0.3, base: 4288 },
    { from: 135001, to: 190000, rate: 0.37, base: 31288 },
    { from: 190001, to: null, rate: 0.45, base: 51638 },
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
    single: { maxOffset: 2230, shadeOutFrom: 34919, cutOut: 52759 },
    coupleEach: { maxOffset: 1602, shadeOutFrom: 30994, cutOut: 43810 },
    taperRate: 0.125,
  },

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
      { tier: 0, singleTo: 101000, familyTo: 202000, rate: 0 },
      { tier: 1, singleTo: 118000, familyTo: 236000, rate: 0.01 },
      { tier: 2, singleTo: 158000, familyTo: 316000, rate: 0.0125 },
      { tier: 3, singleTo: null, familyTo: null, rate: 0.015 },
    ],
    familyChildIncrement: 1500,
  },

  // Percentages. Jul–Mar = 1 July 2025 – 31 March 2026; Apr = 1 April – 30 June 2026.
  phiRebate: [
    { tier: 0, under65: 24.288, age65to69: 28.337, age70plus: 32.385, under65Apr: 24.118, age65to69Apr: 28.139, age70plusApr: 32.158 },
    { tier: 1, under65: 16.192, age65to69: 20.24, age70plus: 24.288, under65Apr: 16.079, age65to69Apr: 20.098, age70plusApr: 24.118 },
    { tier: 2, under65: 8.095, age65to69: 12.143, age70plus: 16.192, under65Apr: 8.038, age65to69Apr: 12.058, age70plusApr: 16.079 },
    { tier: 3, under65: 0, age65to69: 0, age70plus: 0, under65Apr: 0, age65to69Apr: 0, age70plusApr: 0 },
  ],

  carCentsPerKm: 88,
  carMaxKm: 5000,
  wfhFixedRatePerHour: 70,
  laundry: { perLoadWorkOnly: 100, perLoadMixed: 50, noEvidenceCap: 15000 },
  instantDeductionThreshold: 300,
  concessionalCap: 30000,
  carryForwardTsbLimit: 500000,
  cgtDiscountRate: 0.5,

  // Marginal: `rate` applies to dollars in the band, `base` is the repayment at the bottom of the band.
  // The final band (`wholeIncome: true`) is 10% of the WHOLE repayment income.
  studyLoan: {
    method: 'marginal',
    bands: [
      { from: 0, to: 67000, rate: 0, base: 0 },
      { from: 67001, to: 125000, rate: 0.15, base: 0 },
      { from: 125001, to: 179285, rate: 0.17, base: 8700 },
      { from: 179286, to: null, rate: 0.1, base: 0, wholeIncome: true },
    ],
  },

  lspiaMinimum: 1200,
  partYearThreshold: { base: 13464, perMonth: 395 },

  sources: [
    { key: 'residentScale', url: 'https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents', checkedOn: '2026-09-28' },
    { key: 'foreignResidentScale', url: 'https://www.ato.gov.au/tax-rates-and-codes/tax-rates-foreign-residents', checkedOn: '2026-09-28' },
    { key: 'whmScale', url: 'https://www.ato.gov.au/tax-rates-and-codes/tax-rates-working-holiday-makers', checkedOn: '2026-09-28' },
    { key: 'lito', url: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/tax-offsets/low-income-tax-offset', checkedOn: '2026-09-28' },
    { key: 'sapto', url: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/tax-offsets/seniors-and-pensioners-tax-offset', checkedOn: '2026-09-28' },
    { key: 'sapto', url: 'https://www.ato.gov.au/forms-and-instructions/individual-tax-return-2026-instructions/tax-offset-questions-t1-t2-individual-tax-return-2026/t1-seniors-and-pensioners-tax-offset-2026', checkedOn: '2026-09-28' },
    { key: 'medicare', url: 'https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/medicare-levy/medicare-levy-reduction/medicare-levy-reduction-for-low-income-earners', checkedOn: '2026-09-28' },
    { key: 'medicare', url: 'https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/medicare-levy/medicare-levy-reduction/medicare-levy-reduction-family-income', checkedOn: '2026-09-28' },
    { key: 'mls', url: 'https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/medicare-levy-surcharge/medicare-levy-surcharge-income-thresholds-and-rates', checkedOn: '2026-09-28' },
    { key: 'phiRebate', url: 'https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/private-health-insurance-rebate/income-thresholds-and-rates-for-the-private-health-insurance-rebate', checkedOn: '2026-09-28' },
    { key: 'phiRebate', url: 'https://www.health.gov.au/news/phi-circulars/phi-1226-private-health-insurance-rebate-adjustment-factor-effective-1-april-2026', checkedOn: '2026-09-28' },
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
