'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/src/lib/access';
import { createTeamUser, deleteTeamUser, resetTeamCode, setRestrictionLevel } from '@/src/lib/access/admin';
import { RESTRICTION_LEVEL_VALUES, type RestrictionLevel } from '@/src/lib/access/seed-users';

type State = { error?: string; message?: string } | undefined;

function levelFrom(raw: FormDataEntryValue | null): RestrictionLevel {
  const v = String(raw ?? 'standard') as RestrictionLevel;
  return RESTRICTION_LEVEL_VALUES.includes(v) ? v : 'standard';
}

export async function createTeamUserAction(_prev: State, formData: FormData): Promise<State> {
  try {
    const access = await requirePermission('manageUsers');
    const row = await createTeamUser({
      username: String(formData.get('username') ?? ''),
      displayName: String(formData.get('display_name') ?? ''),
      code: String(formData.get('code') ?? ''),
      restrictionLevel: levelFrom(formData.get('restriction_level')),
      createdBy: access.user.id,
    });
    revalidatePath('/admin');
    return { message: `Added ${row.display_name} (${row.username}).` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not add user' };
  }
}

export async function setRestrictionAction(userId: string, formData: FormData) {
  const access = await requirePermission('manageUsers');
  await setRestrictionLevel(userId, levelFrom(formData.get('restriction_level')), access.user.id);
  revalidatePath('/admin');
}

export async function resetCodeAction(userId: string, _prev: State, formData: FormData): Promise<State> {
  try {
    const access = await requirePermission('manageUsers');
    await resetTeamCode(userId, String(formData.get('code') ?? ''), access.user.id);
    revalidatePath('/admin');
    return { message: 'Code updated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update code' };
  }
}

export async function deleteTeamUserAction(userId: string) {
  const access = await requirePermission('manageUsers');
  await deleteTeamUser(userId, access.user.id);
  revalidatePath('/admin');
}
