"use client";

/**
 * Data hooks and capability helpers for the syndic console.
 *
 * `useSyndicApi` differs from the operator console's `useApi` in exactly one
 * way: a 401 sends the browser to /syndic/login rather than /login. The three
 * consoles have three sign-in surfaces, so they need three redirects.
 */

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { SyndicMatrix } from "./types";

export function useSyndicApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));

  const reload = useCallback(async () => {
    if (!path) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await api<T>(path));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/syndic/login";
        return;
      }
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [reload]);

  return { data, error, loading, reload, setData };
}

// --- Capability helpers -----------------------------------------------------
//
// These hide controls the account cannot use. They are not the enforcement
// point — every one of these checks is repeated server-side in
// routes/syndic/_access — but a button that always fails is a worse experience
// than no button.

export function can(permissions: SyndicMatrix, module: string, capability: string) {
  return Boolean(permissions?.[module]?.includes(capability));
}

export function canView(permissions: SyndicMatrix, module: string) {
  return can(permissions, module, "view");
}

export function canCreate(permissions: SyndicMatrix, module: string) {
  return can(permissions, module, "create");
}

export function canEdit(permissions: SyndicMatrix, module: string) {
  return can(permissions, module, "edit");
}

export function canDelete(permissions: SyndicMatrix, module: string) {
  return can(permissions, module, "delete");
}

export function canExport(permissions: SyndicMatrix, module: string) {
  return can(permissions, module, "export");
}
