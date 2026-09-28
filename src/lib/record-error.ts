/** Write a server-side error summary to app_errors (insert-only table). Never throws. */
export async function recordServerError(err: unknown, method: string, path: string, route = 'handler'): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const e = err as Error & { digest?: string };
  console.error('[recordServerError]', method, path, e?.message);
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/app_errors`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        digest: e?.digest ?? null,
        path: path.slice(0, 300),
        method,
        route: route.slice(0, 300),
        message: String(e?.message ?? e).slice(0, 1000),
        stack: String(e?.stack ?? '').slice(0, 4000),
      }),
    });
  } catch {
    /* ignore */
  }
}
