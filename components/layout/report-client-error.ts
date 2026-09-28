'use client';

/** Send an error summary from the browser to the app_errors table (insert-only). Never throws. */
export function reportClientError(error: Error & { digest?: string }, where: string) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    void fetch(`${url}/rest/v1/app_errors`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        digest: error.digest ?? null,
        path: typeof window !== 'undefined' ? window.location.pathname.slice(0, 300) : null,
        method: 'CLIENT',
        route: `${where} | ${typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : ''}`,
        message: String(error.message ?? error).slice(0, 1000),
        stack: String(error.stack ?? '').slice(0, 4000),
      }),
    }).catch(() => undefined);
  } catch {
    /* ignore */
  }
}
