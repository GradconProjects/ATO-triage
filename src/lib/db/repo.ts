import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnswerRecord, RepeaterItem } from '@/src/engine/types';
import type { AnswerRow, CaseRow, EstimateRow, FlagRow, ProfileRow, RepeaterItemRow, ReportRow } from './types';

type Db = SupabaseClient;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  if (res.data === null) throw new Error('Not found');
  return res.data;
}

// ---------- audit ----------
export async function audit(db: Db, ownerId: string, entity: string, entityId: string | null, action: string, detail?: unknown) {
  await db.from('audit_log').insert({ owner_id: ownerId, entity, entity_id: entityId, action, detail: detail ?? null });
}

// ---------- profiles ----------
export async function listProfiles(db: Db): Promise<ProfileRow[]> {
  return unwrap(await db.from('profiles').select('*').order('created_at', { ascending: true }));
}

export async function getProfile(db: Db, id: string): Promise<ProfileRow | null> {
  const res = await db.from('profiles').select('*').eq('id', id).maybeSingle();
  if (res.error) throw new Error(res.error.message);
  return res.data as ProfileRow | null;
}

export async function createProfile(
  db: Db,
  ownerId: string,
  input: { display_name: string; relationship: ProfileRow['relationship']; birth_year: number | null; occupations: string[] },
): Promise<ProfileRow> {
  const row = unwrap(await db.from('profiles').insert({ ...input, owner_id: ownerId }).select('*').single()) as ProfileRow;
  await audit(db, ownerId, 'profile', row.id, 'create', { display_name: input.display_name });
  return row;
}

export async function updateProfile(
  db: Db,
  ownerId: string,
  id: string,
  input: Partial<{ display_name: string; relationship: ProfileRow['relationship']; birth_year: number | null; occupations: string[] }>,
): Promise<ProfileRow> {
  const row = unwrap(await db.from('profiles').update(input).eq('id', id).select('*').single()) as ProfileRow;
  await audit(db, ownerId, 'profile', id, 'update', input);
  return row;
}

export async function deleteProfile(db: Db, ownerId: string, id: string): Promise<void> {
  const res = await db.from('profiles').delete().eq('id', id);
  if (res.error) throw new Error(res.error.message);
  await audit(db, ownerId, 'profile', id, 'delete');
}

// ---------- cases ----------
export async function listCasesForProfile(db: Db, profileId: string): Promise<CaseRow[]> {
  return unwrap(await db.from('fy_cases').select('*').eq('profile_id', profileId).order('financial_year', { ascending: false }));
}

export async function listCases(db: Db): Promise<CaseRow[]> {
  return unwrap(await db.from('fy_cases').select('*').order('created_at', { ascending: false }));
}

export async function getCase(db: Db, id: string): Promise<CaseRow | null> {
  const res = await db.from('fy_cases').select('*').eq('id', id).maybeSingle();
  if (res.error) throw new Error(res.error.message);
  return res.data as CaseRow | null;
}

export async function createCase(
  db: Db,
  ownerId: string,
  input: { profile_id: string; financial_year: string; purpose: CaseRow['purpose'] },
): Promise<CaseRow> {
  const row = unwrap(await db.from('fy_cases').insert({ ...input, owner_id: ownerId }).select('*').single()) as CaseRow;
  await audit(db, ownerId, 'fy_case', row.id, 'create', input);
  return row;
}

export async function updateCaseStatus(db: Db, ownerId: string, id: string, status: CaseRow['status'], ruleSetVersion?: string) {
  const patch: Partial<CaseRow> = { status };
  if (ruleSetVersion) patch.rule_set_version = ruleSetVersion;
  unwrap(await db.from('fy_cases').update(patch).eq('id', id).select('id').single());
  await audit(db, ownerId, 'fy_case', id, 'status', { status });
}

export async function deleteCase(db: Db, ownerId: string, id: string) {
  const res = await db.from('fy_cases').delete().eq('id', id);
  if (res.error) throw new Error(res.error.message);
  await audit(db, ownerId, 'fy_case', id, 'delete');
}

// ---------- repeater items ----------
export async function listItems(db: Db, caseId: string): Promise<RepeaterItem[]> {
  const rows = unwrap(await db.from('repeater_items').select('*').eq('case_id', caseId).order('sort_order')) as RepeaterItemRow[];
  return rows.map((r) => ({ id: r.id, groupId: r.group_id, label: r.label, sortOrder: r.sort_order }));
}

export async function createItem(db: Db, ownerId: string, caseId: string, groupId: string, sortOrder: number): Promise<RepeaterItem> {
  const row = unwrap(
    await db.from('repeater_items').insert({ case_id: caseId, owner_id: ownerId, group_id: groupId, sort_order: sortOrder }).select('*').single(),
  ) as RepeaterItemRow;
  await audit(db, ownerId, 'repeater_item', row.id, 'create', { groupId });
  return { id: row.id, groupId: row.group_id, label: row.label, sortOrder: row.sort_order };
}

export async function deleteItem(db: Db, ownerId: string, itemId: string) {
  const res = await db.from('repeater_items').delete().eq('id', itemId);
  if (res.error) throw new Error(res.error.message);
  await audit(db, ownerId, 'repeater_item', itemId, 'delete');
}

// ---------- answers ----------
export function rowToRecord(r: AnswerRow): AnswerRecord {
  return {
    questionId: r.question_id,
    repeaterItemId: r.repeater_item_id,
    value: r.value,
    state: r.state,
    source: r.source,
    version: r.version,
  };
}

/** All answer rows (every version) for a case, oldest first. */
export async function listAnswerRows(db: Db, caseId: string): Promise<AnswerRow[]> {
  return unwrap(await db.from('answers').select('*').eq('case_id', caseId).order('version', { ascending: true })) as AnswerRow[];
}

export async function listAnswers(db: Db, caseId: string): Promise<AnswerRecord[]> {
  return (await listAnswerRows(db, caseId)).map(rowToRecord);
}

/** Append new versions. Versions are computed from the latest existing row for each key. */
export async function appendAnswers(db: Db, ownerId: string, caseId: string, records: Omit<AnswerRecord, 'version'>[]): Promise<AnswerRecord[]> {
  if (records.length === 0) return [];
  const existing = await listAnswerRows(db, caseId);
  const latest = new Map<string, number>();
  for (const r of existing) {
    const key = `${r.question_id}@${r.repeater_item_id ?? ''}`;
    latest.set(key, Math.max(latest.get(key) ?? 0, r.version));
  }
  const rows = records.map((rec) => {
    const key = `${rec.questionId}@${rec.repeaterItemId ?? ''}`;
    const version = (latest.get(key) ?? 0) + 1;
    latest.set(key, version);
    return {
      case_id: caseId,
      owner_id: ownerId,
      question_id: rec.questionId,
      repeater_item_id: rec.repeaterItemId,
      value: rec.value ?? null,
      state: rec.state,
      source: rec.source,
      version,
    };
  });
  const inserted = unwrap(await db.from('answers').insert(rows).select('*')) as AnswerRow[];
  await audit(db, ownerId, 'answers', caseId, 'append', { count: rows.length, questionIds: rows.map((r) => r.question_id) });
  return inserted.map(rowToRecord);
}

// ---------- estimates / flags ----------
export async function saveEstimate(
  db: Db,
  ownerId: string,
  caseId: string,
  input: { rule_set_version: string; result: unknown; confidence: EstimateRow['confidence']; completeness_pct: number },
  flags: Omit<FlagRow, 'id' | 'case_id' | 'owner_id' | 'estimate_id'>[],
): Promise<EstimateRow> {
  // Regenerate: drop previous runs for this case.
  await db.from('flags').delete().eq('case_id', caseId);
  await db.from('estimates').delete().eq('case_id', caseId);
  const est = unwrap(await db.from('estimates').insert({ ...input, case_id: caseId, owner_id: ownerId }).select('*').single()) as EstimateRow;
  if (flags.length) {
    const res = await db.from('flags').insert(flags.map((f) => ({ ...f, case_id: caseId, owner_id: ownerId, estimate_id: est.id })));
    if (res.error) throw new Error(res.error.message);
  }
  await audit(db, ownerId, 'estimate', est.id, 'create', { rule_set_version: input.rule_set_version });
  return est;
}

export async function latestEstimate(db: Db, caseId: string): Promise<EstimateRow | null> {
  const res = await db.from('estimates').select('*').eq('case_id', caseId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (res.error) throw new Error(res.error.message);
  return res.data as EstimateRow | null;
}

export async function listFlags(db: Db, caseId: string): Promise<FlagRow[]> {
  return unwrap(await db.from('flags').select('*').eq('case_id', caseId)) as FlagRow[];
}

// ---------- reports ----------
export async function createReport(db: Db, ownerId: string, caseId: string, snapshot: unknown, isFinal: boolean): Promise<ReportRow> {
  const row = unwrap(
    await db.from('reports').insert({ case_id: caseId, owner_id: ownerId, snapshot, is_final: isFinal }).select('*').single(),
  ) as ReportRow;
  await audit(db, ownerId, 'report', row.id, 'create', { is_final: isFinal });
  return row;
}

export async function getReport(db: Db, id: string): Promise<ReportRow | null> {
  const res = await db.from('reports').select('*').eq('id', id).maybeSingle();
  if (res.error) throw new Error(res.error.message);
  return res.data as ReportRow | null;
}

export async function listReports(db: Db, caseId: string): Promise<ReportRow[]> {
  return unwrap(await db.from('reports').select('*').eq('case_id', caseId).order('created_at', { ascending: false })) as ReportRow[];
}
