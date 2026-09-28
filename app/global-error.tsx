'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/components/layout/report-client-error';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error, 'global-error');
  }, [error]);
  return (
    <html lang="en-AU">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 560, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
        <p>The page hit an error. It has been recorded so it can be fixed.</p>
        <p style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => reset()} style={{ padding: '10px 16px' }}>
            Try again
          </button>
          <a href="/login" style={{ padding: '10px 16px' }}>
            Back to sign in
          </a>
        </p>
        {error.digest ? <p style={{ color: '#64748b', fontSize: 12 }}>Reference: {error.digest}</p> : null}
      </body>
    </html>
  );
}
