"use client";

/**
 * Syndic Admin session context — layer 2.
 *
 * Fetched once by the layout and shared, rather than re-fetched per screen: the
 * development name, the permission matrix and the impersonation flag are read
 * by the shell on every route, and each screen also needs the matrix to decide
 * which buttons exist at all.
 *
 * Unauthenticated visitors go to /syndic/login, never to the operator's /login
 * or the resident /app/login. The three surfaces accept different accounts, and
 * bouncing someone to a form that will reject them is worse than no redirect.
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
import type { SyndicSession } from "./types";

export const PUBLIC_ROUTES = ["/syndic/login"];

type SessionState = {
  session: SyndicSession | null;
  loading: boolean;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SyndicSessionContext = createContext<SessionState | null>(null);

export function SyndicSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<SyndicSession | null>(null);
  const [loading, setLoading] = useState(true);

  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  const reload = useCallback(async () => {
    try {
      const payload = await api<{ user: SyndicSession["user"] | null } & Partial<SyndicSession>>(
        "/api/syndic/auth/me",
      );
      setSession(payload.user ? (payload as SyndicSession) : null);
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
    router.replace("/syndic/login");
  }, [loading, isPublic, session, router]);

  const signOut = useCallback(async () => {
    const wasSupport = session?.user.impersonating;
    await api("/api/syndic/auth/logout", { method: "POST" }).catch(() => null);
    setSession(null);
    // A support session ends by handing the operator back their own console,
    // not by logging them out of it.
    router.replace(wasSupport ? "/properties" : "/syndic/login");
  }, [router, session]);

  const value = useMemo(
    () => ({ session, loading, reload, signOut }),
    [session, loading, reload, signOut],
  );

  return <SyndicSessionContext.Provider value={value}>{children}</SyndicSessionContext.Provider>;
}

export function useSyndicSession() {
  const context = useContext(SyndicSessionContext);
  if (!context) {
    throw new Error("useSyndicSession must be used inside SyndicSessionProvider");
  }
  return context;
}

/** The session for a screen that cannot render without one. */
export function useSyndic() {
  const { session, loading } = useSyndicSession();
  return {
    session,
    loading,
    user: session?.user ?? null,
    development: session?.development ?? null,
    permissions: session?.permissions ?? {},
  };
}

export function isUnauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}
