import 'server-only';
import { createAdminClient } from '@/src/lib/supabase/admin';
import { codeToPassword, type AppUserRow } from './index';
import { teamEmail, type RestrictionLevel } from './seed-users';

export async function listTeamUsers(): Promise<AppUserRow[]> {
  const admin = createAdminClient();
  const res = await admin.from('app_users').select('*').order('created_at');
  if (res.error) throw new Error(res.error.message);
  return res.data as AppUserRow[];
}

export async function createTeamUser(input: { username: string; displayName: string; code: string; restrictionLevel: RestrictionLevel; createdBy: string }): Promise<AppUserRow> {
  const admin = createAdminClient();
  const username = input.username.trim().toLowerCase();
  if (!/^[a-z0-9_.-]{2,40}$/.test(username)) throw new Error('Username must be 2-40 letters, numbers, dots, dashes or underscores');
  if (!/^\d{4,8}$/.test(input.code)) throw new Error('Code must be 4 to 8 digits');
  const created = await admin.auth.admin.createUser({
    email: teamEmail(username),
    password: codeToPassword(username, input.code),
    email_confirm: true,
    user_metadata: { username, display_name: input.displayName },
  });
  if (created.error || !created.data.user) throw new Error(created.error?.message ?? 'Could not create user');
  const row = await admin
    .from('app_users')
    .insert({ id: created.data.user.id, username, display_name: input.displayName.trim() || username, role: 'member', restriction_level: input.restrictionLevel, created_by: input.createdBy })
    .select('*')
    .single();
  if (row.error) throw new Error(row.error.message);
  await admin.from('audit_log').insert({ owner_id: input.createdBy, entity: 'app_user', entity_id: created.data.user.id, action: 'create', detail: { username, restrictionLevel: input.restrictionLevel } });
  return row.data as AppUserRow;
}

export async function setRestrictionLevel(userId: string, level: RestrictionLevel, actorId: string): Promise<void> {
  const admin = createAdminClient();
  const res = await admin.from('app_users').update({ restriction_level: level }).eq('id', userId);
  if (res.error) throw new Error(res.error.message);
  await admin.from('audit_log').insert({ owner_id: actorId, entity: 'app_user', entity_id: userId, action: 'restriction', detail: { level } });
}

export async function resetTeamCode(userId: string, code: string, actorId: string): Promise<void> {
  if (!/^\d{4,8}$/.test(code)) throw new Error('Code must be 4 to 8 digits');
  const admin = createAdminClient();
  const row = await admin.from('app_users').select('username').eq('id', userId).single();
  if (row.error) throw new Error(row.error.message);
  const upd = await admin.auth.admin.updateUserById(userId, { password: codeToPassword(row.data.username as string, code) });
  if (upd.error) throw new Error(upd.error.message);
  await admin.from('audit_log').insert({ owner_id: actorId, entity: 'app_user', entity_id: userId, action: 'reset_code' });
}

export async function deleteTeamUser(userId: string, actorId: string): Promise<void> {
  const admin = createAdminClient();
  const res = await admin.auth.admin.deleteUser(userId); // cascades to app_users, profiles, cases, reports
  if (res.error) throw new Error(res.error.message);
  await admin.from('audit_log').insert({ owner_id: actorId, entity: 'app_user', entity_id: userId, action: 'delete' });
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

/** Every report across every user (service role), newest first. */
export async function listAllReports(): Promise<AdminReportRow[]> {
  const admin = createAdminClient();
  const reports = await admin.from('reports').select('id, case_id, owner_id, pdf_path, is_final, created_at, snapshot').order('created_at', { ascending: false }).limit(500);
  if (reports.error) throw new Error(reports.error.message);
  const caseIds = [...new Set(reports.data.map((r) => r.case_id as string))];
  const ownerIds = [...new Set(reports.data.map((r) => r.owner_id as string))];
  const cases = caseIds.length ? await admin.from('fy_cases').select('id, financial_year, purpose, profile_id').in('id', caseIds) : { data: [] as Record<string, unknown>[] };
  const users = ownerIds.length ? await admin.from('app_users').select('id, username, display_name').in('id', ownerIds) : { data: [] as Record<string, unknown>[] };
  const profileIds = [...new Set((cases.data ?? []).map((c) => c.profile_id as string))];
  const profiles = profileIds.length ? await admin.from('profiles').select('id, display_name').in('id', profileIds) : { data: [] as Record<string, unknown>[] };
  const authUsers = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map(authUsers.data.users.map((u) => [u.id, u.email ?? '']));
  const caseById = new Map((cases.data ?? []).map((c) => [c.id as string, c]));
  const profileById = new Map((profiles.data ?? []).map((p) => [p.id as string, p.display_name as string]));
  const userById = new Map((users.data ?? []).map((u) => [u.id as string, u]));
  return reports.data.map((r) => {
    const c = caseById.get(r.case_id as string);
    const u = userById.get(r.owner_id as string);
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
      owner_label: u ? `${u.display_name as string} (${u.username as string})` : emailById.get(r.owner_id as string) || (r.owner_id as string),
      rule_set_version: snap?.ruleSetVersion ?? null,
      result_cents: snap?.estimate?.totals?.resultCents ?? null,
      confidence: snap?.intelligence?.confidence?.level ?? null,
    };
  });
}
