import { z } from 'zod';

/**
 * Rule table schema. One file per financial year must satisfy this schema at build time.
 * All money values in this file are WHOLE DOLLARS (thresholds) or RATES (decimal fractions);
 * the calculation engine converts to cents. Every value must be backed by a `sources` entry.
 */

export const FY_VALUES = ['2023-24', '2024-25', '2025-26', '2026-27'] as const;

export const bracketSchema = z.object({
  /** Lower bound in whole dollars, inclusive. */
  from: z.number().int().min(0),
  /** Upper bound in whole dollars, inclusive; null = no upper bound. */
  to: z.number().int().positive().nullable(),
  /** Marginal rate on each dollar above `from - 1` (so `from` 18201 means over 18200). */
  rate: z.number().min(0).max(1),
  /** Tax at the bottom of the bracket (whole dollars), i.e. tax on `from - 1`. */
  base: z.number().min(0),
});
export type Bracket = z.infer<typeof bracketSchema>;

export const taperSchema = z.object({ from: z.number(), to: z.number(), rate: z.number() });

export const thresholdsSchema = z.object({
  /** No levy at or below this taxable income (whole dollars). */
  lower: z.number(),
  /** Full levy above this taxable income (phase-in ends). */
  upper: z.number(),
});

export const medicareSchema = z.object({
  rate: z.number(),
  /** Phase-in rate applied to income above `lower` (e.g. 0.10). */
  phaseInRate: z.number(),
  lowIncome: z.object({
    single: thresholdsSchema,
    family: thresholdsSchema,
    /** Seniors and pensioners tax offset eligible. */
    sapto: thresholdsSchema,
    saptoFamily: thresholdsSchema,
    /** Added to the family lower threshold per dependent child (upper = lower / (1 - phaseInRate/levy) computed in code). */
    familyChildIncrement: z.number(),
  }),
});

export const mlsTierSchema = z.object({
  tier: z.number().int().min(0).max(3),
  /** Singles: MLS income up to this amount (whole dollars) sits in this tier; null = top tier. */
  singleTo: z.number().nullable(),
  familyTo: z.number().nullable(),
  rate: z.number(),
});

export const rebateTierSchema = z.object({
  tier: z.number().int().min(0).max(3),
  /** Rebate percentages by age band, for the period from 1 July to 31 March. */
  under65: z.number(),
  age65to69: z.number(),
  age70plus: z.number(),
  /** Percentages for 1 April to 30 June (rebate adjusts each 1 April). */
  under65Apr: z.number(),
  age65to69Apr: z.number(),
  age70plusApr: z.number(),
});

export const repaymentBandSchema = z.object({
  /** Repayment income above this amount (whole dollars). */
  from: z.number(),
  to: z.number().nullable(),
  /** total_income_rate: rate applied to the whole repayment income. marginal: rate applied to dollars in band. */
  rate: z.number(),
  /** marginal only: repayment at the bottom of the band. */
  base: z.number().optional(),
  /**
   * marginal only: when true the rate applies to the WHOLE repayment income (not just the dollars in
   * the band) and `base` is ignored. Used for the "10% of total repayment income" top band from 2025-26.
   */
  wholeIncome: z.boolean().optional(),
});

export const saptoSchema = z.object({
  single: z.object({ maxOffset: z.number(), shadeOutFrom: z.number(), cutOut: z.number() }),
  coupleEach: z.object({ maxOffset: z.number(), shadeOutFrom: z.number(), cutOut: z.number() }),
  taperRate: z.number(),
});

export const ruleSetSchema = z
  .object({
    fy: z.enum(FY_VALUES),
    version: z.string().regex(/^20\d{2}-\d{2}\.\d+$/),
    /** Values carried forward or otherwise not yet confirmed for this year (shown as limitations). */
    unconfirmed: z.array(z.string()).optional(),
    /** ISO date someone checked every source. */
    verifiedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Free-text notes about verification status (e.g. which values await ATO confirmation). */
    verificationNotes: z.string().optional(),
    residentScale: z.array(bracketSchema).min(1),
    foreignResidentScale: z.array(bracketSchema).min(1),
    whmScale: z.array(bracketSchema).min(1),
    lito: z.object({ max: z.number(), taper1: taperSchema, taper2: taperSchema }),
    sapto: saptoSchema,
    medicare: medicareSchema,
    mls: z.object({ tiers: z.array(mlsTierSchema).length(4), familyChildIncrement: z.number() }),
    phiRebate: z.array(rebateTierSchema).length(4),
    carCentsPerKm: z.number(),
    carMaxKm: z.literal(5000),
    wfhFixedRatePerHour: z.number(),
    laundry: z.object({ perLoadWorkOnly: z.number(), perLoadMixed: z.number(), noEvidenceCap: z.number() }),
    instantDeductionThreshold: z.literal(300),
    /** Concessional contributions cap (whole dollars). */
    concessionalCap: z.number(),
    /** Transfer balance / total super balance limit for carry-forward (whole dollars). */
    carryForwardTsbLimit: z.number(),
    cgtDiscountRate: z.number(),
    studyLoan: z.object({
      method: z.enum(['total_income_rate', 'marginal']),
      bands: z.array(repaymentBandSchema).min(1),
    }),
    lspiaMinimum: z.literal(1200),
    /** Full-year tax-free threshold and the part-year formula components. */
    partYearThreshold: z.object({ base: z.number(), perMonth: z.number() }),
    sources: z.array(z.object({ key: z.string(), url: z.string().url(), checkedOn: z.string().optional() })).min(1),
  })
  .strict();

export type RuleSet = z.infer<typeof ruleSetSchema>;
export type MlsTier = z.infer<typeof mlsTierSchema>;
export type RebateTier = z.infer<typeof rebateTierSchema>;
export type RepaymentBand = z.infer<typeof repaymentBandSchema>;

/** Every top-level numeric key must have a source; used by the rules test. */
export const REQUIRED_SOURCE_KEYS = [
  'residentScale',
  'foreignResidentScale',
  'whmScale',
  'lito',
  'sapto',
  'medicare',
  'mls',
  'phiRebate',
  'carCentsPerKm',
  'wfhFixedRatePerHour',
  'laundry',
  'instantDeductionThreshold',
  'concessionalCap',
  'carryForwardTsbLimit',
  'cgtDiscountRate',
  'studyLoan',
  'lspiaMinimum',
  'partYearThreshold',
] as const;

export function validateRuleSet(input: unknown): RuleSet {
  const parsed = ruleSetSchema.parse(input);
  const keys = new Set(parsed.sources.map((s) => s.key));
  const missing = REQUIRED_SOURCE_KEYS.filter((k) => !keys.has(k));
  if (missing.length) throw new Error(`Rule set ${parsed.version} is missing sources for: ${missing.join(', ')}`);
  for (const scale of [parsed.residentScale, parsed.foreignResidentScale, parsed.whmScale]) {
    assertContinuous(scale);
  }
  return parsed;
}

export function assertContinuous(scale: Bracket[]): void {
  let expectedFrom = 0;
  scale.forEach((b, i) => {
    if (b.from !== expectedFrom) throw new Error(`Bracket ${i} starts at ${b.from}, expected ${expectedFrom}`);
    if (b.to === null) {
      if (i !== scale.length - 1) throw new Error('Only the last bracket may be open-ended');
    } else {
      expectedFrom = b.to + 1;
    }
  });
  if (scale[scale.length - 1]?.to !== null) throw new Error('Last bracket must be open-ended');
}
