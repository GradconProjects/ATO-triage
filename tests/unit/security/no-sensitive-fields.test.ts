import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Section 12: no field id may contain a tax file number, bank account or full date-of-birth.
 * This test greps the question bank and migrations so CI fails the build if one is added.
 */
const ROOT = path.resolve(__dirname, '../../..');
const FORBIDDEN = [/tfn/i, /bank_account/i, /\bbsb\b/i, /date_of_birth/i, /\bdob\b/i, /tax_file/i];

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|sql)$/.test(entry)) out.push(p);
  }
  return out;
}

describe('no sensitive identifiers', () => {
  it('question ids, DB columns and form fields never mention TFN, bank accounts or date of birth', () => {
    const files = [...walk(path.join(ROOT, 'src/questions')), ...walk(path.join(ROOT, 'supabase/migrations')), ...walk(path.join(ROOT, 'app'))];
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      // Look at identifier-like tokens only (ids, column names, input names), not prose.
      const idTokens = text.match(/(?:id:\s*['"`]|name=["']|create table |^\s+)[a-z0-9_.]+/gim) ?? [];
      for (const tok of idTokens) {
        if (/tfn_?withheld/i.test(tok)) continue; // an amount withheld under TFN rules, not the identifier
        if (FORBIDDEN.some((re) => re.test(tok))) offenders.push(`${path.relative(ROOT, f)}: ${tok.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the service-role key is never referenced from a NEXT_PUBLIC_ variable or client component', () => {
    const files = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))];
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      if (/NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/.test(text)) offenders.push(path.relative(ROOT, f));
      if (/SUPABASE_SERVICE_ROLE_KEY/.test(text) && /^['"]use client['"]/m.test(text)) offenders.push(path.relative(ROOT, f));
    }
    expect(offenders).toEqual([]);
  });
});
