import { useCallback, useEffect, useState } from 'react';
import { checkHealth } from '../api';

export type ServerStatus = 'checking' | 'waking' | 'online' | 'offline';

const SLOW_AFTER_MS = 2_500; // longer than this means a cold start
const GIVE_UP_AFTER_MS = 90_000; // Render free tier usually wakes in under a minute
const RETRY_EVERY_MS = 3_000;

/** Pings /api/health until the (possibly sleeping) backend answers. */
export function useServerStatus() {
  const [status, setStatus] = useState<ServerStatus>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;
    const started = Date.now();
    setStatus('checking');
    const slowTimer = setTimeout(() => !cancelled && setStatus((s) => (s === 'checking' ? 'waking' : s)), SLOW_AFTER_MS);

    (async () => {
      while (!cancelled) {
        controller = new AbortController();
        const timeout = setTimeout(() => controller?.abort(), 15_000);
        const ok = await checkHealth(controller.signal);
        clearTimeout(timeout);
        if (cancelled) return;
        if (ok) {
          clearTimeout(slowTimer);
          setStatus('online');
          return;
        }
        if (Date.now() - started > GIVE_UP_AFTER_MS) {
          setStatus('offline');
          return;
        }
        setStatus('waking');
        await new Promise((r) => setTimeout(r, RETRY_EVERY_MS));
      }
    })();

    return () => {
      cancelled = true;
      controller?.abort();
      clearTimeout(slowTimer);
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { status, retry };
}
