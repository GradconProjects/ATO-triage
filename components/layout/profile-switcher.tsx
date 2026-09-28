'use client';

import { useRouter } from 'next/navigation';

export function ProfileSwitcher({ profiles, currentProfileId }: { profiles: { id: string; name: string }[]; currentProfileId?: string }) {
  const router = useRouter();
  if (profiles.length === 0) return null;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">Switch profile</span>
      <select
        aria-label="Switch profile"
        className="min-h-9 rounded-md border border-border bg-card px-2 text-sm"
        value={currentProfileId ?? ''}
        onChange={(e) => {
          const id = e.target.value;
          router.push(id ? `/profiles/${id}` : '/dashboard');
        }}
      >
        <option value="">All profiles</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
