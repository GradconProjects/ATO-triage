'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { sendMagicLink, signInWithPassword, signUpWithPassword } from './actions';

type Mode = 'password' | 'magic' | 'signup';

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>('password');
  const [pwState, pwAction, pwPending] = useActionState(signInWithPassword, undefined);
  const [suState, suAction, suPending] = useActionState(signUpWithPassword, undefined);
  const [mlState, mlAction, mlPending] = useActionState(sendMagicLink, undefined);

  const state = mode === 'password' ? pwState : mode === 'signup' ? suState : mlState;
  const action = mode === 'password' ? pwAction : mode === 'signup' ? suAction : mlAction;
  const pending = pwPending || suPending || mlPending;

  return (
    <div className="mt-6">
      <div role="tablist" aria-label="Sign-in method" className="flex gap-2">
        {(['password', 'magic', 'signup'] as Mode[]).map((m) => (
          <Button key={m} role="tab" aria-selected={mode === m} variant={mode === m ? 'default' : 'secondary'} size="sm" onClick={() => setMode(m)}>
            {m === 'password' ? 'Password' : m === 'magic' ? 'Magic link' : 'Create account'}
          </Button>
        ))}
      </div>
      <form action={action} className="mt-4 space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required className="mt-1" />
        </div>
        {mode !== 'magic' ? (
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={8} className="mt-1" />
          </div>
        ) : null}
        {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state?.message ? <Alert tone="success">{state.message}</Alert> : null}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Working…' : mode === 'password' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send magic link'}
        </Button>
      </form>
    </div>
  );
}
