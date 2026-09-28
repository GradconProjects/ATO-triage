import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/src/lib/supabase/server';
import { createAdminClient } from '@/src/lib/supabase/admin';
import { adminEmails, isTeamEmail, seedUsers, teamEmail, type RestrictionLevel } from './seed-users';

export type { RestrictionLevel } from './seed-users';

export interface AppUserRow {
  id: string;
  username: string;
  display_name: string;
  role: 'admin' | 'member';
  restriction_level: RestrictionLevel;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Permissions {
  createProfile: boolean;
  editProfile: boolean;
  deleteProfile: boolean;
  createCase: boolean;
  deleteCase: boolean;
  editAnswers: boolean;
  generateReport: boolean;
  finaliseReport: boolean;
  manageUsers: boolean;
  viewAllReports: boolean;
}

export interface Access {
  user: User;
  supabase: SupabaseClient;
  isAdmin: boolean;
  level: RestrictionLevel;
  displayName: string;
  username: string | null;
  can: Permissions;
}

export function permissionsFor(level: RestrictionLevel): Permissions {
  switch (level) {
    case 'none':
      return { createProfile: true, editProfile: true, deleteProfile: true, createCase: true, deleteCase: true, editAnswers: true, generateReport: true, finaliseReport: true, manageUsers: true, viewAllReports: true };
    case 'full':
      return { createProfile: true, editProfile: true, deleteProfile: true, createCase: true, deleteCase: true, editAnswers: true, generateReport: true, finaliseReport: true, manageUsers: false, viewAllReports: false };
    case 'standard':
      return { createProfile: true, editProfile: true, deleteProfile: false, createCase: true, deleteCase: true, editAnswers: true, generateReport: true, finaliseReport: false, manageUsers: false, viewAllReports: false };
    case 'restricted':
      return { createProfile: false, editProfile: false, deleteProfile: false, createCase: false, deleteCase: false, editAnswers: true, generateReport: false, finaliseReport: false, manageUsers: false, viewAllReports: false };
    case 'view_only':
    default:
      return { createProfile: false, editProfile: false, deleteProfile: false, createCase: false, deleteCase: false, editAnswers: false, generateReport: false, finaliseReport: false, manageUsers: false, viewAllReports: false };
  }
}

/** The auth password for a team code: code + server pepper, hashed so it meets Supabase's length rules. */
export function codeToPassword(username: string, code: string): string {
  const pepper = process.env.APP_PIN_PEPPER || 'change-me-in-production-pepper';
  return createHash('sha256').update(`${username.toLowerCase()}:${code}:${pepper}`).digest('hex');
}

export function isAdminEmail(email: string | undefined | null): boolean {
  return Boolean(email && adminEmails().includes(email.toLowerCase()));
}

/** Resolve who is signed in and what they may do. Throws 'UNAUTHENTICATED' when nobody is. */
export async function getAccess(): Promise<Access> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return accessForUser(supabase, user);
}

export async function accessForUser(supabase: SupabaseClient, user: User): Promise<Access> {
  const admin = isAdminEmail(user.email);
  const row = await supabase.from('app_users').select('*').eq('id', user.id).maybeSingle();
  const appUser = (row.data as AppUserRow | null) ?? null;
  const level: RestrictionLevel = admin ? 'none' : (appUser?.restriction_level ?? (isTeamEmail(user.email) ? 'standard' : 'full'));
  return {
    user,
    supabase,
    isAdmin: admin,
    level,
    displayName: appUser?.display_name ?? (admin ? 'Admin' : (user.email ?? 'User')),
    username: appUser?.username ?? null,
    can: permissionsFor(level),
  };
}

export async function requirePermission(key: keyof Permissions): Promise<Access> {
  const access = await getAccess();
  if (!access.can[key]) throw new Error(`FORBIDDEN:${key}`);
  return access;
}

/**
 * Make sure a seed team user exists as an auth user with the expected password and an
 * app_users row. Idempotent; uses the service role. Returns false when the user is not a seed
 * user or the service role key is not configured.
 */
export async function ensureSeedUser(username: string): Promise<boolean> {
  const seed = seedUsers().find((s) => s.username === username.toLowerCase());
  if (!seed) return false;
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return false;
  }
  const email = teamEmail(seed.username);
  const password = codeToPassword(seed.username, seed.code);
  const existing = await admin.from('app_users').select('id').eq('username', seed.username).maybeSingle();
  if (existing.data?.id) {
    // Keep the auth password in step with the configured code (lets the admin rotate it via env).
    await admin.auth.admin.updateUserById(existing.data.id as string, { password });
    return true;
  }
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username: seed.username, display_name: seed.displayName } });
  let userId = created.data.user?.id;
  if (!userId) {
    // The auth user may already exist from an earlier partial run; look it up and reset the password.
    const list = await admin.auth.admin.listUsers({ perPage: 1000 });
    const found = list.data.users.find((u) => u.email?.toLowerCase() === email);
    if (!found) return false;
    userId = found.id;
    await admin.auth.admin.updateUserById(userId, { password });
  }
  await admin.from('app_users').upsert({ id: userId, username: seed.username, display_name: seed.displayName, role: 'member', restriction_level: seed.restrictionLevel });
  return true;
}
