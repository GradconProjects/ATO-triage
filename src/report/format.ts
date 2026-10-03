/**
 * Formatting helpers shared by the snapshot builder, the PDF sections and the reports page.
 * Pure TypeScript: no framework imports, safe in the calc/report unit tests.
 */
import type { Question } from '@/src/engine/types';
import type { DateRangeValue } from '@/src/engine/types';
import { formatCents } from '@/src/engine/validation';

export const REPORT_TITLE = 'Tax estimate and advisory report (indicative only)';
export const PREPARED_BY = 'Prepared by your adviser';
export const DEFAULT_TIMEZONE = 'Australia/Melbourne';

export const DISCLAIMER_TEXT =
  'This report is an indicative estimate prepared from information you provided. It is not tax advice and is not a tax return. Final outcomes are determined by the ATO. Consider seeking advice from a registered tax agent.';

/** Integer cents to "$1,234.56"; negative amounts keep the leading minus. */
export function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '—';
  return formatCents(cents);
}

/** Absolute money with a refund/debt word, e.g. "refund of $820.00". */
export function resultPhrase(cents: number): string {
  if (cents === 0) return 'no refund and no debt';
  return `${cents < 0 ? 'debt' : 'refund'} of ${money(Math.abs(cents))}`;
}

/** "Refund between $820.00 and $1,140.00" / "Debt between ..." / mixed. */
export function rangePhrase(lowCents: number, highCents: number): string {
  const lo = Math.min(lowCents, highCents);
  const hi = Math.max(lowCents, highCents);
  if (lo >= 0) return `Refund between ${money(lo)} and ${money(hi)}`;
  if (hi <= 0) return `Debt between ${money(Math.abs(hi))} and ${money(Math.abs(lo))}`;
  return `Between a debt of ${money(Math.abs(lo))} and a refund of ${money(hi)}`;
}

export function formatDateTime(iso: string, timeZone: string = DEFAULT_TIMEZONE): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-AU', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export function percent(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${Math.round(n)}%`;
}

const YES_NO_UNSURE_LABELS: Record<string, string> = { yes: 'Yes', no: 'No', not_sure: 'Not sure' };

/**
 * Plain-text rendering of an answer value for the report. Mirrors the interview's
 * `displayValue` but lives here so server code never imports a client component.
 */
export function displayAnswerValue(q: Question | undefined, v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (!q) return typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (q.type === 'money' && typeof v === 'number') return formatCents(v);
  if (q.type === 'yes_no_unsure' && typeof v === 'string') return YES_NO_UNSURE_LABELS[v] ?? v;
  if (q.type === 'single' && typeof v === 'string') return q.options?.find((o) => o.value === v)?.label ?? v;
  if (q.type === 'multi' && Array.isArray(v)) {
    return v.map((x) => (x === 'not_sure' ? 'Not sure' : (q.options?.find((o) => o.value === x)?.label ?? String(x)))).join(', ');
  }
  if (q.type === 'date_range' && typeof v === 'object' && v && 'from' in v) {
    const r = v as DateRangeValue;
    return `${r.from} to ${r.to}`;
  }
  if (q.type === 'percent' && typeof v === 'number') return `${v}%`;
  if (q.type === 'km' && typeof v === 'number') return `${v} km`;
  if (q.type === 'repeater' && Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Human label for an income/deduction category id such as 'dividend_franked'. */
export function categoryLabel(id: string | undefined | null): string {
  if (!id) return 'Other';
  const known: Record<string, string> = {
    salary: 'Salary and wages',
    allowance: 'Allowances',
    other_employment: 'Other employment income',
    lump_sum_a: 'Lump sum A',
    lump_sum_b: 'Lump sum B',
    lump_sum_d: 'Lump sum D (tax-free)',
    lump_sum_e: 'Lump sum E',
    etp: 'Employment termination payment',
    compensation: 'Compensation and WorkCover',
    government: 'Government payments',
    super_income: 'Super income',
    interest: 'Interest',
    dividend_unfranked: 'Unfranked dividends',
    dividend_franked: 'Franked dividends',
    franking_credit: 'Franking credits',
    trust: 'Trust distributions',
    rent: 'Rental income',
    capital_gain: 'Capital gains',
    crypto_income: 'Crypto income',
    foreign: 'Foreign income',
    business: 'Business income',
    partnership_trust: 'Partnership and trust income',
    ess: 'Employee share schemes',
    car: 'Car expenses',
    work_travel: 'Work travel',
    overnight_travel: 'Overnight travel',
    clothing: 'Work clothing',
    laundry: 'Laundry',
    tools: 'Tools and equipment',
    home_office: 'Working from home',
    phone_internet: 'Phone and internet',
    self_education: 'Self-education',
    union_professional: 'Union and professional fees',
    subscriptions: 'Subscriptions',
    licences: 'Licences and cards',
    sun_protection: 'Sun protection',
    first_aid: 'First aid',
    other_work: 'Other work-related',
    gifts_donations: 'Gifts and donations',
    tax_affairs: 'Cost of managing tax affairs',
    compensation_costs: 'Costs of getting compensation payments',
    custom: 'Other deductions you added',
    income_protection: 'Income protection insurance',
    personal_super: 'Personal super contributions',
    investment: 'Investment expenses',
    rental: 'Rental expenses',
  };
  return known[id] ?? id.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function statusLabel(status: string): string {
  if (status === 'computed') return 'Included';
  if (status === 'excluded') return 'Excluded';
  if (status === 'manual_review') return 'Manual review';
  return status;
}

export function sourceLabel(source: string | undefined): string {
  if (source === 'document') return 'Imported';
  if (source === 'prefill_confirmed') return 'Confirmed';
  return 'Entered';
}
