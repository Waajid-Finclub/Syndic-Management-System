"use client";

/**
 * Vendor register.
 *
 * Two kinds of row live here: contractors this development added itself, and
 * platform-wide contractors the operator maintains for every client. The second
 * kind is readable and assignable but not editable, and says so — a client
 * silently editing a shared record would change it for everyone.
 */

import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Truck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { SyndicShell } from "@/components/syndic/shell";
import { api } from "@/lib/api";
import { number } from "@/lib/format";
import { canCreate, canDelete, canEdit, useSyndicApi } from "@/lib/syndic/hooks";
import { useSyndic } from "@/lib/syndic/session";
import type { VendorRow } from "@/lib/syndic/types";

export default function VendorsPage() {
  const { permissions } = useSyndic();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vendors = useSyndicApi<{ vendors: VendorRow[] }>("/api/syndic/vendors");
  const mayEdit = canEdit(permissions, "vendors");
  const mayDelete = canDelete(permissions, "vendors");

  const rows = useMemo(() => {
    const list = vendors.data?.vendors ?? [];
    const term = query.trim().toLowerCase();
    if (!term) return list;
    return list.filter((row) =>
      [row.name, row.trade, row.contact_name, row.contact_phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [vendors.data, query]);

  async function toggleStatus(vendor: VendorRow) {
    setError(null);
    try {
      await api(`/api/syndic/vendors/${vendor.id}`, {
        method: "PATCH",
        body: { status: vendor.status === "active" ? "suspended" : "active" },
      });
      await vendors.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the vendor");
    }
  }

  async function remove(vendor: VendorRow) {
    setError(null);
    try {
      await api(`/api/syndic/vendors/${vendor.id}`, { method: "DELETE" });
      await vendors.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the vendor");
    }
  }

  return (
    <SyndicShell onSearch={setQuery} searchPlaceholder="Search vendors, trades..." searchValue={query}>
      <PageHeader
        title="Vendors"
        subtitle="Contractors this development can assign work to"
        action={
          canCreate(permissions, "vendors") ? (
            <button className="btn btn-primary" onClick={() => setCreating(true)} type="button">
              <Plus size={13} />
              Add vendor
            </button>
          ) : null
        }
      />

      {vendors.error ? <div className="notice notice--er">{vendors.error}</div> : null}
      {error ? <div className="notice notice--er">{error}</div> : null}

      <div className="section">
        <div className="section__header">
          <div>
            <h2 className="section__title">Vendor register</h2>
            <p className="section__sub">
              {rows.length} vendor{rows.length === 1 ? "" : "s"} ·{" "}
              {number(rows.filter((row) => row.is_shared).length)} maintained by the platform
            </p>
          </div>
        </div>
        <div className="section__body section__body--flush">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Trade</th>
                  <th>Contact</th>
                  <th>Phone</th>
                  <th className="right">Open jobs</th>
                  <th className="right">Completed</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((vendor) => (
                  <tr key={vendor.id}>
                    <td className="bold color-cr">
                      {vendor.name}
                      {vendor.is_shared ? <span className="chip ml-2">Platform</span> : null}
                    </td>
                    <td>{vendor.trade ?? "-"}</td>
                    <td>{vendor.contact_name ?? "-"}</td>
                    <td className="mono">{vendor.contact_phone ?? "-"}</td>
                    <td className="right">{number(vendor.open_jobs)}</td>
                    <td className="right">{number(vendor.completed_jobs)}</td>
                    <td>
                      <StatusPill value={vendor.status} />
                    </td>
                    <td className="right">
                      {mayEdit && !vendor.is_shared ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => toggleStatus(vendor)}
                          type="button"
                        >
                          {vendor.status === "active" ? "Suspend" : "Reactivate"}
                        </button>
                      ) : null}
                      {mayDelete && !vendor.is_shared ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => remove(vendor)}
                          type="button"
                        >
                          <Trash2 size={12} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {vendors.loading && !rows.length ? (
                  <tr>
                    <td className="empty-cell" colSpan={8}>
                      Loading vendors...
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {!vendors.loading && !rows.length ? (
        <EmptyState message="No vendors yet — add the contractors you actually call" />
      ) : null}

      {creating ? (
        <VendorModal
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await vendors.reload();
          }}
        />
      ) : null}
    </SyndicShell>
  );
}

function VendorModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api("/api/syndic/vendors", {
        method: "POST",
        body: {
          name: form.get("name"),
          trade: form.get("trade"),
          contact_name: form.get("contact_name"),
          contact_phone: form.get("contact_phone"),
          contact_email: form.get("contact_email"),
        },
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the vendor");
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
          <button className="btn btn-primary" disabled={saving} form="vendor-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <Plus size={13} />}
            Add vendor
          </button>
        </>
      }
      icon={<Truck size={17} />}
      onClose={onClose}
      subtitle="Available to this development only"
      title="Add a vendor"
      wide
    >
      <form id="vendor-form" onSubmit={submit}>
        {error ? <div className="notice notice--er">{error}</div> : null}
        <div className="form-grid">
          <div>
            <label className="label" htmlFor="name">
              Company name
            </label>
            <input className="field" id="name" name="name" required />
          </div>
          <div>
            <label className="label" htmlFor="trade">
              Trade
            </label>
            <input className="field" id="trade" name="trade" placeholder="Plumbing" />
          </div>
          <div>
            <label className="label" htmlFor="contact_name">
              Contact
            </label>
            <input className="field" id="contact_name" name="contact_name" />
          </div>
          <div>
            <label className="label" htmlFor="contact_phone">
              Phone
            </label>
            <input className="field" id="contact_phone" name="contact_phone" />
          </div>
          <div>
            <label className="label" htmlFor="contact_email">
              Email
            </label>
            <input className="field" id="contact_email" name="contact_email" type="email" />
          </div>
        </div>
      </form>
    </Modal>
  );
}
