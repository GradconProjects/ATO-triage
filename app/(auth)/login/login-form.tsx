'use client';

import { useState } from 'react';
import s from './login.module.css';

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Enter your username or email, and your password.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password, next }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; redirect?: string; error?: string };
      if (res.ok && data.ok) {
        // Full page load so the session cookie is picked up everywhere.
        window.location.assign(data.redirect ?? '/dashboard');
        return;
      }
      setError(data.error ?? 'Sign-in failed. Try again.');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    }
    setPending(false);
  }

  return (
    <form className={s.form} onSubmit={onSubmit} noValidate>
      <div>
        <label htmlFor="identifier" className={s.label}>
          Username or email
        </label>
        <input
          id="identifier"
          name="username"
          className={s.input}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="password" className={s.label}>
          Password
        </label>
        <div className={s.pwWrap}>
          <input
            id="password"
            name="password"
            className={s.input}
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="button" className={s.toggle} onClick={() => setShow((v) => !v)} aria-pressed={show} aria-controls="password">
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className={s.error}>
          {error}
        </p>
      ) : null}
      <button type="submit" className={s.submit} disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
