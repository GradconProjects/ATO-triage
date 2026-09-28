/**
 * Team sign-ins. Each seed user becomes a real Supabase Auth user the first time it signs in
 * (see ensureSeedUser in ./index.ts), so row-level security still isolates their data and the
 * admin can retrieve their reports.
 *
 * Seed users are read from the TEAM_SEED_USERS environment variable so that sign-in codes never
 * live in the repository. Format, comma separated:
 *   username:code:Display Name:restriction_level
 * e.g. TEAM_SEED_USERS="jacintha:1234:Jacintha:standard,chinenye:5678:Chinenye:standard"
 *
 * The code is combined with APP_PIN_PEPPER on the server before it is used as the auth
 * password, so the short code never reaches Supabase in the clear.
 */
export interface SeedUser {
  username: string;
  displayName: string;
  code: string;
  restrictionLevel: RestrictionLevel;
}

export type RestrictionLevel = 'none' | 'full' | 'standard' | 'restricted' | 'view_only';

export const RESTRICTION_LEVEL_VALUES: RestrictionLevel[] = ['none', 'full', 'standard', 'restricted', 'view_only'];

export const RESTRICTION_LEVELS: { value: RestrictionLevel; label: string; description: string }[] = [
  { value: 'none', label: 'No restriction (admin)', description: 'Everything, including managing users and retrieving every report.' },
  { value: 'full', label: 'Full', description: 'Create and delete profiles and tax years, run interviews, generate draft and final reports.' },
  { value: 'standard', label: 'Standard', description: 'Create profiles and tax years, run interviews, generate draft reports. Cannot mark a report Final or delete profiles.' },
  { value: 'restricted', label: 'Restricted', description: 'Answer interviews on existing profiles only. Cannot add profiles, delete anything or generate reports.' },
  { value: 'view_only', label: 'View only', description: 'Read existing answers, estimates and reports. Cannot change anything.' },
];

export function parseSeedUsers(raw: string | undefined): SeedUser[] {
  if (!raw) return [];
  const out: SeedUser[] = [];
  for (const entry of raw.split(',')) {
    const parts = entry.split(':').map((p) => p.trim());
    const [username, code, displayName, level] = parts;
    if (!username || !code) continue;
    const restrictionLevel = RESTRICTION_LEVEL_VALUES.includes(level as RestrictionLevel) ? (level as RestrictionLevel) : 'standard';
    out.push({ username: username.toLowerCase(), code, displayName: displayName || username, restrictionLevel });
  }
  return out;
}

export function seedUsers(): SeedUser[] {
  return parseSeedUsers(process.env.TEAM_SEED_USERS);
}

/** Accounts with no restriction. The owner's email is the default; add more via ADMIN_EMAILS (comma separated). */
export const DEFAULT_ADMIN_EMAILS = ['ipaliboboma@gmail.com'];

export function adminEmails(): string[] {
  const extra = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return [...new Set([...DEFAULT_ADMIN_EMAILS, ...extra])];
}

/** Team users sign in with a username and code; internally they are auth users with this email. */
export const TEAM_EMAIL_DOMAIN = 'team.tax-intake.local';

export function teamEmail(username: string): string {
  return `${username.toLowerCase()}@${TEAM_EMAIL_DOMAIN}`;
}

export function isTeamEmail(email: string | undefined | null): boolean {
  return Boolean(email && email.toLowerCase().endsWith(`@${TEAM_EMAIL_DOMAIN}`));
}
