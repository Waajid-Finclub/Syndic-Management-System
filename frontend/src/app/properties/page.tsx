"use client";

import { useMemo, useState } from "react";
import { Building2, Download, Loader2, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Modal } from "@/components/modal";
import { PageHeader } from "@/components/page-header";
import { SelectMenu } from "@/components/select-menu";
import { MetricTile } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { Tabs } from "@/components/tabs";
import { api, downloadFile } from "@/lib/api";
import { compactMoney, formatMonthYear, number } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { DevelopmentListResponse, User } from "@/lib/types";
import { canCreate, canExport } from "@/lib/permissions";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "trial", label: "Trial" },
  { key: "setup", label: "Setup" },
  { key: "uat", label: "UAT" },
  { key: "suspended", label: "Suspended" },
];

const PLAN_OPTIONS = [
  { value: "basic", label: "Basic — MUR 100 / unit / month" },
  { value: "silver", label: "Silver — MUR 175 / unit / month" },
  { value: "premium", label: "Premium — MUR 250 / unit / month" },
];

const TYPE_OPTIONS = [
  { value: "apartment", label: "Apartment block" },
  { value: "gated", label: "Gated estate" },
  { value: "estate", label: "Estate" },
  { value: "mixed", label: "Mixed development" },
];

export default function PropertiesPage() {
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const session = useApi<{ user: User | null }>("/api/auth/me");
  const registry = useApi<DevelopmentListResponse>(`/api/developments?status=${status}`);
  const user = session.data?.user ?? null;

  const rows = useMemo(() => {
    const developments = registry.data?.developments ?? [];
    const term = query.trim().toLowerCase();
    if (!term) return developments;
    return developments.filter((development) =>
      [development.name, development.location, development.syndic_manager_name, development.code]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [registry.data, query]);

  const totals = registry.data?.totals;
  const counts = registry.data?.status_counts ?? {};
  const tabs = STATUS_TABS.map((tab) => ({ ...tab, count: counts[tab.key] ?? 0 }));

  return (
    <AppShell
      onSearch={setQuery}
      searchPlaceholder="Search property, location, syndic..."
      searchValue={query}
    >
      <PageHeader
        title="Client Properties"
        subtitle="Every development the platform serves, with its registry totals and commercials"
        action={
          <div className="page__actions">
            {canExport(user, "properties") ? (
              <button
                className="btn btn-secondary"
                onClick={() => downloadFile("/api/developments/export", "client-properties.csv")}
                type="button"
              >
                <Download size={13} />
                Export
              </button>
            ) : null}
            {canCreate(user, "properties") ? (
              <button className="btn btn-primary" onClick={() => setCreating(true)} type="button">
                <Plus size={13} />
                Add client
              </button>
            ) : null}
          </div>
        }
      />

      {registry.error ? <div className="notice notice--er">{registry.error}</div> : null}

      <Tabs active={status} items={tabs} onChange={setStatus} />

      {totals ? (
        <div className="metric-strip">
          <MetricTile center label="Total properties" value={number(totals.properties)} />
          <MetricTile center label="Total units" value={number(totals.units)} />
          <MetricTile center label="Total parking" value={number(totals.parking)} />
          <MetricTile center label="Total storage" value={number(totals.storage)} />
          <MetricTile center label="Avg units / dev" value={number(totals.avg_units)} />
          <MetricTile center label="Portfolio MRR" value={compactMoney(totals.mrr)} />
        </div>
      ) : null}

      <div className="section">
        <div className="section__header">
          <div>
            <h2 className="section__title">Property registry</h2>
            <p className="section__sub">
              {rows.length} shown{query ? ` for "${query}"` : ""}
            </p>
          </div>
          <div className="searchbox">
            <Search size={14} />
            <input
              aria-label="Filter properties"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter this list..."
              value={query}
            />
          </div>
        </div>

        <div className="section__body section__body--flush">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Location</th>
                  <th>Syndic</th>
                  <th>Plan</th>
                  <th className="right">Units</th>
                  <th className="right">Parking</th>
                  <th className="right">Stores</th>
                  <th className="right">Facilities</th>
                  <th className="right">Users</th>
                  <th>Status</th>
                  <th className="right">MRR</th>
                  <th>Since</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((development) => (
                  <tr key={development.id}>
                    <td className="bold color-cr">{development.name}</td>
                    <td>{development.location ?? "-"}</td>
                    <td>{development.syndic_manager_name ?? "-"}</td>
                    <td>
                      <StatusPill value={development.plan_code} />
                    </td>
                    <td className="right mono">{number(development.unit_count)}</td>
                    <td className="right mono">{number(development.parking_count)}</td>
                    <td className="right mono">{number(development.storage_count)}</td>
                    <td className="right mono">{number(development.facility_count)}</td>
                    <td className="right mono">{number(development.user_count)}</td>
                    <td>
                      <StatusPill value={development.status} />
                    </td>
                    <td className="right mono bold">{compactMoney(development.mrr)}</td>
                    <td>{development.launch_date ? formatMonthYear(development.launch_date) : "-"}</td>
                  </tr>
                ))}
                {registry.loading && !rows.length ? (
                  <tr>
                    <td className="empty-cell" colSpan={12}>
                      Loading properties...
                    </td>
                  </tr>
                ) : null}
                {!registry.loading && !rows.length ? (
                  <tr>
                    <td className="empty-cell" colSpan={12}>
                      No properties match this view
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {creating ? (
        <AddPropertyModal
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await registry.reload();
          }}
        />
      ) : null}
    </AppShell>
  );
}

function AddPropertyModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [plan, setPlan] = useState("silver");
  const [type, setType] = useState("apartment");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);

    try {
      await api("/api/developments/", {
        method: "POST",
        body: {
          name: form.get("name"),
          city: form.get("city"),
          district: form.get("district"),
          address_line_1: form.get("address_line_1"),
          syndic_manager_name: form.get("syndic_manager_name"),
          syndic_manager_email: form.get("syndic_manager_email"),
          development_type: type,
          plan_code: plan,
          unit_count: Number(form.get("unit_count") || 0),
          parking_count: Number(form.get("parking_count") || 0),
          storage_count: Number(form.get("storage_count") || 0),
          facility_count: Number(form.get("facility_count") || 0),
          status: "draft",
          pipeline_stage: "prospect",
        },
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the property");
      setSaving(false);
    }
  }

  return (
    <Modal
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving} form="add-property-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <Plus size={13} />}
            {saving ? "Creating..." : "Create property"}
          </button>
        </>
      }
      icon={<Building2 size={17} />}
      onClose={onClose}
      subtitle="Creates the development, its settings, onboarding checklist and a trial subscription"
      title="Add client property"
      wide
    >
      <form id="add-property-form" onSubmit={submit}>
        {error ? <div className="notice notice--er">{error}</div> : null}

        <div className="form-grid">
          <div>
            <label className="label" htmlFor="name">
              Property name
            </label>
            <input className="field" id="name" name="name" required />
          </div>
          <div>
            <label className="label">Development type</label>
            <SelectMenu ariaLabel="Development type" fullWidth onChange={setType} options={TYPE_OPTIONS} shape="field" value={type} />
          </div>
          <div>
            <label className="label" htmlFor="city">
              Town / city
            </label>
            <input className="field" id="city" name="city" />
          </div>
          <div>
            <label className="label" htmlFor="district">
              District
            </label>
            <input className="field" id="district" name="district" />
          </div>
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="address_line_1">
            Address
          </label>
          <input className="field" id="address_line_1" name="address_line_1" />
        </div>

        <div className="form-grid mt-4">
          <div>
            <label className="label" htmlFor="syndic_manager_name">
              Syndic manager
            </label>
            <input className="field" id="syndic_manager_name" name="syndic_manager_name" />
          </div>
          <div>
            <label className="label" htmlFor="syndic_manager_email">
              Syndic manager email
            </label>
            <input className="field" id="syndic_manager_email" name="syndic_manager_email" type="email" />
          </div>
        </div>

        <div className="mt-4">
          <label className="label">Subscription plan</label>
          <SelectMenu ariaLabel="Subscription plan" fullWidth onChange={setPlan} options={PLAN_OPTIONS} shape="field" value={plan} />
        </div>

        <div className="form-grid mt-4">
          <div>
            <label className="label" htmlFor="unit_count">
              Units
            </label>
            <input className="field" defaultValue={0} id="unit_count" min={0} name="unit_count" type="number" />
          </div>
          <div>
            <label className="label" htmlFor="parking_count">
              Parking bays
            </label>
            <input className="field" defaultValue={0} id="parking_count" min={0} name="parking_count" type="number" />
          </div>
          <div>
            <label className="label" htmlFor="storage_count">
              Storage units
            </label>
            <input className="field" defaultValue={0} id="storage_count" min={0} name="storage_count" type="number" />
          </div>
          <div>
            <label className="label" htmlFor="facility_count">
              Facilities
            </label>
            <input className="field" defaultValue={0} id="facility_count" min={0} name="facility_count" type="number" />
          </div>
        </div>
      </form>
    </Modal>
  );
}
