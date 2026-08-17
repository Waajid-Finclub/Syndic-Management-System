"use client";

/**
 * Resident session context.
 *
 * The session is fetched once by the layout and shared, rather than re-fetched
 * per screen: the identity block (name, unit, share allocation) appears in
 * every header, and on a phone connection a second round trip per navigation is
 * the difference between instant and sluggish.
 *
 * Unauthenticated visitors are pushed to /app/login, never to the console's
 * /login — the two products have separate sign-in surfaces because they accept
 * different accounts.
 */

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, ApiError } from "@/lib/api";
import type { ResidentPreferences, ResidentSession } from "./types";

export const PUBLIC_ROUTES = ["/app/login", "/app/register"];

type SessionState = {
  session: ResidentSession | null;
  loading: boolean;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
  setPreferences: (preferences: ResidentPreferences) => void;
  setUnreadCount: (count: number) => void;
};

const ResidentSessionContext = createContext<SessionState | null>(null);

export function ResidentSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<ResidentSession | null>(null);
  const [loading, setLoading] = useState(true);

  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  const reload = useCallback(async () => {
    try {
      const payload = await api<{ user: ResidentSession["user"] | null } & Partial<ResidentSession>>(
        "/api/resident/auth/me",
      );
      setSession(payload.user ? (payload as ResidentSession) : null);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [reload]);

  useEffect(() => {
    if (loading || isPublic || session) return;
    router.replace("/app/login");
  }, [loading, isPublic, session, router]);

  const signOut = useCallback(async () => {
    await api("/api/resident/auth/logout", { method: "POST" }).catch(() => null);
    setSession(null);
    router.replace("/app/login");
  }, [router]);

  const setPreferences = useCallback((preferences: ResidentPreferences) => {
    setSession((current) => (current ? { ...current, preferences } : current));
  }, []);

  const setUnreadCount = useCallback((count: number) => {
    setSession((current) => (current ? { ...current, unread_notifications: count } : current));
  }, []);

  const value = useMemo(
    () => ({ session, loading, reload, signOut, setPreferences, setUnreadCount }),
    [session, loading, reload, signOut, setPreferences, setUnreadCount],
  );

  return (
    <ResidentSessionContext.Provider value={value}>{children}</ResidentSessionContext.Provider>
  );
}

export function useResidentSession() {
  const context = useContext(ResidentSessionContext);
  if (!context) {
    throw new Error("useResidentSession must be used inside ResidentSessionProvider");
  }
  return context;
}

/**
 * The session for a screen that cannot render without one.
 *
 * Returns null while loading or signed out; the layout is already redirecting
 * in that case, so screens render their skeleton rather than crashing on a
 * missing unit.
 */
export function useResident() {
  const { session, loading } = useResidentSession();
  return { session, loading, unit: session?.unit ?? null, user: session?.user ?? null };
}

export function isUnauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}
