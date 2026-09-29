import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { QUESTIONS_BY_ID } from '@/src/questions';
import { MODULE_LABELS, MODULE_ORDER, type ModuleId } from '@/src/engine/types';
import { displayAnswerValue } from '@/src/report/format';

/**
 * Read-only views over every user's data for the admin. All queries run as the signed-in admin
 * through the admin row-level security policies (migrations 0006 and 0008).
 */

export interface ActivityRow {
  at: string;
  userId: string;
  userLabel: string;
  profileName: string;
  caseId: string;
  fy: string;
  module: string;
  prompt: string;
  value: string;
  state: string;
}

export interface UserSummary {
  id: string;
  label: string;
  username: string | null;
  level: string | null;
  profiles: number;
  cases: number;
  answers: number;
  lastActivity: string | null;
}

async function labels(db: SupabaseClient): Promise<Map<string, string>> {
  const res = await db.rpc('admin_user_labels');
  return new Map(((res.data ?? []) as { id: string; label: string }[]).map((l) => [l.id, l.label]));
}

function describe(questionId: string, value: unknown, state: string) {
  const q = QUESTIONS_BY_ID.get(questionId);
  const shown =
    state === 'not_sure' ? 'Not sure' : state === 'skipped' ? 'Skipped' : state === 'not_applicable_by_rule' ? 'No longer used' : displayAnswerValue(q, value);
  return {
    module: q ? MODULE_LABELS[q.module] : 'Other',
    prompt: q?.prompt ?? questionId,
    value: shown,
  };
}

/** Latest answers across every user, newest first. */
export async function recentActivity(db: SupabaseClient, limit = 40): Promise<ActivityRow[]> {
  const res = await db
    .from('answers')
    .select('question_id, value, state, created_at, owner_id, case_id')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (res.error) throw new Error(res.error.message);
  const rows = res.data ?? [];
  const caseIds = [...new Set(rows.map((r) => r.case_id as string))];
  const cases = caseIds.length ? await db.from('fy_cases').select('id, financial_year, profile_id').in('id', caseIds) : { data: [] as Record<string, unknown>[] };
  const profileIds = [...new Set((cases.data ?? []).map((c) => c.profile_id as string))];
  const profiles = profileIds.length ? await db.from('profiles').select('id, display_name').in('id', profileIds) : { data: [] as Record<string, unknown>[] };
  const caseById = new Map((cases.data ?? []).map((c) => [c.id as string, c]));
  const profileById = new Map((profiles.data ?? []).map((p) => [p.id as string, p.display_name as string]));
  const who = await labels(db);
  return rows.map((r) => {
    const c = caseById.get(r.case_id as string);
    const d = describe(r.question_id as string, r.value, r.state as string);
    return {
      at: r.created_at as string,
      userId: r.owner_id as string,
      userLabel: who.get(r.owner_id as string) ?? 'Unknown user',
      profileName: c ? (profileById.get(c.profile_id as string) ?? '—') : '—',
      caseId: r.case_id as string,
      fy: (c?.financial_year as string) ?? '—',
      state: r.state as string,
      ...d,
    };
  });
}

/** One row per user with counts and last activity. */
export async function userSummaries(db: SupabaseClient): Promise<UserSummary[]> {
  const [users, profiles, cases, answers, who] = await Promise.all([
    db.from('app_users').select('id, username, restriction_level'),
    db.from('profiles').select('owner_id'),
    db.from('fy_cases').select('owner_id'),
    db.from('answers').select('owner_id, created_at').order('created_at', { ascending: false }).limit(5000),
    labels(db),
  ]);
  const count = (rows: { owner_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.owner_id === id).length;
  const ids = new Set<string>([...(users.data ?? []).map((u) => u.id as string), ...(profiles.data ?? []).map((p) => p.owner_id as string)]);
  return [...ids]
    .map((id) => {
      const u = (users.data ?? []).find((x) => x.id === id);
      const mine = (answers.data ?? []).filter((a) => a.owner_id === id);
      return {
        id,
        label: who.get(id) ?? id,
        username: (u?.username as string) ?? null,
        level: (u?.restriction_level as string) ?? null,
        profiles: count(profiles.data as { owner_id: string }[], id),
        cases: count(cases.data as { owner_id: string }[], id),
        answers: mine.length,
        lastActivity: (mine[0]?.created_at as string) ?? null,
      };
    })
    .sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''));
}

export interface UserDetail {
  label: string;
  profiles: { id: string; name: string; occupations: string[]; cases: { id: string; fy: string; purpose: string; status: string; answers: number; lastActivity: string | null; resultCents: number | null }[] }[];
}

export async function userDetail(db: SupabaseClient, userId: string): Promise<UserDetail> {
  const [profiles, cases, answers, estimates, who] = await Promise.all([
    db.from('profiles').select('id, display_name, occupations').eq('owner_id', userId).order('created_at'),
    db.from('fy_cases').select('id, profile_id, financial_year, purpose, status').eq('owner_id', userId),
    db.from('answers').select('case_id, created_at').eq('owner_id', userId).order('created_at', { ascending: false }).limit(5000),
    db.from('estimates').select('case_id, result').eq('owner_id', userId),
    labels(db),
  ]);
  return {
    label: who.get(userId) ?? userId,
    profiles: (profiles.data ?? []).map((p) => ({
      id: p.id as string,
      name: p.display_name as string,
      occupations: (p.occupations as string[]) ?? [],
      cases: (cases.data ?? [])
        .filter((c) => c.profile_id === p.id)
        .map((c) => {
          const mine = (answers.data ?? []).filter((a) => a.case_id === c.id);
          const est = (estimates.data ?? []).find((e) => e.case_id === c.id);
          return {
            id: c.id as string,
            fy: c.financial_year as string,
            purpose: c.purpose as string,
            status: c.status as string,
            answers: mine.length,
            lastActivity: (mine[0]?.created_at as string) ?? null,
            resultCents: ((est?.result as { totals?: { resultCents?: number } } | null)?.totals?.resultCents as number | undefined) ?? null,
          };
        }),
    })),
  };
}

export interface CaseLive {
  userLabel: string;
  ownerId: string;
  profileName: string;
  fy: string;
  status: string;
  resultCents: number | null;
  confidence: string | null;
  updatedAt: string | null;
  modules: { module: string; label: string; answers: { key: string; prompt: string; value: string; state: string; at: string; item: string | null }[] }[];
}

/** Latest version of every answer in a case, grouped by interview section. */
export async function caseLive(db: SupabaseClient, caseId: string): Promise<CaseLive | null> {
  const c = await db.from('fy_cases').select('id, owner_id, profile_id, financial_year, status').eq('id', caseId).maybeSingle();
  if (c.error || !c.data) return null;
  const [profile, answers, items, estimate, who] = await Promise.all([
    db.from('profiles').select('display_name').eq('id', c.data.profile_id as string).maybeSingle(),
    db.from('answers').select('question_id, repeater_item_id, value, state, version, created_at').eq('case_id', caseId).order('version', { ascending: true }),
    db.from('repeater_items').select('id, group_id, sort_order').eq('case_id', caseId),
    db.from('estimates').select('result, confidence, created_at').eq('case_id', caseId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    labels(db),
  ]);
  const latest = new Map<string, Record<string, unknown>>();
  for (const a of answers.data ?? []) latest.set(`${a.question_id}@${a.repeater_item_id ?? ''}`, a);
  const itemName = new Map(
    (items.data ?? []).map((i) => [i.id as string, `${String(i.group_id).replace(/_/g, ' ')} ${(i.sort_order as number) + 1}`]),
  );
  const groups = new Map<string, CaseLive['modules'][number]['answers']>();
  let updatedAt: string | null = null;
  for (const [key, a] of latest) {
    const q = QUESTIONS_BY_ID.get(a.question_id as string);
    const mod = (q?.module ?? 'core') as string;
    const d = describe(a.question_id as string, a.value, a.state as string);
    const list = groups.get(mod) ?? [];
    list.push({ key, prompt: d.prompt, value: d.value, state: a.state as string, at: a.created_at as string, item: a.repeater_item_id ? (itemName.get(a.repeater_item_id as string) ?? 'item') : null });
    groups.set(mod, list);
    if (!updatedAt || (a.created_at as string) > updatedAt) updatedAt = a.created_at as string;
  }
  const modules = [...groups.entries()]
    .sort((x, y) => MODULE_ORDER.indexOf(x[0] as ModuleId) - MODULE_ORDER.indexOf(y[0] as ModuleId))
    .map(([mod, list]) => ({ module: mod, label: MODULE_LABELS[mod as ModuleId] ?? mod, answers: list }));
  const res = (estimate.data?.result as { totals?: { resultCents?: number } } | null)?.totals?.resultCents;
  return {
    userLabel: who.get(c.data.owner_id as string) ?? 'Unknown user',
    ownerId: c.data.owner_id as string,
    profileName: (profile.data?.display_name as string) ?? '—',
    fy: c.data.financial_year as string,
    status: c.data.status as string,
    resultCents: typeof res === 'number' ? res : null,
    confidence: (estimate.data?.confidence as string) ?? null,
    updatedAt,
    modules,
  };
}
