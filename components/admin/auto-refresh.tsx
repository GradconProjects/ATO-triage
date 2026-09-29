'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Re-render the server page every `ms` so counts stay current. */
export function AutoRefresh({ ms = 8000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, ms);
    return () => clearInterval(t);
  }, [router, ms]);
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" aria-hidden />
      Live · refreshes automatically
    </span>
  );
}
