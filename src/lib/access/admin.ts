import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { codeToPassword, type AppUserRow } from './index';
import type { RestrictionLevel } from './seed-users';

/**
 * Admin operations. They run as the signed-in admin through row-level security policies and
 * SECURITY DEFINER functions (migration 0006) that re-check admin rights in the database, so no
 * service-role key is needed.
 */

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function listTeamUsers(db: SupabaseClient): Promise<AppUserRow[]> {
  const res = await db.from('app_users').select('*').order('created_at');
  fail(res.error);
  return (res.data ?? []) as AppUserRow[];
}

export async function createTeamUser(
  db: SupabaseClient,
  input: { username: string; displayName: string; code: string; restrictionLevel: RestrictionLevel },
): Promise<{ username: string; displayName: string }> {
  const username = input.username.trim().toLowerCase();
  if (!/^[a-z0-9_.-]{2,40}$/.test(username)) throw new Error('Username must be 2-40 letters, numbers, dots, dashes or underscores');
  if (!/^\d{4,8}$/.test(input.code)) throw new Error('Code must be 4 to 8 digits');
  const res = await db.rpc('admin_create_team_user', {
    p_username: username,
    p_display: input.displayName.trim() || username,
    p_password: codeToPassword(username, input.code),
    p_level: input.restrictionLevel,
  });
  fail(res.error);
  return { username, displayName: input.displayName.trim() || username };
}

export async function setRestrictionLevel(db: SupabaseClient, userId: string, level: RestrictionLevel): Promise<void> {
  fail((await db.rpc('admin_set_restriction', { p_user: userId, p_level: level })).error);
}

export async function resetTeamCode(db: SupabaseClient, userId: string, code: string): Promise<void> {
  if (!/^\d{4,8}$/.test(code)) throw new Error('Code must be 4 to 8 digits');
  const row = await db.from('app_users').select('username').eq('id', userId).single();
  fail(row.error);
  fail((await db.rpc('admin_reset_password', { p_user: userId, p_password: codeToPassword(row.data!.username as string, code) })).error);
}

export async function deleteTeamUser(db: SupabaseClient, userId: string): Promise<void> {
  fail((await db.rpc('admin_delete_team_user', { p_user: userId })).error);
}

export interface AdminReportRow {
  id: string;
  case_id: string;
  owner_id: string;
  pdf_path: string | null;
  is_final: boolean;
  created_at: string;
  financial_year: string;
  purpose: string;
  profile_name: string;
  owner_label: string;
  rule_set_version: string | null;
  result_cents: number | null;
  confidence: string | null;
}

/** Every report across every user (admin read policy), newest first. */
export async function listAllReports(db: SupabaseClient): Promise<AdminReportRow[]> {
  const reports = await db.from('reports').select('id, case_id, owner_id, pdf_path, is_final, created_at, snapshot').order('created_at', { ascending: false }).limit(500);
  fail(reports.error);
  const rows = reports.data ?? [];
  const caseIds = [...new Set(rows.map((r) => r.case_id as string))];
  const cases = caseIds.length ? await db.from('fy_cases').select('id, financial_year, purpose, profile_id').in('id', caseIds) : { data: [] as Record<string, unknown>[] };
  const profileIds = [...new Set((cases.data ?? []).map((c) => c.profile_id as string))];
  const profiles = profileIds.length ? await db.from('profiles').select('id, display_name').in('id', profileIds) : { data: [] as Record<string, unknown>[] };
  const labels = await db.rpc('admin_user_labels');
  const labelById = new Map(((labels.data ?? []) as { id: string; label: string }[]).map((l) => [l.id, l.label]));
  const caseById = new Map((cases.data ?? []).map((c) => [c.id as string, c]));
  const profileById = new Map((profiles.data ?? []).map((p) => [p.id as string, p.display_name as string]));
  return rows.map((r) => {
    const c = caseById.get(r.case_id as string);
    const snap = r.snapshot as { ruleSetVersion?: string; estimate?: { totals?: { resultCents?: number } }; intelligence?: { confidence?: { level?: string } } } | null;
    return {
      id: r.id as string,
      case_id: r.case_id as string,
      owner_id: r.owner_id as string,
      pdf_path: (r.pdf_path as string | null) ?? null,
      is_final: Boolean(r.is_final),
      created_at: r.created_at as string,
      financial_year: (c?.financial_year as string) ?? '—',
      purpose: (c?.purpose as string) ?? '—',
      profile_name: c ? (profileById.get(c.profile_id as string) ?? '—') : '—',
      owner_label: labelById.get(r.owner_id as string) ?? (r.owner_id as string),
      rule_set_version: snap?.ruleSetVersion ?? null,
      result_cents: snap?.estimate?.totals?.resultCents ?? null,
      confidence: snap?.intelligence?.confidence?.level ?? null,
    };
  });
}
