'use client';

import Link from 'next/link';
import { useState } from 'react';
import s from './login.module.css';

export function LoginForm({ next, initialError, adminMode = false }: { next: string; initialError?: string; adminMode?: boolean }) {
  const [identifier, setIdentifier] = useState(adminMode ? 'admin' : '');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if ((!adminMode && !identifier.trim()) || !password) {
      setError(adminMode ? 'Enter the admin code.' : 'Enter your username or email, and your password.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: adminMode ? 'admin' : identifier.trim(), password, next: adminMode ? '/admin' : next }),
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
    <>
    <h1 className={s.title}>{adminMode ? 'Admin sign in' : 'Sign in'}</h1>
    <p className={s.sub}>{adminMode ? 'Enter the admin code to see every user’s entries and reports.' : 'Welcome back. Continue your tax interview.'}</p>
    <form className={s.form} onSubmit={onSubmit} noValidate>
      {adminMode ? null : (
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
      )}
      <div>
        <label htmlFor="password" className={s.label}>
          {adminMode ? 'Admin code' : 'Password'}
        </label>
        <div className={s.pwWrap}>
          <input
            id="password"
            name="password"
            className={s.input}
            type={show ? 'text' : 'password'}
            inputMode={adminMode ? 'numeric' : undefined}
            autoFocus={adminMode}
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
        {pending ? 'Signing in…' : adminMode ? 'Sign in as admin' : 'Sign in'}
      </button>
    </form>
    <p className={s.help}>
      {adminMode ? (
        <Link href="/login">← Back to user sign in</Link>
      ) : (
        <>Use the username and code your administrator gave you. Administrators: use the <Link href="/login?admin=1">Admin</Link> button.</>
      )}
    </p>
    </>
  );
}
