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
    const appended = await appendAnswers(db, ownerId, caseId, hidden.map(({ version: _v, ...rest }) => rest));
    answers = [...answers, ...appended];
    items = state.items;
    state = buildCaseState(caseRow, profile, answers, items);
  }
  return state;
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
