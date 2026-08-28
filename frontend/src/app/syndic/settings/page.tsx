"use client";

/**
 * Development settings.
 *
 * Split deliberately into what a client controls and what the operator holds.
 * Billing day, grace period and penalty rate are the client's; plan, seats,
 * status and feature flags are commercial terms. Listing the second group here
 * — rather than leaving it out — is what stops a manager hunting for a setting
 * that was never theirs.
 */

import { useState } from "react";
import { Check, Loader2, Lock, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { StatusPill } from "@/components/status-pill";
import { SyndicShell } from "@/components/syndic/shell";
import { ToggleSwitch } from "@/components/toggle-switch";
import { api } from "@/lib/api";
import { money, number } from "@/lib/format";
import { canEdit, useSyndicApi } from "@/lib/syndic/hooks";
import { useSyndic } from "@/lib/syndic/session";
import type { SettingsResponse } from "@/lib/syndic/types";

export default function SettingsPage() {
  const { permissions } = useSyndic();
  const config = useSyndicApi<SettingsResponse>("/api/syndic/settings");

  // The two switches read from the server response until the user touches
  // them, then from the local override. Deriving rather than syncing in an
  // effect means the form never flashes a stale value on reload.
  const [toggles, setToggles] = useState<{ online?: boolean; voting?: boolean }>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mayEdit = canEdit(permissions, "settings");
  const data = config.data;

  const onlinePayments = toggles.online ?? data?.settings.allow_online_payments ?? true;
  const residentVoting = toggles.voting ?? data?.settings.allow_resident_voting ?? false;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const response = await api<{ changed: string[] }>("/api/syndic/settings", {
        method: "PATCH",
        body: {
          billing_day: Number(form.get("billing_day")),
          arrears_grace_days: Number(form.get("arrears_grace_days")),
          penalty_rate_percent: form.get("penalty_rate_percent") || null,
          allow_online_payments: onlinePayments,
          allow_resident_voting: residentVoting,
          syndic_manager_name: form.get("syndic_manager_name"),
          syndic_manager_email: form.get("syndic_manager_email"),
          address_line_1: form.get("address_line_1"),
          city: form.get("city"),
          district: form.get("district"),
        },
      });
      setSaved(response.changed);
      setToggles({});
      await config.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SyndicShell>
      <PageHeader
        title="Development Settings"
        subtitle={data ? `${data.development.name} · ${data.development.code}` : "Loading..."}
      />

      {config.error ? <div className="notice notice--er">{config.error}</div> : null}
      {error ? <div className="notice notice--er">{error}</div> : null}
      {saved ? (
        <div className="notice notice--ok">
          <Check size={15} />
          <div>
            <div className="notice__title">Settings saved</div>
            <div className="notice__sub">
              {saved.length
                ? `${saved.join(", ")} recorded in the audit log with their previous values.`
                : "No audited value changed."}
            </div>
          </div>
        </div>
      ) : null}

      {data ? (
        <form onSubmit={submit}>
          <Section
            subtitle="These drive when invoices fall due and when they count as late"
            title="Billing"
          >
            <div className="form-grid">
              <div>
                <label className="label" htmlFor="billing_day">
                  Billing day of the month
                </label>
                <input
                  className="field"
                  defaultValue={data.settings.billing_day}
                  disabled={!mayEdit}
                  id="billing_day"
                  max={28}
                  min={1}
                  name="billing_day"
                  type="number"
                />
                <p className="mt-1 text-xs font-medium text-[var(--cmt)]">
                  Capped at 28 so every month has the day — a 30th silently skips February.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="arrears_grace_days">
                  Grace period (days)
                </label>
                <input
                  className="field"
                  defaultValue={data.settings.arrears_grace_days}
                  disabled={!mayEdit}
                  id="arrears_grace_days"
                  max={90}
                  min={0}
                  name="arrears_grace_days"
                  type="number"
                />
                <p className="mt-1 text-xs font-medium text-[var(--cmt)]">
                  Days between issue and due date on a billing run.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="penalty_rate_percent">
                  Penalty rate (%)
                </label>
                <input
                  className="field"
                  defaultValue={data.settings.penalty_rate_percent ?? ""}
                  disabled={!mayEdit}
                  id="penalty_rate_percent"
                  max={50}
                  min={0}
                  name="penalty_rate_percent"
                  placeholder="None"
                  type="number"
                />
              </div>
            </div>

            <div className="wa-toggle-row mt-5">
              <ToggleSwitch
                label="Allow online payments"
                on={onlinePayments}
                onChange={
                  mayEdit
                    ? (next) => setToggles((current) => ({ ...current, online: next }))
                    : undefined
                }
              />
              <span className="text-sm font-semibold">
                Co-owners can pay from the app
              </span>
            </div>

            <div className="wa-toggle-row mt-3">
              <ToggleSwitch
                label="Allow resident voting"
                on={residentVoting}
                onChange={
                  mayEdit
                    ? (next) => setToggles((current) => ({ ...current, voting: next }))
                    : undefined
                }
              />
              <span className="text-sm font-semibold">
                Co-owners can cast share-weighted votes from the app
              </span>
            </div>
          </Section>

          <Section subtitle="Shown to co-owners in the app" title="Contact and address">
            <div className="form-grid">
              <div>
                <label className="label" htmlFor="syndic_manager_name">
                  Manager name
                </label>
                <input
                  className="field"
                  defaultValue={data.development.syndic_manager_name ?? ""}
                  disabled={!mayEdit}
                  id="syndic_manager_name"
                  name="syndic_manager_name"
                />
              </div>
              <div>
                <label className="label" htmlFor="syndic_manager_email">
                  Manager email
                </label>
                <input
                  className="field"
                  defaultValue={data.development.syndic_manager_email ?? ""}
                  disabled={!mayEdit}
                  id="syndic_manager_email"
                  name="syndic_manager_email"
                  type="email"
                />
              </div>
              <div>
                <label className="label" htmlFor="address_line_1">
                  Address
                </label>
                <input
                  className="field"
                  defaultValue={data.development.address_line_1 ?? ""}
                  disabled={!mayEdit}
                  id="address_line_1"
                  name="address_line_1"
                />
              </div>
              <div>
                <label className="label" htmlFor="city">
                  City
                </label>
                <input
                  className="field"
                  defaultValue={data.development.city ?? ""}
                  disabled={!mayEdit}
                  id="city"
                  name="city"
                />
              </div>
              <div>
                <label className="label" htmlFor="district">
                  District
                </label>
                <input
                  className="field"
                  defaultValue={data.development.district ?? ""}
                  disabled={!mayEdit}
                  id="district"
                  name="district"
                />
              </div>
            </div>

            {mayEdit ? (
              <button className="btn btn-primary mt-5" disabled={saving} type="submit">
                {saving ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
                Save settings
              </button>
            ) : (
              <div className="notice notice--info mt-5">
                <Lock size={15} />
                <div>
                  <div className="notice__title">Read-only for your role</div>
                  <div className="notice__sub">
                    A syndic manager can change these settings.
                  </div>
                </div>
              </div>
            )}
          </Section>
        </form>
      ) : (
        <div className="loading-line" />
      )}

      {data ? (
        <Section
          action={<Settings2 className="text-[var(--cr)]" size={17} />}
          subtitle="Commercial terms the platform operator holds"
          title="Subscription"
        >
          <div className="detail-grid">
            <div className="detail-field">
              <span className="detail-field__label">Plan</span>
              <span className="detail-field__value">{data.subscription.plan_name ?? "—"}</span>
            </div>
            <div className="detail-field">
              <span className="detail-field__label">Status</span>
              <span className="detail-field__value">
                <StatusPill value={data.subscription.status} />
              </span>
            </div>
            <div className="detail-field">
              <span className="detail-field__label">Admin seats</span>
              <span className="detail-field__value">{number(data.subscription.admin_seats)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-field__label">Rate per unit</span>
              <span className="detail-field__value">
                {money(data.subscription.monthly_unit_rate)}
              </span>
            </div>
            <div className="detail-field">
              <span className="detail-field__label">Monthly total</span>
              <span className="detail-field__value">{money(data.subscription.mrr)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-field__label">Units billed</span>
              <span className="detail-field__value">{number(data.development.unit_count)}</span>
            </div>
          </div>

          <div className="notice notice--info mt-5">
            <Lock size={15} />
            <div>
              <div className="notice__title">Changed by the platform operator</div>
              <div className="notice__sub">{data.operator_controlled.join(" · ")}</div>
            </div>
          </div>
        </Section>
      ) : null}
    </SyndicShell>
  );
}
