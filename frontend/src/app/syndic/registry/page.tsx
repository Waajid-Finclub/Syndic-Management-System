"use client";

/**
 * Property registry — blocks, units, parking, storage, facilities.
 *
 * The share meter sits above every tab and never scrolls out of the way. A
 * development's shares must sum to 10,000; an unbalanced total silently
 * corrupts every AGM vote and every service-charge apportionment, and it is the
 * one error here that is expensive to discover late.
 */

import { useMemo, useState } from "react";
import {
  Building2,
  Car,
  Check,
  Download,
  Loader2,
  Package,
  Plus,
  Trash2,
  Waves,
} from "lucide-react";
import { Modal } from "@/components/modal";
import { PageHeader } from "@/components/page-header";
import { SelectMenu } from "@/components/select-menu";
import { StatusPill } from "@/components/status-pill";
import { SyndicShell } from "@/components/syndic/shell";
import { Tabs } from "@/components/tabs";
import { ToggleSwitch } from "@/components/toggle-switch";
import { api, downloadFile } from "@/lib/api";
import { money, number, percent } from "@/lib/format";
import { canCreate, canDelete, canEdit, canExport, useSyndicApi } from "@/lib/syndic/hooks";
import { useSyndic } from "@/lib/syndic/session";
import type {
  Block,
  FacilityRow,
  ParkingBay,
  RegistryMeta,
  StorageRow,
  UnitRow,
  UnitsResponse,
} from "@/lib/syndic/types";

type Tab = "units" | "blocks" | "parking" | "storage" | "facilities";

export default function RegistryPage() {
  const { permissions, development } = useSyndic();
  const [tab, setTab] = useState<Tab>("units");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const meta = useSyndicApi<RegistryMeta>("/api/syndic/registry/meta");
  const units = useSyndicApi<UnitsResponse>("/api/syndic/registry/units");
  const blocks = useSyndicApi<{ blocks: Block[] }>("/api/syndic/registry/blocks");
  const parking = useSyndicApi<{ bays: ParkingBay[]; totals: Record<string, number> }>(
    tab === "parking" ? "/api/syndic/registry/parking" : null,
  );
  const storage = useSyndicApi<{ stores: StorageRow[]; totals: Record<string, number> }>(
    tab === "storage" ? "/api/syndic/registry/storage" : null,
  );
  const facilities = useSyndicApi<{ facilities: FacilityRow[] }>(
    tab === "facilities" ? "/api/syndic/registry/facilities" : null,
  );

  const shares = units.data?.shares;
  const mayCreate = canCreate(permissions, "registry");
  const mayEdit = canEdit(permissions, "registry");
  const mayDelete = canDelete(permissions, "registry");

  const filteredUnits = useMemo(() => {
    const rows = units.data?.units ?? [];
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.label, row.block_name, row.unit_type, ...row.owners.map((owner) => owner.name)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [units.data, query]);

  async function reloadForTab() {
    await units.reload();
    await blocks.reload();
    if (tab === "parking") await parking.reload();
    if (tab === "storage") await storage.reload();
    if (tab === "facilities") await facilities.reload();
  }

  return (
    <SyndicShell
      onSearch={setQuery}
      searchPlaceholder="Search units, owners, bays..."
      searchValue={query}
    >
      <PageHeader
        title="Property Registry"
        subtitle={`${development?.name ?? "This development"} — units, shares, parking, storage and facilities`}
        action={
          <div className="page__actions">
            {canExport(permissions, "registry") ? (
              <button
                className="btn btn-secondary"
                onClick={() =>
                  downloadFile("/api/syndic/registry/export", "unit-registry.csv")
                }
                type="button"
              >
                <Download size={13} />
                Export units
              </button>
            ) : null}
            {mayCreate ? (
              <button className="btn btn-primary" onClick={() => setCreating(true)} type="button">
                <Plus size={13} />
                Add {tab === "units" ? "unit" : tab.replace(/s$/, "")}
              </button>
            ) : null}
          </div>
        }
      />

      {units.error ? <div className="notice notice--er">{units.error}</div> : null}

      {shares ? <ShareMeter shares={shares} /> : null}

      <Tabs
        active={tab}
        items={[
          { key: "units", label: "Units", count: units.data?.units.length },
          { key: "blocks", label: "Blocks", count: blocks.data?.blocks.length },
          { key: "parking", label: "Parking" },
          { key: "storage", label: "Storage" },
          { key: "facilities", label: "Facilities" },
        ]}
        onChange={(next) => setTab(next as Tab)}
      />

      {tab === "units" ? (
        <UnitsTable
          loading={units.loading}
          mayDelete={mayDelete}
          mayEdit={mayEdit}
          onChanged={reloadForTab}
          rows={filteredUnits}
          unitTypes={meta.data?.unit_types ?? []}
          blocks={blocks.data?.blocks ?? []}
        />
      ) : null}

      {tab === "blocks" ? (
        <BlocksTable
          loading={blocks.loading}
          mayDelete={mayDelete}
          onChanged={reloadForTab}
          rows={blocks.data?.blocks ?? []}
        />
      ) : null}

      {tab === "parking" ? (
        <ParkingTable
          loading={parking.loading}
          mayDelete={mayDelete}
          mayEdit={mayEdit}
          onChanged={reloadForTab}
          rows={parking.data?.bays ?? []}
          totals={parking.data?.totals ?? {}}
          units={units.data?.units ?? []}
        />
      ) : null}

      {tab === "storage" ? (
        <StorageTable
          loading={storage.loading}
          mayDelete={mayDelete}
          mayEdit={mayEdit}
          onChanged={reloadForTab}
          rows={storage.data?.stores ?? []}
          units={units.data?.units ?? []}
        />
      ) : null}

      {tab === "facilities" ? (
        <FacilitiesTable
          loading={facilities.loading}
          mayDelete={mayDelete}
          onChanged={reloadForTab}
          rows={facilities.data?.facilities ?? []}
        />
      ) : null}

      {creating ? (
        <CreateModal
          blocks={blocks.data?.blocks ?? []}
          meta={meta.data}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await reloadForTab();
          }}
          shares={shares}
          tab={tab}
          units={units.data?.units ?? []}
        />
      ) : null}
    </SyndicShell>
  );
}

function ShareMeter({ shares }: { shares: UnitsResponse["shares"] }) {
  const filled = Math.min((shares.allocated / shares.target) * 100, 100);
  const over = shares.allocated > shares.target;

  return (
    <>
      <div className="share-meter">
        <div className="share-meter__copy">
          <span className="share-meter__label">Shares allocated</span>
          <span className="share-meter__value">
            {number(shares.allocated)} / {number(shares.target)}
          </span>
        </div>
        <div className="share-meter__track">
          <div
            className={`share-meter__fill ${over ? "share-meter__fill--over" : ""}`}
            style={{ width: `${filled}%` }}
          />
        </div>
        <StatusPill value={shares.is_balanced ? "balanced" : "unbalanced"} />
      </div>

      {!shares.is_balanced ? (
        <div className="notice notice--warn">
          <Building2 size={15} />
          <div>
            <div className="notice__title">
              {shares.remaining > 0
                ? `${number(shares.remaining)} shares still unallocated`
                : `${number(-shares.remaining)} shares over-allocated`}
            </div>
            <div className="notice__sub">
              Every AGM vote is weighted by shares out of {number(shares.target)}, and service
              charges apportioned by share use the same denominator. Until this balances, both
              are computed against an incomplete total.
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// --- Units ------------------------------------------------------------------

function UnitsTable({
  blocks,
  loading,
  mayDelete,
  mayEdit,
  onChanged,
  rows,
  unitTypes,
}: {
  blocks: Block[];
  loading: boolean;
  mayDelete: boolean;
  mayEdit: boolean;
  onChanged: () => Promise<void>;
  rows: UnitRow[];
  unitTypes: string[];
}) {
  const [editing, setEditing] = useState<UnitRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(unit: UnitRow) {
    setError(null);
    try {
      await api(`/api/syndic/registry/units/${unit.id}`, { method: "DELETE" });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the unit");
    }
  }

  return (
    <>
      <div className="section">
        <div className="section__header">
          <div>
            <h2 className="section__title">Units</h2>
            <p className="section__sub">
              {rows.length} unit{rows.length === 1 ? "" : "s"} · share value drives voting and
              apportionment
            </p>
          </div>
        </div>

        {error ? (
          <div className="section__body">
            <div className="notice notice--er">{error}</div>
          </div>
        ) : null}

        <div className="section__body section__body--flush">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Block</th>
                  <th>Type</th>
                  <th className="right">Area</th>
                  <th className="right">Shares</th>
                  <th className="right">%</th>
                  <th className="right">Monthly</th>
                  <th>Co-owner</th>
                  <th className="right">Balance</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((unit) => (
                  <tr key={unit.id}>
                    <td className="bold color-cr">{unit.label}</td>
                    <td>{unit.block_name ?? "-"}</td>
                    <td>{unit.unit_type}</td>
                    <td className="right">{unit.area_sqm ? `${unit.area_sqm} m²` : "-"}</td>
                    <td className="right mono">{number(unit.share_value)}</td>
                    <td className="right">{percent(unit.share_percent, 2)}</td>
                    <td className="right mono">{money(unit.monthly_charge)}</td>
                    <td className="wrap">
                      {unit.owners.length
                        ? unit.owners.map((owner) => owner.name).join(", ")
                        : <span className="color-mt">Unallocated</span>}
                    </td>
                    <td className={`right mono ${unit.balance > 0 ? "color-er" : ""}`}>
                      {unit.balance > 0 ? money(unit.balance) : "-"}
                    </td>
                    <td className="right">
                      {mayEdit ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setEditing(unit)}
                          type="button"
                        >
                          Edit
                        </button>
                      ) : null}
                      {mayDelete ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => remove(unit)}
                          type="button"
                        >
                          <Trash2 size={12} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {loading && !rows.length ? (
                  <tr>
                    <td className="empty-cell" colSpan={10}>
                      Loading units...
                    </td>
                  </tr>
                ) : null}
                {!loading && !rows.length ? (
                  <tr>
                    <td className="empty-cell" colSpan={10}>
                      No units yet. Add the first one to start the registry.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editing ? (
        <EditUnitModal
          blocks={blocks}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await onChanged();
          }}
          unit={editing}
          unitTypes={unitTypes}
        />
      ) : null}
    </>
  );
}

function EditUnitModal({
  blocks,
  onClose,
  onSaved,
  unit,
  unitTypes,
}: {
  blocks: Block[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  unit: UnitRow;
  unitTypes: string[];
}) {
  const [unitType, setUnitType] = useState(unit.unit_type);
  const [blockId, setBlockId] = useState(unit.block_id ? String(unit.block_id) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api(`/api/syndic/registry/units/${unit.id}`, {
        method: "PATCH",
        body: {
          label: form.get("label"),
          unit_type: unitType,
          block_id: blockId ? Number(blockId) : null,
          floor: form.get("floor") ? Number(form.get("floor")) : null,
          area_sqm: form.get("area_sqm") || null,
          share_value: Number(form.get("share_value") || 0),
          monthly_charge: form.get("monthly_charge") || 0,
        },
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the unit");
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
          <button className="btn btn-primary" disabled={saving} form="unit-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
            Save unit
          </button>
        </>
      }
      icon={<Building2 size={17} />}
      onClose={onClose}
      subtitle={`${unit.owners.length ? unit.owners.map((o) => o.name).join(", ") : "No co-owner allocated"}`}
      title={`Unit ${unit.label}`}
      wide
    >
      <form id="unit-form" onSubmit={submit}>
        {error ? <div className="notice notice--er">{error}</div> : null}

        <div className="form-grid">
          <div>
            <label className="label" htmlFor="label">
              Unit number
            </label>
            <input className="field" defaultValue={unit.label} id="label" name="label" required />
          </div>
          <div>
            <label className="label">Type</label>
            <SelectMenu
              ariaLabel="Unit type"
              fullWidth
              onChange={setUnitType}
              options={unitTypes.map((type) => ({ value: type, label: type }))}
              shape="field"
              value={unitType}
            />
          </div>
          <div>
            <label className="label">Block</label>
            <SelectMenu
              ariaLabel="Block"
              fullWidth
              onChange={setBlockId}
              options={blocks.map((block) => ({ value: String(block.id), label: block.name }))}
              placeholder="No block"
              shape="field"
              value={blockId}
            />
          </div>
          <div>
            <label className="label" htmlFor="floor">
              Floor
            </label>
            <input className="field" defaultValue={unit.floor ?? ""} id="floor" name="floor" type="number" />
          </div>
          <div>
            <label className="label" htmlFor="area_sqm">
              Area (m²)
            </label>
            <input
              className="field"
              defaultValue={unit.area_sqm ?? ""}
              id="area_sqm"
              name="area_sqm"
              step="0.01"
              type="number"
            />
          </div>
          <div>
            <label className="label" htmlFor="share_value">
              Share value
            </label>
            <input
              className="field"
              defaultValue={unit.share_value}
              id="share_value"
              min={0}
              name="share_value"
              type="number"
            />
          </div>
          <div>
            <label className="label" htmlFor="monthly_charge">
              Monthly service charge
            </label>
            <input
              className="field"
              defaultValue={unit.monthly_charge}
              id="monthly_charge"
              min={0}
              name="monthly_charge"
              step="0.01"
              type="number"
            />
          </div>
        </div>

        <div className="notice notice--info mt-4">
          <Building2 size={15} />
          <div>
            <div className="notice__title">Changing the share value is audited</div>
            <div className="notice__sub">
              Shares are the weight of this unit&apos;s vote. A change is recorded with its
              before and after values, and votes already cast keep the weight they carried when
              they were cast.
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// --- Blocks -----------------------------------------------------------------

function BlocksTable({
  loading,
  mayDelete,
  onChanged,
  rows,
}: {
  loading: boolean;
  mayDelete: boolean;
  onChanged: () => Promise<void>;
  rows: Block[];
}) {
  const [error, setError] = useState<string | null>(null);

  async function remove(block: Block) {
    setError(null);
    try {
      await api(`/api/syndic/registry/blocks/${block.id}`, { method: "DELETE" });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the block");
    }
  }

  return (
    <div className="section">
      <div className="section__header">
        <div>
          <h2 className="section__title">Blocks</h2>
          <p className="section__sub">Buildings within this development</p>
        </div>
      </div>
      {error ? (
        <div className="section__body">
          <div className="notice notice--er">{error}</div>
        </div>
      ) : null}
      <div className="section__body section__body--flush">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Block</th>
                <th className="right">Floors</th>
                <th className="right">Units</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((block) => (
                <tr key={block.id}>
                  <td className="bold color-cr">{block.name}</td>
                  <td className="right">{block.floors}</td>
                  <td className="right">{number(block.unit_count ?? 0)}</td>
                  <td className="right">
                    {mayDelete ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => remove(block)} type="button">
                        <Trash2 size={12} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!loading && !rows.length ? (
                <tr>
                  <td className="empty-cell" colSpan={4}>
                    No blocks. A single-building development can leave this empty.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Parking ----------------------------------------------------------------

function ParkingTable({
  loading,
  mayDelete,
  mayEdit,
  onChanged,
  rows,
  totals,
  units,
}: {
  loading: boolean;
  mayDelete: boolean;
  mayEdit: boolean;
  onChanged: () => Promise<void>;
  rows: ParkingBay[];
  totals: Record<string, number>;
  units: UnitRow[];
}) {
  const [error, setError] = useState<string | null>(null);

  async function allocate(bay: ParkingBay, unitId: string) {
    setError(null);
    try {
      await api(`/api/syndic/registry/parking/${bay.id}`, {
        method: "PATCH",
        body: { unit_id: unitId ? Number(unitId) : null },
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not allocate the bay");
    }
  }

  async function remove(bay: ParkingBay) {
    setError(null);
    try {
      await api(`/api/syndic/registry/parking/${bay.id}`, { method: "DELETE" });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the bay");
    }
  }

  return (
    <div className="section">
      <div className="section__header">
        <div>
          <h2 className="section__title">Parking</h2>
          <p className="section__sub">
            {number(totals.total ?? 0)} bays · {number(totals.ev ?? 0)} EV ·{" "}
            {number(totals.allocated ?? 0)} allocated · {number(totals.visitor ?? 0)} visitor
          </p>
        </div>
      </div>
      {error ? (
        <div className="section__body">
          <div className="notice notice--er">{error}</div>
        </div>
      ) : null}
      <div className="section__body section__body--flush">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bay</th>
                <th>Level</th>
                <th>Allocation</th>
                <th>Unit</th>
                <th>EV</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((bay) => (
                <tr key={bay.id}>
                  <td className="bold color-cr">{bay.code}</td>
                  <td>{bay.level ?? "-"}</td>
                  <td>
                    <StatusPill value={bay.allocation} />
                  </td>
                  <td>
                    {mayEdit ? (
                      <SelectMenu
                        ariaLabel={`Unit for bay ${bay.code}`}
                        onChange={(value) => allocate(bay, value)}
                        options={units.map((unit) => ({
                          value: String(unit.id),
                          label: unit.label,
                        }))}
                        placeholder="Unallocated"
                        size="sm"
                        value={bay.unit_id ? String(bay.unit_id) : ""}
                      />
                    ) : (
                      bay.unit_label ?? "-"
                    )}
                  </td>
                  <td>
                    {bay.is_ev
                      ? `${bay.charger_kw ?? "?"} kW${bay.charger_type ? ` ${bay.charger_type}` : ""}`
                      : "-"}
                  </td>
                  <td>
                    <StatusPill value={bay.status} />
                  </td>
                  <td className="right">
                    {mayDelete ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => remove(bay)} type="button">
                        <Trash2 size={12} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!loading && !rows.length ? (
                <tr>
                  <td className="empty-cell" colSpan={7}>
                    No parking bays recorded
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Storage ----------------------------------------------------------------

function StorageTable({
  loading,
  mayDelete,
  mayEdit,
  onChanged,
  rows,
  units,
}: {
  loading: boolean;
  mayDelete: boolean;
  mayEdit: boolean;
  onChanged: () => Promise<void>;
  rows: StorageRow[];
  units: UnitRow[];
}) {
  const [error, setError] = useState<string | null>(null);

  async function allocate(store: StorageRow, unitId: string) {
    setError(null);
    try {
      await api(`/api/syndic/registry/storage/${store.id}`, {
        method: "PATCH",
        body: { unit_id: unitId ? Number(unitId) : null },
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not allocate the store");
    }
  }

  return (
    <div className="section">
      <div className="section__header">
        <div>
          <h2 className="section__title">Storage</h2>
          <p className="section__sub">{rows.length} store rooms</p>
        </div>
      </div>
      {error ? (
        <div className="section__body">
          <div className="notice notice--er">{error}</div>
        </div>
      ) : null}
      <div className="section__body section__body--flush">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Level</th>
                <th className="right">Area</th>
                <th>Allocation</th>
                <th>Unit</th>
                <th>Access</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((store) => (
                <tr key={store.id}>
                  <td className="bold color-cr">{store.code}</td>
                  <td>{store.level ?? "-"}</td>
                  <td className="right">{store.area_sqm ? `${store.area_sqm} m²` : "-"}</td>
                  <td>
                    <StatusPill value={store.allocation} />
                  </td>
                  <td>
                    {mayEdit ? (
                      <SelectMenu
                        ariaLabel={`Unit for store ${store.code}`}
                        onChange={(value) => allocate(store, value)}
                        options={units.map((unit) => ({
                          value: String(unit.id),
                          label: unit.label,
                        }))}
                        placeholder="Unallocated"
                        size="sm"
                        value={store.unit_id ? String(store.unit_id) : ""}
                      />
                    ) : (
                      store.unit_label ?? "-"
                    )}
                  </td>
                  <td>{store.access_method ?? "-"}</td>
                  <td className="right">
                    {mayDelete ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={async () => {
                          await api(`/api/syndic/registry/storage/${store.id}`, { method: "DELETE" });
                          await onChanged();
                        }}
                        type="button"
                      >
                        <Trash2 size={12} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!loading && !rows.length ? (
                <tr>
                  <td className="empty-cell" colSpan={7}>
                    No storage units recorded
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Facilities -------------------------------------------------------------

function FacilitiesTable({
  loading,
  mayDelete,
  onChanged,
  rows,
}: {
  loading: boolean;
  mayDelete: boolean;
  onChanged: () => Promise<void>;
  rows: FacilityRow[];
}) {
  return (
    <div className="section">
      <div className="section__header">
        <div>
          <h2 className="section__title">Facilities</h2>
          <p className="section__sub">
            Common amenities — what appears in the co-owner&apos;s booking screen
          </p>
        </div>
      </div>
      <div className="section__body section__body--flush">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Facility</th>
                <th>Type</th>
                <th>Hours</th>
                <th>Booking</th>
                <th className="right">Rate</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((facility) => (
                <tr key={facility.id}>
                  <td className="bold color-cr">{facility.name}</td>
                  <td>{facility.facility_type}</td>
                  <td>{facility.hours_label ?? "-"}</td>
                  <td>{facility.booking_required ? `${facility.slot_hours}h slots` : "Open access"}</td>
                  <td className="right mono">
                    {facility.booking_rate ? money(facility.booking_rate) : "Free"}
                  </td>
                  <td>
                    <StatusPill value={facility.status} />
                  </td>
                  <td className="right">
                    {mayDelete ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={async () => {
                          await api(`/api/syndic/registry/facilities/${facility.id}`, {
                            method: "DELETE",
                          });
                          await onChanged();
                        }}
                        type="button"
                      >
                        <Trash2 size={12} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!loading && !rows.length ? (
                <tr>
                  <td className="empty-cell" colSpan={7}>
                    No facilities recorded
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Create -----------------------------------------------------------------

function CreateModal({
  blocks,
  meta,
  onClose,
  onSaved,
  shares,
  tab,
  units,
}: {
  blocks: Block[];
  meta: RegistryMeta | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  shares?: UnitsResponse["shares"];
  tab: Tab;
  units: UnitRow[];
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unitType, setUnitType] = useState(meta?.unit_types?.[2] ?? "T2");
  const [blockId, setBlockId] = useState("");
  const [allocation, setAllocation] = useState("owner");
  const [unitId, setUnitId] = useState("");
  const [isEv, setIsEv] = useState(false);
  const [facilityType, setFacilityType] = useState(meta?.facility_types?.[0]?.key ?? "pool");

  const config: Record<Tab, { path: string; title: string; icon: React.ReactNode }> = {
    units: { path: "/api/syndic/registry/units", title: "Add a unit", icon: <Building2 size={17} /> },
    blocks: { path: "/api/syndic/registry/blocks", title: "Add a block", icon: <Building2 size={17} /> },
    parking: { path: "/api/syndic/registry/parking", title: "Add a parking bay", icon: <Car size={17} /> },
    storage: { path: "/api/syndic/registry/storage", title: "Add a store room", icon: <Package size={17} /> },
    facilities: {
      path: "/api/syndic/registry/facilities",
      title: "Add a facility",
      icon: <Waves size={17} />,
    },
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);

    const bodies: Record<Tab, Record<string, unknown>> = {
      units: {
        label: form.get("label"),
        unit_type: unitType,
        block_id: blockId ? Number(blockId) : null,
        floor: form.get("floor") ? Number(form.get("floor")) : null,
        area_sqm: form.get("area_sqm") || null,
        share_value: Number(form.get("share_value") || 0),
        monthly_charge: form.get("monthly_charge") || 0,
      },
      blocks: { name: form.get("name"), floors: Number(form.get("floors") || 1) },
      parking: {
        code: form.get("code"),
        level: form.get("level"),
        allocation,
        unit_id: unitId ? Number(unitId) : null,
        is_ev: isEv,
        charger_kw: form.get("charger_kw") || null,
        charger_type: form.get("charger_type") || null,
        tariff_per_kwh: form.get("tariff_per_kwh") || null,
      },
      storage: {
        code: form.get("code"),
        level: form.get("level"),
        area_sqm: form.get("area_sqm") || null,
        allocation,
        unit_id: unitId ? Number(unitId) : null,
        access_method: form.get("access_method"),
      },
      facilities: {
        name: form.get("name"),
        facility_type: facilityType,
        hours_label: form.get("hours_label"),
        detail: form.get("detail"),
        booking_required: true,
        slot_hours: Number(form.get("slot_hours") || 2),
        booking_rate: form.get("booking_rate") || null,
      },
    };

    try {
      await api(config[tab].path, { method: "POST", body: bodies[tab] });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  const unitOptions = units.map((unit) => ({ value: String(unit.id), label: unit.label }));

  return (
    <Modal
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving} form="registry-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <Plus size={13} />}
            Add
          </button>
        </>
      }
      icon={config[tab].icon}
      onClose={onClose}
      title={config[tab].title}
      wide
    >
      <form id="registry-form" onSubmit={submit}>
        {error ? <div className="notice notice--er">{error}</div> : null}

        {tab === "units" ? (
          <>
            <div className="form-grid">
              <div>
                <label className="label" htmlFor="label">
                  Unit number
                </label>
                <input className="field" id="label" name="label" placeholder="A-103" required />
              </div>
              <div>
                <label className="label">Type</label>
                <SelectMenu
                  ariaLabel="Unit type"
                  fullWidth
                  onChange={setUnitType}
                  options={(meta?.unit_types ?? []).map((type) => ({ value: type, label: type }))}
                  shape="field"
                  value={unitType}
                />
              </div>
              <div>
                <label className="label">Block</label>
                <SelectMenu
                  ariaLabel="Block"
                  fullWidth
                  onChange={setBlockId}
                  options={blocks.map((block) => ({ value: String(block.id), label: block.name }))}
                  placeholder="No block"
                  shape="field"
                  value={blockId}
                />
              </div>
              <div>
                <label className="label" htmlFor="floor">
                  Floor
                </label>
                <input className="field" id="floor" name="floor" type="number" />
              </div>
              <div>
                <label className="label" htmlFor="area_sqm">
                  Area (m²)
                </label>
                <input className="field" id="area_sqm" name="area_sqm" step="0.01" type="number" />
              </div>
              <div>
                <label className="label" htmlFor="share_value">
                  Share value
                </label>
                <input
                  className="field"
                  defaultValue={0}
                  id="share_value"
                  max={shares?.remaining ?? undefined}
                  min={0}
                  name="share_value"
                  type="number"
                />
              </div>
              <div>
                <label className="label" htmlFor="monthly_charge">
                  Monthly service charge
                </label>
                <input
                  className="field"
                  defaultValue={0}
                  id="monthly_charge"
                  min={0}
                  name="monthly_charge"
                  step="0.01"
                  type="number"
                />
              </div>
            </div>
            {shares ? (
              <p className="mt-3 text-xs font-medium text-[var(--cmt)]">
                {number(shares.remaining)} of {number(shares.target)} shares are still
                unallocated.
              </p>
            ) : null}
          </>
        ) : null}

        {tab === "blocks" ? (
          <div className="form-grid">
            <div>
              <label className="label" htmlFor="name">
                Block name
              </label>
              <input className="field" id="name" name="name" placeholder="Block A" required />
            </div>
            <div>
              <label className="label" htmlFor="floors">
                Floors
              </label>
              <input className="field" defaultValue={1} id="floors" min={1} name="floors" type="number" />
            </div>
          </div>
        ) : null}

        {tab === "parking" || tab === "storage" ? (
          <>
            <div className="form-grid">
              <div>
                <label className="label" htmlFor="code">
                  {tab === "parking" ? "Bay code" : "Store code"}
                </label>
                <input
                  className="field"
                  id="code"
                  name="code"
                  placeholder={tab === "parking" ? "B-12" : "S-07"}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="level">
                  Level
                </label>
                <input className="field" id="level" name="level" placeholder="B1" />
              </div>
              <div>
                <label className="label">Allocation</label>
                <SelectMenu
                  ariaLabel="Allocation"
                  fullWidth
                  onChange={setAllocation}
                  options={(meta?.allocation_types ?? []).map((type) => ({
                    value: type,
                    label: type,
                  }))}
                  shape="field"
                  value={allocation}
                />
              </div>
              <div>
                <label className="label">Allocated to unit</label>
                <SelectMenu
                  ariaLabel="Unit"
                  fullWidth
                  onChange={setUnitId}
                  options={unitOptions}
                  placeholder="Unallocated"
                  shape="field"
                  value={unitId}
                />
              </div>
            </div>

            {tab === "storage" ? (
              <div className="form-grid mt-4">
                <div>
                  <label className="label" htmlFor="area_sqm">
                    Area (m²)
                  </label>
                  <input className="field" id="area_sqm" name="area_sqm" step="0.01" type="number" />
                </div>
                <div>
                  <label className="label" htmlFor="access_method">
                    Access
                  </label>
                  <input className="field" id="access_method" name="access_method" placeholder="Fob access" />
                </div>
              </div>
            ) : null}

            {tab === "parking" ? (
              <>
                <div className="wa-toggle-row mt-4">
                  <ToggleSwitch label="EV charging bay" on={isEv} onChange={setIsEv} />
                  <span className="text-sm font-semibold">EV charging bay</span>
                </div>
                {isEv ? (
                  <div className="form-grid mt-3">
                    <div>
                      <label className="label" htmlFor="charger_kw">
                        Charger (kW)
                      </label>
                      <input className="field" id="charger_kw" name="charger_kw" step="0.1" type="number" />
                    </div>
                    <div>
                      <label className="label" htmlFor="charger_type">
                        Charger type
                      </label>
                      <input className="field" id="charger_type" name="charger_type" placeholder="AC" />
                    </div>
                    <div>
                      <label className="label" htmlFor="tariff_per_kwh">
                        Tariff per kWh
                      </label>
                      <input
                        className="field"
                        id="tariff_per_kwh"
                        name="tariff_per_kwh"
                        step="0.01"
                        type="number"
                      />
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {tab === "facilities" ? (
          <div className="form-grid">
            <div>
              <label className="label" htmlFor="name">
                Facility name
              </label>
              <input className="field" id="name" name="name" placeholder="Swimming Pool" required />
            </div>
            <div>
              <label className="label">Type</label>
              <SelectMenu
                ariaLabel="Facility type"
                fullWidth
                onChange={setFacilityType}
                options={(meta?.facility_types ?? []).map((type) => ({
                  value: type.key,
                  label: type.label,
                }))}
                shape="field"
                value={facilityType}
              />
            </div>
            <div>
              <label className="label" htmlFor="hours_label">
                Hours
              </label>
              <input className="field" id="hours_label" name="hours_label" placeholder="6am-8pm daily" />
            </div>
            <div>
              <label className="label" htmlFor="detail">
                Detail
              </label>
              <input className="field" id="detail" name="detail" placeholder="25m heated pool" />
            </div>
            <div>
              <label className="label" htmlFor="slot_hours">
                Booking slot (hours)
              </label>
              <input className="field" defaultValue={2} id="slot_hours" min={1} name="slot_hours" type="number" />
            </div>
            <div>
              <label className="label" htmlFor="booking_rate">
                Booking rate
              </label>
              <input className="field" id="booking_rate" name="booking_rate" step="0.01" type="number" />
            </div>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
