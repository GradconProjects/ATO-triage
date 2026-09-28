import { validateRuleSet, type RuleSet } from './schema';

/**
 * Rule table for the 2024–25 income year (1 July 2024 – 30 June 2025).
 * All thresholds are whole dollars; rates are decimal fractions; cents-per-unit values are cents.
 * Every value is backed by a `sources` row. See `verificationNotes` for anything not confirmed.
 */
const ruleSet: RuleSet = validateRuleSet({
  fy: '2024-25',
  version: '2024-25.1',
  verifiedOn: '2026-09-28',
  verificationNotes: [
    'Confirmed against ato.gov.au page text on 2026-09-28: resident, foreign-resident and WHM scales; LITO; MLS tiers; PHI rebate percentages for both periods (1 Jul 2024 – 31 Mar 2025 and 1 Apr – 30 Jun 2025); car 88c; WFH 70c; concessional cap $30,000; HELP bands (ATO study-loan page, Table 3).',
    'SAPTO: the 2024-25 thresholds are $34,919 shade-out / $52,759 cut-out (single) and $30,994 / $43,810 (each partner of a couple), NOT the pre-2024-25 $32,279 / $50,119 figures. Confirmed by the ATO SAPTO page and the T1 / myTax 2025 pages ("rebate income was less than $52,759" for 2024-25). Illness-separated couple ($2,040 / $33,732 / $50,052) is not modelled by the schema.',
    'Medicare low-income: single $27,222 / $34,027 and SAPTO single $43,020 / $53,775 confirmed from the myTax 2025 and M1 2025 pages; family upper $57,383 and SAPTO family upper $74,857 (child upper increment $5,270) confirmed from the myTax 2025 worksheet. Family LOWER $45,907, SAPTO family lower $59,886 and child increment $4,216 were confirmed only via ATO/news snippets describing the 2026 Budget uplift ("from $45,907 to $47,238", "from $59,886 to $61,623", "$4,216 to $4,338"); uppers are consistent with lower × 1.25.',
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
      single: { lower: 27222, upper: 34027 },
      family: { lower: 45907, upper: 57383 },
      sapto: { lower: 43020, upper: 53775 },
      saptoFamily: { lower: 59886, upper: 74857 },
      familyChildIncrement: 4216,
    },
  },

  mls: {
    tiers: [
      { tier: 0, singleTo: 97000, familyTo: 194000, rate: 0 },
      { tier: 1, singleTo: 113000, familyTo: 226000, rate: 0.01 },
      { tier: 2, singleTo: 151000, familyTo: 302000, rate: 0.0125 },
      { tier: 3, singleTo: null, familyTo: null, rate: 0.015 },
    ],
    familyChildIncrement: 1500,
  },

  // Percentages. Jul–Mar = 1 July 2024 – 31 March 2025; Apr = 1 April – 30 June 2025.
  phiRebate: [
    { tier: 0, under65: 24.608, age65to69: 28.71, age70plus: 32.812, under65Apr: 24.288, age65to69Apr: 28.337, age70plusApr: 32.385 },
    { tier: 1, under65: 16.405, age65to69: 20.507, age70plus: 24.608, under65Apr: 16.192, age65to69Apr: 20.24, age70plusApr: 24.288 },
    { tier: 2, under65: 8.202, age65to69: 12.303, age70plus: 16.405, under65Apr: 8.095, age65to69Apr: 12.143, age70plusApr: 16.192 },
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

  // Rate applies to the WHOLE repayment income once above the band's `from`.
  studyLoan: {
    method: 'total_income_rate',
    bands: [
      { from: 0, to: 54434, rate: 0 },
      { from: 54435, to: 62850, rate: 0.01 },
      { from: 62851, to: 66620, rate: 0.02 },
      { from: 66621, to: 70618, rate: 0.025 },
      { from: 70619, to: 74855, rate: 0.03 },
      { from: 74856, to: 79346, rate: 0.035 },
      { from: 79347, to: 84107, rate: 0.04 },
      { from: 84108, to: 89154, rate: 0.045 },
      { from: 89155, to: 94503, rate: 0.05 },
      { from: 94504, to: 100174, rate: 0.055 },
      { from: 100175, to: 106185, rate: 0.06 },
      { from: 106186, to: 112556, rate: 0.065 },
      { from: 112557, to: 119309, rate: 0.07 },
      { from: 119310, to: 126467, rate: 0.075 },
      { from: 126468, to: 134056, rate: 0.08 },
      { from: 134057, to: 142100, rate: 0.085 },
      { from: 142101, to: 150626, rate: 0.09 },
      { from: 150627, to: 159663, rate: 0.095 },
      { from: 159664, to: null, rate: 0.1 },
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
    { key: 'sapto', url: 'https://www.ato.gov.au/forms-and-instructions/individual-tax-return-2025-instructions/tax-offset-questions-t1-t2-individual-tax-return-2025/t1-seniors-and-pensioners-tax-offset-2025', checkedOn: '2026-09-28' },
    { key: 'medicare', url: 'https://www.ato.gov.au/individuals-and-families/your-tax-return/instructions-to-complete-your-tax-return/mytax-instructions/2025/medicare-and-private-health-insurance/medicare-levy-reduction-or-exemption', checkedOn: '2026-09-28' },
    { key: 'medicare', url: 'https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/medicare-levy/medicare-levy-reduction/medicare-levy-reduction-for-low-income-earners', checkedOn: '2026-09-28' },
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
    { key: 'partYearThreshold', url: 'https://www.ato.gov.au/individuals-and-families/your-tax-return/instructions-to-complete-your-tax-return/mytax-instructions/2025/adjustments/part-year-tax-free-threshold', checkedOn: '2026-09-28' },
  ],
});

export default ruleSet;
