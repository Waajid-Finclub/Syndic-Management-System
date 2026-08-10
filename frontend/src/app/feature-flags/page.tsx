"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { ToggleSwitch } from "@/components/toggle-switch";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { canEdit } from "@/lib/permissions";
import type { FeatureFlag, User } from "@/lib/types";

export default function FeatureFlagsPage() {
  const session = useApi<{ user: User | null }>("/api/auth/me");
  const flags = useApi<{ flags: FeatureFlag[]; scopes: string[] }>("/api/feature-flags/");
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const user = session.data?.user ?? null;
  const editable = canEdit(user, "feature_flags");
  const rows = flags.data?.flags ?? [];

  async function toggle(flag: FeatureFlag, next: boolean) {
    setBusy(flag.id);
    setError(null);
    try {
      await api(`/api/feature-flags/${flag.id}`, { method: "PATCH", body: { is_enabled: next } });
      await flags.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the flag");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Feature Flags & Configuration"
        subtitle="Global switches, plan gating and per-property overrides"
      />

      {error ? <div className="notice notice--er">{error}</div> : null}
      {flags.error ? <div className="notice notice--er">{flags.error}</div> : null}

      {!editable && rows.length ? (
        <div className="notice notice--info">
          <div>
            <div className="notice__title">Read-only</div>
            <div className="notice__sub">Your role can view flags but not change them.</div>
          </div>
        </div>
      ) : null}

      <div className="section">
        <div className="section__header">
          <div>
            <h2 className="section__title">Platform flags</h2>
            <p className="section__sub">
              {rows.filter((flag) => flag.is_enabled).length} of {rows.length} enabled
            </p>
          </div>
        </div>

        <div className="section__body section__body--flush">
          {flags.loading && !rows.length ? <div className="loading-line">Loading feature flags...</div> : null}

          {rows.map((flag) => (
            <div className="flag-row" key={flag.id}>
              <ToggleSwitch
                disabled={busy === flag.id}
                label={`Toggle ${flag.feature_key}`}
                on={flag.is_enabled}
                onChange={editable ? (next) => toggle(flag, next) : undefined}
              />
              <div className="flag-row__copy">
                <div className="flag-row__key">
                  <span className="flag-row__name">{flag.feature_key}</span>
                  <StatusPill value={flag.is_enabled ? "active" : "off"} />
                </div>
                <div className="flag-row__desc">{flag.description}</div>
              </div>
              <div className="flag-row__meta">
                <div className="flag-row__scope">{flag.scope}</div>
                {flag.override_count > 0 ? (
                  <div className="flag-row__overrides">
                    {flag.override_count} override{flag.override_count === 1 ? "" : "s"}
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {!flags.loading && !rows.length ? <EmptyState message="No feature flags configured" /> : null}
        </div>
      </div>
    </AppShell>
  );
}
