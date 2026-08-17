"use client";

/**
 * Data-fetching hooks for the resident app.
 *
 * `useResidentApi` differs from the console's `useApi` in two ways that matter
 * on a phone:
 *
 * 1. A 401 sends the visitor to /app/login, not the console's /login.
 * 2. When the network is gone, a cached response served by the service worker
 *    is still a usable answer. The hook reports `stale` so the screen can say
 *    so, rather than throwing away good data because the device is offline.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ApiError, apiWithMeta } from "@/lib/api";

type ApiState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  stale: boolean;
  reload: () => Promise<void>;
  setData: (value: T | null) => void;
};

export function useResidentApi<T>(path: string | null): ApiState<T> {
  const router = useRouter();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [stale, setStale] = useState(false);

  const reload = useCallback(async () => {
    if (!path) {
      setData(null);
      setError(null);
      setStale(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await apiWithMeta<T>(path);
      setData(result.data);
      setStale(result.fromCache);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.replace("/app/login");
        return;
      }
      // A failed refresh with data already on screen means the network went
      // away, not that the data became wrong. Keep it and flag it.
      setStale(true);
      setError(caught instanceof Error ? caught.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [path, router]);

  // Deferred by a tick so the first fetch does not set state inside the effect
  // body and cascade a second render — the same pattern as the console's useApi.
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [reload]);

  return { data, error, loading, stale, reload, setData };
}

/** Live connectivity, used to disable writes and explain why. */
export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

/** Wrap a write so a screen gets pending state and a message without repeating itself. */
export function useAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | null> => {
      setPending(true);
      setError(null);
      try {
        return await action(...args);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Something went wrong");
        return null;
      } finally {
        setPending(false);
      }
    },
    [action],
  );

  return { run, pending, error, setError };
}

/** Counts down to an ISO timestamp — "3 days 14 hours" on the voting screen. */
export function useCountdown(target: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [target]);

  if (!target) return null;
  const deadline = new Date(target).getTime();
  if (Number.isNaN(deadline)) return null;

  const remaining = deadline - now;
  if (remaining <= 0) return { expired: true, label: "Closed" };

  const minutes = Math.floor(remaining / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);

  if (days > 0) {
    return { expired: false, label: `${days} day${days === 1 ? "" : "s"} ${hours} hour${hours === 1 ? "" : "s"}` };
  }
  if (hours > 0) {
    return { expired: false, label: `${hours} hour${hours === 1 ? "" : "s"} ${minutes % 60} min` };
  }
  return { expired: false, label: `${minutes} min` };
}
