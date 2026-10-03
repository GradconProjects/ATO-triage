/**
 * Field validation (Section 4 "Validation"). Cross-field checks live in the intelligence
 * layer, not here. `warnAbove` only ever warns; it never blocks.
 */
import type { CaseContext, DateRangeValue, FY, Question, ValidationRule } from './types';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidIsoDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = ISO_DATE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** '2025-26' -> { from: '2025-07-01', to: '2026-06-30' } */
export function fyDateBounds(fy: FY): { from: string; to: string } {
  const startYear = Number(fy.slice(0, 4));
  return { from: `${startYear}-07-01`, to: `${startYear + 1}-06-30` };
}

/**
 * "$1,234.56" -> 123456, "1234" -> 123400, "-12.5" -> -1250.
 * Empty or junk -> null. Uses integer arithmetic only (no float rounding).
 */
export function parseMoneyToCents(text: string): number | null {
  if (typeof text !== 'string') return null;
  let s = text.replace(/[\s$,]/g, '');
  if (s === '') return null;
  let sign = 1;
  if (s.startsWith('-')) {
    sign = -1;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  const m = /^(\d*)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) return null;
  const dollarsText = m[1] ?? '';
  const centsText = m[2] ?? '';
  if (dollarsText === '' && centsText === '') return null;
  const dollars = dollarsText === '' ? 0 : Number(dollarsText);
  const cents = centsText === '' ? 0 : Number(centsText.padEnd(2, '0'));
  if (!Number.isSafeInteger(dollars) || !Number.isSafeInteger(cents)) return null;
  const total = dollars * 100 + cents;
  if (!Number.isSafeInteger(total)) return null;
  return sign * total;
}

/** 123456 -> "$1,234.56"; -1250 -> "-$12.50". */
export function formatCents(cents: number): string {
  const n = Number.isFinite(cents) ? Math.trunc(cents) : 0;
  const abs = Math.abs(n);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const dollarsText = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${n < 0 ? '-' : ''}$${dollarsText}.${rem.toString().padStart(2, '0')}`;
}

const NUMERIC_TYPES = new Set<Question['type']>(['money', 'number', 'percent', 'km']);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isDateRange(v: unknown): v is DateRangeValue {
  return typeof v === 'object' && v !== null && 'from' in v && 'to' in v;
}

function checkDateInFy(date: string, rule: ValidationRule, ctx: CaseContext, errors: string[], label: string): void {
  const { from, to } = fyDateBounds(ctx.fy);
  if (date < from || date > to) {
    const msg = 'message' in rule && rule.message ? rule.message : `${label} must fall between ${from} and ${to} (the ${ctx.fy} financial year)`;
    errors.push(msg);
  }
}

export function validateAnswer(q: Question, value: unknown, ctx: CaseContext): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rules = q.validation ?? [];

  if (q.type === 'repeater') return { errors, warnings };

  if (value === undefined || value === null) {
    errors.push('An answer is required');
    return { errors, warnings };
  }

  switch (q.type) {
    case 'money': {
      if (!isFiniteNumber(value) || !Number.isInteger(value)) errors.push('Enter a whole number of cents');
      else if (value < 0 && !q.allowNegative) errors.push('Amount cannot be negative');
      break;
    }
    case 'number': {
      if (!isFiniteNumber(value)) errors.push('Enter a number');
      break;
    }
    case 'percent': {
      if (!isFiniteNumber(value)) errors.push('Enter a percentage');
      else if (value < 0 || value > 100) errors.push('Percentage must be between 0 and 100');
      break;
    }
    case 'km': {
      if (!isFiniteNumber(value) || !Number.isInteger(value)) errors.push('Enter a whole number of kilometres');
      else if (value < 0) errors.push('Kilometres cannot be negative');
      break;
    }
    case 'date': {
      if (!isValidIsoDate(value)) errors.push('Enter a valid date (YYYY-MM-DD)');
      else {
        for (const r of rules) if (r.kind === 'inFinancialYear') checkDateInFy(value, r, ctx, errors, 'Date');
      }
      break;
    }
    case 'date_range': {
      if (!isDateRange(value) || !isValidIsoDate(value.from) || !isValidIsoDate(value.to)) {
        errors.push('Enter a valid start and end date (YYYY-MM-DD)');
      } else {
        if (value.from > value.to) errors.push('Start date must be on or before the end date');
        for (const r of rules) {
          if (r.kind === 'inFinancialYear') {
            checkDateInFy(value.from, r, ctx, errors, 'Start date');
            checkDateInFy(value.to, r, ctx, errors, 'End date');
          }
        }
      }
      break;
    }
    case 'yes_no_unsure': {
      const allowed = q.options && q.options.length > 0 ? q.options.map((o) => o.value) : ['yes', 'no', 'not_sure'];
      if (typeof value !== 'string' || !allowed.includes(value)) errors.push('Choose Yes, No or Not sure');
      break;
    }
    case 'single': {
      if (typeof value !== 'string') errors.push('Choose one option');
      else if (q.options && !q.options.some((o) => o.value === value)) errors.push(`"${value}" is not one of the options`);
      break;
    }
    case 'multi': {
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
        errors.push('Choose one or more options');
        break;
      }
      const values = value as string[];
      if (values.length === 0) {
        errors.push('Choose at least one option, or "None of these"');
        break;
      }
      const options = q.options ?? [];
      const unknown = options.length > 0 ? values.filter((v) => !options.some((o) => o.value === v)) : [];
      for (const u of unknown) errors.push(`"${u}" is not one of the options`);
      if (new Set(values).size !== values.length) errors.push('An option is ticked more than once');
      const exclusive = values.filter((v) => options.find((o) => o.value === v)?.exclusive);
      if (exclusive.length > 0 && values.length > 1) {
        errors.push(`"${exclusive[0]}" cannot be combined with other options`);
      }
      break;
    }
    case 'text': {
      if (typeof value !== 'string') errors.push('Enter text');
      break;
    }
  }

  // Generic rules.
  for (const r of rules) {
    switch (r.kind) {
      case 'min':
        if (NUMERIC_TYPES.has(q.type) && isFiniteNumber(value) && value < r.value) {
          errors.push(r.message ?? `Must be at least ${q.type === 'money' ? formatCents(r.value) : r.value}`);
        }
        break;
      case 'max':
        if (NUMERIC_TYPES.has(q.type) && isFiniteNumber(value) && value > r.value) {
          errors.push(r.message ?? `Must be no more than ${q.type === 'money' ? formatCents(r.value) : r.value}`);
        }
        break;
      case 'warnAbove':
        if (NUMERIC_TYPES.has(q.type) && isFiniteNumber(value) && value > r.value) warnings.push(r.message);
        break;
      case 'maxLength':
        if (typeof value === 'string' && value.length > r.value) {
          errors.push(r.message ?? `Must be ${r.value} characters or fewer`);
        }
        break;
      case 'pattern':
        if (typeof value === 'string') {
          let re: RegExp | null = null;
          try {
            re = new RegExp(r.value);
          } catch {
            re = null;
          }
          if (re && !re.test(value)) errors.push(r.message);
        }
        break;
      case 'inFinancialYear':
        // handled per type above
        break;
    }
  }

  return { errors, warnings };
}
