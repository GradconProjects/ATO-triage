'use client';

import { useEffect, useRef, useState } from 'react';

/** Poll a JSON endpoint every `ms` while the tab is visible. */
export function usePoll<T>(url: string, ms = 4000, initial: T | null = null) {
  const [data, setData] = useState<T | null>(initial);
  const [error, setError] = useState(false);
  const [at, setAt] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let stopped = false;
    async function tick() {
      if (document.visibilityState === 'visible') {
        try {
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) throw new Error(String(res.status));
          const json = (await res.json()) as T;
          if (!stopped) {
            setData(json);
            setError(false);
            setAt(new Date().toISOString());
          }
        } catch {
          if (!stopped) setError(true);
        }
      }
      if (!stopped) timer.current = setTimeout(tick, ms);
    }
    void tick();
    return () => {
      stopped = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [url, ms]);

  return { data, error, at };
}
