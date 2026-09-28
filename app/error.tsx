'use client';

import Link from 'next/link';

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm">This page hit an error. It has been recorded so it can be fixed.</p>
      <div className="mt-4 flex gap-3">
        <button onClick={() => reset()} className="min-h-11 rounded-md bg-primary px-4 text-sm text-white">
          Try again
        </button>
        <Link href="/dashboard" className="min-h-11 rounded-md border border-border px-4 py-3 text-sm">
          Dashboard
        </Link>
        <Link href="/login" className="min-h-11 rounded-md border border-border px-4 py-3 text-sm">
          Sign in
        </Link>
      </div>
      {error.digest ? <p className="mt-4 text-xs text-muted">Reference: {error.digest}</p> : null}
    </main>
  );
}
