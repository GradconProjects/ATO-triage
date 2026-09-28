'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { RESTRICTION_LEVELS, type RestrictionLevel } from '@/src/lib/access/seed-users';
import { createTeamUserAction, resetCodeAction, setRestrictionAction } from './actions';

const MEMBER_LEVELS = RESTRICTION_LEVELS.filter((l) => l.value !== 'none');

export function AddUserForm() {
  const [state, action, pending] = useActionState(createTeamUserAction, undefined);
  return (
    <form action={action} className="mt-3 space-y-3">
      <div>
        <Label htmlFor="new-username">Username</Label>
        <Input id="new-username" name="username" required autoCapitalize="none" pattern="[a-z0-9_.-]{2,40}" className="mt-1" />
      </div>
      <div>
        <Label htmlFor="new-display">Display name</Label>
        <Input id="new-display" name="display_name" required className="mt-1" />
      </div>
      <div>
        <Label htmlFor="new-code">Sign-in code (4 to 8 digits)</Label>
        <Input id="new-code" name="code" type="password" inputMode="numeric" pattern="\d{4,8}" required className="mt-1" />
      </div>
      <div>
        <Label htmlFor="new-level">Restriction level</Label>
        <Select id="new-level" name="restriction_level" defaultValue="standard" className="mt-1">
          {MEMBER_LEVELS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </Select>
      </div>
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.message ? <Alert tone="success">{state.message}</Alert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add user'}
      </Button>
    </form>
  );
}

export function RestrictionSelect({ userId, current }: { userId: string; current: RestrictionLevel }) {
  const action = setRestrictionAction.bind(null, userId);
  return (
    <form action={action} className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`level-${userId}`}>
        Restriction level
      </label>
      <Select id={`level-${userId}`} name="restriction_level" defaultValue={current} className="min-h-9 w-auto text-sm">
        {MEMBER_LEVELS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="secondary" size="sm">
        Save
      </Button>
    </form>
  );
}

export function ResetCodeForm({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const bound = resetCodeAction.bind(null, userId);
  const [state, action, pending] = useActionState(bound, undefined);
  if (!open)
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Reset code
      </Button>
    );
  return (
    <form action={action} className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`code-${userId}`}>
        New code
      </label>
      <Input id={`code-${userId}`} name="code" type="password" inputMode="numeric" pattern="\d{4,8}" required placeholder="New code" className="min-h-9 w-28 text-sm" />
      <Button type="submit" size="sm" disabled={pending}>
        Save
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {state?.error ? <span className="text-xs text-danger">{state.error}</span> : null}
      {state?.message ? <span className="text-xs text-success">{state.message}</span> : null}
    </form>
  );
}
