"use client";

/**
 * Maintenance queue.
 *
 * Ordered by what needs a decision rather than by date: unassigned work first
 * in the counters, then urgency. Advancing a request is done inline from the
 * row where possible, because a manager working a queue of forty jobs should
 * not have to open forty screens.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, Loader2, Plus, Wrench } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { PageHeader } from "@/components/page-header";
import { SelectMenu } from "@/components/select-menu";
import { MetricTile } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { SyndicShell } from "@/components/syndic/shell";
import { Tabs } from "@/components/tabs";
import { api, downloadFile } from "@/lib/api";
import { number, relativeTime } from "@/lib/format";
import { canCreate, canEdit, canExport, useSyndicApi } from "@/lib/syndic/hooks";
import { useSyndic } from "@/lib/syndic/session";
import type { MaintenanceMeta, MaintenanceRow, UnitsResponse } from "@/lib/syndic/types";

type Filter = "open" | "all" | "resolved" | "closed";

export default function MaintenancePage() {
  const { permissions } = useSyndic();
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const meta = useSyndicApi<MaintenanceMeta>("/api/syndic/maintenance/meta");
  const queue = useSyndicApi<{
    requests: MaintenanceRow[];
    counts: { open: number; urgent: number; unassigned: number; awaiting_close: number };
  }>(`/api/syndic/maintenance?status=${filter}`);
  const units = useSyndicApi<UnitsResponse>("/api/syndic/registry/units");

  const mayEdit = canEdit(permissions, "maintenance");

  const rows = useMemo(() => {
    const list = queue.data?.requests ?? [];
    const term = query.trim().toLowerCase();
    if (!term) return list;
    return list.filter((row) =>
      [row.reference, row.title, row.unit_label, row.vendor_name, row.category_label]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [queue.data, query]);

  return (
    <SyndicShell
      onSearch={setQuery}
      searchPlaceholder="Search reference, issue, unit, vendor..."
      searchValue={query}
    >
      <PageHeader
        title="Maintenance"
        subtitle="Issues reported by co-owners and logged by the office"
        action={
          <div className="page__actions">
            {canExport(permissions, "maintenance") ? (
              <button
                className="btn btn-secondary"
                onClick={() => downloadFile("/api/syndic/maintenance/export", "maintenance.csv")}
                type="button"
              >
                <Download size={13} />
                Export
              </button>
            ) : null}
            {canCreate(permissions, "maintenance") ? (
              <button className="btn btn-primary" onClick={() => setCreating(true)} type="button">
                <Plus size={13} />
                Log a job
              </button>
            ) : null}
          </div>
        }
      />

      {queue.error ? <div className="notice notice--er">{queue.error}</div> : null}

      {queue.data ? (
        <div className="metric-strip">
          <MetricTile center label="Open" value={number(queue.data.counts.open)} />
          <MetricTile
            center
            label="Urgent or emergency"
            tone={queue.data.counts.urgent > 0 ? "var(--er)" : undefined}
            value={number(queue.data.counts.urgent)}
          />
          <MetricTile
            center
            label="Unassigned"
            sub="No vendor yet"
            tone={queue.data.counts.unassigned > 0 ? "var(--wn)" : undefined}
            value={number(queue.data.counts.unassigned)}
          />
          <MetricTile
            center
            label="Awaiting close"
            sub="Completed, not yet closed"
            value={number(queue.data.counts.awaiting_close)}
          />
        </div>
      ) : null}

      <Tabs
        active={filter}
        items={[
          { key: "open", label: "Open" },
          { key: "resolved", label: "Completed" },
          { key: "closed", label: "Closed" },
          { key: "all", label: "All" },
        ]}
        onChange={(next) => setFilter(next as Filter)}
      />

      <div className="section">
        <div className="section__header">
          <div>
            <h2 className="section__title">Request queue</h2>
            <p className="section__sub">
              {rows.length} request{rows.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="section__body section__body--flush">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Raised</th>
                  <th>Unit</th>
                  <th>Category</th>
                  <th>Issue</th>
                  <th>Priority</th>
                  <th>Vendor</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="mono">
                      <Link className="font-semibold" href={`/syndic/maintenance/${row.id}`}>
                        {row.reference}
                      </Link>
                    </td>
                    <td>{relativeTime(row.created_at)}</td>
                    <td className="bold color-cr">{row.unit_label ?? "Common"}</td>
                    <td>{row.category_label}</td>
                    <td className="wrap">{row.title}</td>
                    <td>
                      <StatusPill value={row.priority} />
                    </td>
                    <td>{row.vendor_name ?? <span className="color-mt">Unassigned</span>}</td>
                    <td>
                      <StatusPill value={row.status} />
                    </td>
                    <td className="right">
                      {mayEdit ? (
                        <InlineAssign
                          onDone={() => queue.reload()}
                          row={row}
                          vendors={meta.data?.vendors ?? []}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
                {queue.loading && !rows.length ? (
                  <tr>
                    <td className="empty-cell" colSpan={9}>
                      Loading requests...
                    </td>
                  </tr>
                ) : null}
                {!queue.loading && !rows.length ? (
                  <tr>
                    <td className="empty-cell" colSpan={9}>
                      Nothing in this view
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {!queue.loading && !rows.length && filter === "open" ? (
        <EmptyState message="No open maintenance requests — the building is quiet" />
      ) : null}

      {creating ? (
        <LogJobModal
          categories={meta.data?.categories ?? []}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await queue.reload();
          }}
          priorities={meta.data?.priorities ?? []}
          units={units.data?.units ?? []}
        />
      ) : null}
    </SyndicShell>
  );
}

/**
 * Assign a vendor without leaving the queue.
 *
 * The API refuses to move a job to "assigned" without one, so offering the
 * vendor here is what turns the unassigned counter into something a manager
 * can actually clear.
 */
function InlineAssign({
  onDone,
  row,
  vendors,
}: {
  onDone: () => void;
  row: MaintenanceRow;
  vendors: { id: number; name: string; status: string }[];
}) {
  const [busy, setBusy] = useState(false);

  async function assign(vendorId: string) {
    setBusy(true);
    try {
      await api(`/api/syndic/maintenance/${row.id}`, {
        method: "PATCH",
        body: {
          vendor_id: vendorId ? Number(vendorId) : null,
          ...(row.status === "open" || row.status === "acknowledged"
            ? { status: "assigned" }
            : {}),
        },
      });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  if (!row.is_open) return null;

  return busy ? (
    <Loader2 className="animate-spin" size={13} />
  ) : (
    <SelectMenu
      ariaLabel={`Assign a vendor to ${row.reference}`}
      onChange={assign}
      options={vendors
        .filter((vendor) => vendor.status === "active")
        .map((vendor) => ({ value: String(vendor.id), label: vendor.name }))}
      placeholder="Assign"
      size="sm"
      value={row.vendor_id ? String(row.vendor_id) : ""}
    />
  );
}

function LogJobModal({
  categories,
  onClose,
  onSaved,
  priorities,
  units,
}: {
  categories: { key: string; label: string }[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  priorities: { key: string; label: string }[];
  units: UnitsResponse["units"];
}) {
  const [category, setCategory] = useState("other");
  const [priority, setPriority] = useState("normal");
  const [unitId, setUnitId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api("/api/syndic/maintenance", {
        method: "POST",
        body: {
          title: form.get("title"),
          description: form.get("description"),
          location_label: form.get("location_label"),
          category,
          priority,
          unit_id: unitId ? Number(unitId) : null,
        },
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log the job");
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
          <button className="btn btn-primary" disabled={saving} form="job-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <Plus size={13} />}
            Log job
          </button>
        </>
      }
      icon={<Wrench size={17} />}
      onClose={onClose}
      subtitle="For a common-area fault the office noticed before anyone reported it"
      title="Log a maintenance job"
      wide
    >
      <form id="job-form" onSubmit={submit}>
        {error ? <div className="notice notice--er">{error}</div> : null}

        <div className="form-grid">
          <div>
            <label className="label" htmlFor="title">
              Issue
            </label>
            <input className="field" id="title" name="title" placeholder="Lift 2 stuck on level 3" required />
          </div>
          <div>
            <label className="label">Category</label>
            <SelectMenu
              ariaLabel="Category"
              fullWidth
              onChange={setCategory}
              options={categories.map((entry) => ({ value: entry.key, label: entry.label }))}
              shape="field"
              value={category}
            />
          </div>
          <div>
            <label className="label">Priority</label>
            <SelectMenu
              ariaLabel="Priority"
              fullWidth
              onChange={setPriority}
              options={priorities.map((entry) => ({ value: entry.key, label: entry.label }))}
              shape="field"
              value={priority}
            />
          </div>
          <div>
            <label className="label">Unit (optional)</label>
            <SelectMenu
              ariaLabel="Unit"
              fullWidth
              onChange={setUnitId}
              options={units.map((unit) => ({ value: String(unit.id), label: unit.label }))}
              placeholder="Common area"
              shape="field"
              value={unitId}
            />
          </div>
          <div>
            <label className="label" htmlFor="location_label">
              Location
            </label>
            <input className="field" id="location_label" name="location_label" placeholder="Parking B1" />
          </div>
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="description">
            Description
          </label>
          <textarea className="field" id="description" name="description" rows={4} />
        </div>
      </form>
    </Modal>
  );
}
