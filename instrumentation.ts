import type { Instrumentation } from 'next';

/**
 * Record every server-side request error in the app_errors table (insert-only for clients,
 * readable by admins). Uses a plain REST call so it has no heavy imports and never throws.
 * Messages are truncated and contain no request bodies or answer values.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const e = err as Error & { digest?: string };
  console.error('[onRequestError]', request.method, request.path, e?.digest, e?.message);
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/app_errors`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        digest: e?.digest ?? null,
        path: request.path?.split('?')[0]?.slice(0, 300) ?? null,
        method: request.method,
        route: `${context.routerKind}:${context.routePath}:${context.routeType}`.slice(0, 300),
        message: String(e?.message ?? e).slice(0, 1000),
        stack: String(e?.stack ?? '').slice(0, 4000),
      }),
    });
  } catch {
    /* never let error reporting fail a request */
  }
};
