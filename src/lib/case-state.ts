import type { SupabaseClient } from '@supabase/supabase-js';
import { AnswerView } from '@/src/engine/answers';
import { activeTagSet, computeProgress, hiddenAnswerUpdates, visibleKeySet, visibleQuestions, type Progress, type VisibleQuestion } from '@/src/engine';
import type { AnswerRecord, CaseContext, FY, OccupationTag, RepeaterItem } from '@/src/engine/types';
import { QUESTION_BANK } from '@/src/questions';
import { appendAnswers, getCase, getProfile, listAnswers, listItems } from '@/src/lib/db/repo';
import type { CaseRow, ProfileRow } from '@/src/lib/db/types';

export interface CaseState {
  caseRow: CaseRow;
  profile: ProfileRow;
  ctx: CaseContext;
  answers: AnswerRecord[];
  items: RepeaterItem[];
  view: AnswerView;
  activeTags: Set<OccupationTag>;
  visible: VisibleQuestion[];
  visibleKeys: Set<string>;
  progress: Progress;
  /** PHI elections in linked profiles (same account, same year), for conflict checks. */
  linkedPhi?: { profileName: string; membership: string; election: string | undefined }[];
}

export function buildCaseState(caseRow: CaseRow, profile: ProfileRow, answers: AnswerRecord[], items: RepeaterItem[]): CaseState {
  const ctx: CaseContext = { fy: caseRow.financial_year as FY, profileOccupations: profile.occupations };
  const view = new AnswerView(answers, items);
  const activeTags = activeTagSet(ctx, view, QUESTION_BANK);
  const visible = visibleQuestions(QUESTION_BANK, view, ctx, activeTags);
  return { caseRow, profile, ctx, answers, items, view, activeTags, visible, visibleKeys: visibleKeySet(visible), progress: computeProgress(visible, view) };
}

/**
 * Load a case with everything the engine needs. Also reconciles hidden answers: any valued
 * answer whose question is no longer visible gets a new `not_applicable_by_rule` version.
 */
export async function loadCaseState(db: SupabaseClient, ownerId: string, caseId: string): Promise<CaseState | null> {
  const caseRow = await getCase(db, caseId);
  if (!caseRow) return null;
  const profile = await getProfile(db, caseRow.profile_id);
  if (!profile) return null;
  let [answers, items] = await Promise.all([listAnswers(db, caseId), listItems(db, caseId)]);
  let state = buildCaseState(caseRow, profile, answers, items);
  const hidden = hiddenAnswerUpdates(QUESTION_BANK, state.view, state.visible);
  if (hidden.length && caseRow.status !== 'final') {
    // Rows always belong to the case owner, even when an admin is the one editing.
    const appended = await appendAnswers(db, caseRow.owner_id, caseId, hidden.map((h) => ({ questionId: h.questionId, repeaterItemId: h.repeaterItemId, value: h.value, state: h.state, source: h.source })));
    answers = [...answers, ...appended];
    items = state.items;
    state = buildCaseState(caseRow, profile, answers, items);
  }
  state.linkedPhi = await loadLinkedPhi(db, caseRow).catch(() => []);
  return state;
}

/** Membership numbers and elections from the account's other profiles for the same year. */
async function loadLinkedPhi(db: SupabaseClient, caseRow: CaseRow): Promise<NonNullable<CaseState['linkedPhi']>> {
  const others = await db.from('fy_cases').select('id, profile_id, profiles(display_name)').eq('owner_id', caseRow.owner_id).eq('financial_year', caseRow.financial_year).neq('id', caseRow.id);
  const rows = (others.data ?? []) as unknown as { id: string; profile_id: string; profiles: { display_name: string } | null }[];
  const sameProfile = rows.filter((r) => r.profile_id !== caseRow.profile_id);
  if (!sameProfile.length) return [];
  const ans = await db.from('answers').select('case_id, question_id, repeater_item_id, value, state, version').in('case_id', sameProfile.map((r) => r.id)).in('question_id', ['phi.policy.membership', 'phi.policy.election']);
  const latest = new Map<string, { case_id: string; question_id: string; repeater_item_id: string | null; value: unknown; state: string; version: number }>();
  for (const r of (ans.data ?? []) as { case_id: string; question_id: string; repeater_item_id: string | null; value: unknown; state: string; version: number }[]) {
    const k = `${r.case_id}|${r.question_id}|${r.repeater_item_id}`;
    if (!latest.has(k) || latest.get(k)!.version < r.version) latest.set(k, r);
  }
  const out: NonNullable<CaseState['linkedPhi']> = [];
  for (const r of latest.values()) {
    if (r.question_id !== 'phi.policy.membership' || r.state !== 'answered' || typeof r.value !== 'string') continue;
    const el = latest.get(`${r.case_id}|phi.policy.election|${r.repeater_item_id}`);
    const name = sameProfile.find((x) => x.id === r.case_id)?.profiles?.display_name ?? 'another profile';
    out.push({ profileName: name, membership: r.value, election: el?.state === 'answered' && typeof el.value === 'string' ? el.value : undefined });
  }
  return out;
}

/** Serializable subset sent to the client. */
export function serializeCaseState(state: CaseState) {
  return {
    caseId: state.caseRow.id,
    profileId: state.profile.id,
    profileName: state.profile.display_name,
    fy: state.ctx.fy,
    profileOccupations: state.ctx.profileOccupations,
    status: state.caseRow.status,
    answers: state.view.records(),
    items: state.items,
  };
}
export type ClientCaseState = ReturnType<typeof serializeCaseState>;
