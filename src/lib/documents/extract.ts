import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';

/** Allowance types the interview understands (allow.item.type). */
export const ALLOWANCE_TYPES = ['car_km', 'travel', 'meal', 'tool', 'uniform_laundry', 'site_industry', 'lafha', 'first_aid', 'phone', 'other'] as const;

const dollars = z.number().nullable().describe('Whole-year amount in Australian dollars, e.g. 62000.5. null if not shown.');

export const ExtractedStatement = z.object({
  documentKind: z.enum(['income_statement', 'payment_summary', 'payslip', 'other']),
  financialYear: z.string().nullable().describe('Income year as "YYYY-YY", e.g. "2025-26" for 1 July 2025 to 30 June 2026. null if not shown.'),
  employers: z.array(
    z.object({
      name: z.string().describe('Employer or payer name exactly as shown.'),
      abn: z.string().nullable().describe('11-digit ABN digits only, or null.'),
      gross: dollars.describe('Gross payments / salary and wages, excluding allowances and lump sums.'),
      withheld: dollars.describe('Total tax withheld.'),
      rfb: dollars.describe('Reportable fringe benefits amount.'),
      resc: dollars.describe('Reportable employer superannuation contributions (not the super guarantee).'),
      lumpA: dollars.describe('Lump sum A.'),
      lumpAType: z.enum(['R', 'T']).nullable().describe('Lump sum A type code if shown.'),
      lumpB: dollars.describe('Lump sum B.'),
      lumpD: dollars.describe('Lump sum D.'),
      lumpE: dollars.describe('Lump sum E.'),
      taxReady: z.boolean().nullable().describe('true if the statement is marked "Tax ready", false if "Not tax ready", null if not shown.'),
      allowances: z.array(
        z.object({
          description: z.string().describe('The allowance label as printed.'),
          type: z.enum(ALLOWANCE_TYPES).describe('Best matching category. Use other when unsure.'),
          amount: z.number().describe('Amount in dollars.'),
        }),
      ),
    }),
  ),
  notes: z.string().describe('Anything unclear or unreadable, in one or two plain sentences. Empty string if none.'),
});
export type ExtractedStatement = z.infer<typeof ExtractedStatement>;

export const EXTRACT_MEDIA_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export type ExtractMediaType = (typeof EXTRACT_MEDIA_TYPES)[number];

const SYSTEM = `You read Australian income statements (myGov / ATO online services), PAYG payment summaries and payslips, and return the figures for a tax interview.
Rules:
- Report only figures printed on the document. Never estimate or calculate a missing figure; use null.
- One employers entry per employer or payer on the document.
- A payslip: use the year-to-date figures, and say in notes that they are year-to-date only.
- Never include a tax file number anywhere in the output, even in notes.
- Amounts are Australian dollars; drop $ signs and commas.`;

/** A prior-year notice of assessment, return or activity statement: closing balances only. */
export const ExtractedPriorYear = z.object({
  documentKind: z.enum(['notice_of_assessment', 'tax_return', 'activity_statement', 'other']),
  financialYear: z.string().nullable().describe('Income year the document is for, as "YYYY-YY". null if not shown.'),
  taxableIncome: dollars.describe('Taxable income for that year.'),
  netCapitalLossesCarriedForward: dollars.describe('Net capital losses carried forward to later income years (the closing balance).'),
  deferredLosses: z.array(z.object({
    activity: z.string().describe('The business activity the deferred non-commercial loss belongs to, as described.'),
    amount: z.number().describe('Deferred loss carried forward, in dollars.'),
  })).describe('Deferred non-commercial business losses carried forward, one per activity. Empty if none shown.'),
  notes: z.string().describe('Anything unclear, in one or two plain sentences. Empty string if none.'),
});
export type ExtractedPriorYear = z.infer<typeof ExtractedPriorYear>;

export function extractionAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function fileBlock(file: { data: Buffer; mediaType: ExtractMediaType }): Anthropic.Beta.BetaContentBlockParam {
  const b64 = file.data.toString('base64');
  return file.mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: file.mediaType, data: b64 } };
}

const PRIOR_SYSTEM = `You read an Australian individual's earlier-year tax document (ATO notice of assessment, tax return or activity statement) and return only closing balances for the next year.
Rules:
- Report only figures printed on the document. Never estimate, add up or calculate a missing figure; use null.
- Capital losses and deferred non-commercial business losses are different things; never put one in the other.
- Never include a tax file number anywhere in the output, even in notes.
- Amounts are Australian dollars; drop $ signs and commas.`;

/** Read a prior-year document for opening balances. */
export async function extractPriorYear(file: { data: Buffer; mediaType: ExtractMediaType }): Promise<ExtractedPriorYear> {
  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(ExtractedPriorYear) },
    system: PRIOR_SYSTEM,
    messages: [{ role: 'user', content: [fileBlock(file), { type: 'text', text: 'Extract the closing balances from this document.' }] }],
  });
  if (response.stop_reason === 'refusal') throw new Error('The document could not be read. Enter the balances by hand.');
  if (!response.parsed_output) throw new Error('The document could not be read clearly. Try a clearer copy or enter the balances by hand.');
  return response.parsed_output;
}

/** Send one statement (PDF or image) to Claude and return the structured figures. */
export async function extractStatement(file: { data: Buffer; mediaType: ExtractMediaType }): Promise<ExtractedStatement> {
  const client = new Anthropic();
  const source = fileBlock(file);
  const response = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(ExtractedStatement) },
    system: SYSTEM,
    messages: [{ role: 'user', content: [source, { type: 'text', text: 'Extract the figures from this document.' }] }],
  });
  if (response.stop_reason === 'refusal') throw new Error('The document could not be read. Enter the figures by hand.');
  if (!response.parsed_output) throw new Error('The document could not be read clearly. Try a clearer copy or enter the figures by hand.');
  return response.parsed_output;
}
