'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requirePermission, type Access } from '@/src/lib/access';
import { appendAnswers, createCase, createItem, createProfile, deleteCase, deleteProfile, getCase, listAnswers, listItems, updateProfile } from '@/src/lib/db/repo';
import { findOccupation } from '@/src/occupations/registry';
import { FINANCIAL_YEARS, type FY } from '@/src/engine/types';
import type { CasePurpose, Relationship } from '@/src/lib/db/types';
import { AnswerView } from '@/src/engine/answers';
import { QUESTION_BANK } from '@/src/questions';
import { Q } from '@/src/questions/ids';

const RELATIONSHIPS: Relationship[] = ['self', 'spouse', 'family', 'client', 'other'];
const PURPOSES: CasePurpose[] = ['pre_lodgment', 'assessment_review', 'amendment', 'planning'];

function parseProfileForm(formData: FormData) {
  const display_name = String(formData.get('display_name') ?? '').trim();
  const relationship = String(formData.get('relationship') ?? 'self') as Relationship;
  const birthYearRaw = String(formData.get('birth_year') ?? '').trim();
  const birth_year = birthYearRaw ? Number(birthYearRaw) : null;
  const occupations = formData.getAll('occupations').map(String).filter((o) => findOccupation(o));
  if (!display_name) throw new Error('Display name is required');
  if (!RELATIONSHIPS.includes(relationship)) throw new Error('Invalid relationship');
  if (birth_year !== null && (!Number.isInteger(birth_year) || birth_year < 1900 || birth_year > 2100)) throw new Error('Birth year must be between 1900 and 2100');
  return { display_name, relationship, birth_year, occupations };
}

export async function createProfileAction(formData: FormData) {
  const { supabase, user } = await requirePermission('createProfile');
  const row = await createProfile(supabase, user.id, parseProfileForm(formData));
  revalidatePath('/dashboard');
  redirect(`/profiles/${row.id}`);
}

export async function updateProfileAction(profileId: string, formData: FormData) {
  const { supabase, user } = await requirePermission('editProfile');
  await updateProfile(supabase, user.id, profileId, parseProfileForm(formData));
  revalidatePath(`/profiles/${profileId}`);
  revalidatePath('/dashboard');
}

export async function deleteProfileAction(profileId: string) {
  const { supabase, user } = await requirePermission('deleteProfile');
  // Storage cleanup for every case under this profile (service role: RLS-scoped listing first).
  const cases = await supabase.from('fy_cases').select('id').eq('profile_id', profileId);
  try {
    // The owner's own session may remove their files (storage delete policy on {uid}/...).
    const admin = supabase;
    for (const c of cases.data ?? []) {
      const prefix = `${user.id}/${c.id}`;
      const files = await admin.storage.from('case-documents').list(prefix, { limit: 1000 });
      const reportFiles = await admin.storage.from('case-documents').list(`${prefix}/reports`, { limit: 1000 });
      const paths = [
        ...(files.data ?? []).filter((f) => f.id).map((f) => `${prefix}/${f.name}`),
        ...(reportFiles.data ?? []).filter((f) => f.id).map((f) => `${prefix}/reports/${f.name}`),
      ];
      if (paths.length) await admin.storage.from('case-documents').remove(paths);
    }
  } catch {
    // Storage cleanup is best effort; the database cascade still removes every row.
  }
  await deleteProfile(supabase, user.id, profileId);
  revalidatePath('/dashboard');
  redirect('/dashboard');
}

export async function createCaseAction(profileId: string, formData: FormData) {
  const { supabase, user } = await requirePermission('createCase');
  const financial_year = String(formData.get('financial_year') ?? '') as FY;
  const purpose = String(formData.get('purpose') ?? '') as CasePurpose;
  const copyFrom = String(formData.get('copy_from') ?? '');
  if (!FINANCIAL_YEARS.includes(financial_year)) throw new Error('Choose a financial year');
  if (!PURPOSES.includes(purpose)) throw new Error('Choose a purpose');
  // A tax year belongs to the profile's owner, including when an admin starts it for them.
  const owner = await supabase.from('profiles').select('owner_id').eq('id', profileId).single();
  const ownerId = (owner.data?.owner_id as string | undefined) ?? user.id;
  const row = await createCase(supabase, ownerId, { profile_id: profileId, financial_year, purpose });
  // The FY and purpose are facts the user chose on this form; record them as answered.
  await appendAnswers(supabase, ownerId, row.id, [
    { questionId: Q.core.fy, repeaterItemId: null, value: financial_year, state: 'answered', source: 'user' },
    { questionId: Q.core.purpose, repeaterItemId: null, value: purpose, state: 'answered', source: 'user' },
  ]);
  if (copyFrom) await copyStableFacts(supabase, ownerId, copyFrom, row.id);
  revalidatePath(`/profiles/${profileId}`);
  redirect(`/cases/${row.id}/interview/core`);
}

/**
 * "Start new year" copy: stable facts (occupations per employer, rental property details,
 * residency) arrive as `imported` and must be confirmed by the user before they count.
 */
const COPY_GROUPS = new Set(['employer', 'rental_property']);
const COPY_QUESTION_PREFIXES = ['emp.employer.name', 'emp.employer.abn', 'emp.employer.occupation', 'emp.employer.other_tags', 'rent.property.address', 'rent.property.ownership_pct', 'res.status', 'fam.spouse', 'phi.cover', 'loan.types', 'rent.any'];

async function copyStableFacts(supabase: Access['supabase'], ownerId: string, fromCaseId: string, toCaseId: string) {
  const source = await getCase(supabase, fromCaseId);
  if (!source) return;
  const [answers, items] = await Promise.all([listAnswers(supabase, fromCaseId), listItems(supabase, fromCaseId)]);
  const view = new AnswerView(answers, items);
  const known = new Set(QUESTION_BANK.map((q) => q.id));
  const itemMap = new Map<string, string>();
  for (const it of items) {
    if (!COPY_GROUPS.has(it.groupId)) continue;
    const created = await createItem(supabase, ownerId, toCaseId, it.groupId, it.sortOrder);
    itemMap.set(it.id, created.id);
  }
  const toCopy = view
    .records()
    .filter((r) => r.state === 'answered' && known.has(r.questionId) && COPY_QUESTION_PREFIXES.some((p) => r.questionId === p))
    .filter((r) => !r.repeaterItemId || itemMap.has(r.repeaterItemId))
    .map((r) => ({
      questionId: r.questionId,
      repeaterItemId: r.repeaterItemId ? (itemMap.get(r.repeaterItemId) ?? null) : null,
      value: r.value,
      state: 'imported' as const,
      source: 'document' as const,
    }));
  await appendAnswers(supabase, ownerId, toCaseId, toCopy);
}

export async function deleteCaseAction(profileId: string, caseId: string) {
  const { supabase, user } = await requirePermission('deleteCase');
  await deleteCase(supabase, user.id, caseId);
  revalidatePath(`/profiles/${profileId}`);
}
