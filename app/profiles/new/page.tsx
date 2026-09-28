import { AppShell } from '@/components/layout/app-shell';
import { ProfileForm } from '../profile-form';
import { createProfileAction } from '../actions';

export const metadata = { title: 'Add profile' };

export default function NewProfilePage() {
  return (
    <AppShell>
      <h1 className="text-2xl font-semibold">Add a profile</h1>
      <p className="mt-1 text-sm text-muted">A profile is a person being assessed. No tax file number is ever collected.</p>
      <ProfileForm action={createProfileAction} submitLabel="Create profile" />
    </AppShell>
  );
}
