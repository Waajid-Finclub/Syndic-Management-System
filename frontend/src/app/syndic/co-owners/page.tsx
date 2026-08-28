"use client";

/**
 * Co-owner accounts — where a syndic allocates layer 3 access.
 *
 * The screen is organised around the question a manager actually has, which is
 * "which units still have nobody attached", not "list the accounts". So the
 * unallocated-units count is a headline figure, the invitation form defaults to
 * the first vacant unit, and the CSV template downloads pre-filled with exactly
 * the units that are missing an owner.
 *
 * Invitation codes are shown in full. They are single-use, expiring and bound
 * to one email address, and the manager reading one aloud over the phone is the
 * normal case rather than the exception.
 */

import { useMemo, useState } from "react";
import {
  Ban,
  Building2,
  Check,
  CircleSlash,
  Download,
  KeyRound,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Send,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { PageHeader } from "@/components/page-header";
import { SelectMenu } from "@/components/select-menu";
import { Section } from "@/components/section";
import { MetricTile } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { SyndicShell } from "@/components/syndic/shell";
import { Tabs } from "@/components/tabs";
import { api, downloadFile } from "@/lib/api";
import { formatDate, number, relativeTime } from "@/lib/format";
import { canCreate, canDelete, canEdit, useSyndicApi } from "@/lib/syndic/hooks";
import { useSyndic } from "@/lib/syndic/session";
import type {
  AllocatableUnit,
  CoOwnerAccount,
  CoOwnersResponse,
  ImportResult,
  InvitationRow,
  Occupancy,
} from "@/lib/syndic/types";

type Tab = "accounts" | "invitations" | "occupancy";

export default function CoOwnersPage() {
  const { permissions } = useSyndic();
  const [tab, setTab] = useState<Tab>("accounts");
  const [query, setQuery] = useState("");
  const [inviting, setInviting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const registry = useSyndicApi<CoOwnersResponse>("/api/syndic/co-owners");
  const occupancy = useSyndicApi<{ occupancy: Occupancy[] }>(
    tab === "occupancy" ? "/api/syndic/co-owners/occupancy" : null,
  );

  const data = registry.data;
  const counts = data?.counts;
  const mayInvite = canCreate(permissions, "co_owners");

  const accounts = useMemo(() => {
    const rows = data?.co_owners ?? [];
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.name, row.email, row.unit_label, ...row.units.map((unit) => unit.unit_label)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [data, query]);

  const invitations = useMemo(() => {
    const rows = data?.invitations ?? [];
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.email, row.unit_label, row.code]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [data, query]);

  const vacantUnits = (data?.units ?? []).filter((unit) => !unit.has_owner);

  async function reloadAll() {
    await registry.reload();
    if (tab === "occupancy") await occupancy.reload();
  }

  return (
    <SyndicShell
      onSearch={setQuery}
      searchPlaceholder="Search name, email, unit, code..."
      searchValue={query}
    >
      <PageHeader
        title="Co-Owners"
        subtitle="Allocate resident-app access against the unit registry"
        action={
          mayInvite ? (
            <div className="page__actions">
              <button className="btn btn-secondary" onClick={() => setImporting(true)} type="button">
                <Upload size={13} />
                CSV import
              </button>
              <button className="btn btn-primary" onClick={() => setInviting(true)} type="button">
                <UserPlus size={13} />
                Invite co-owner
              </button>
            </div>
          ) : null
        }
      />

      {registry.error ? <div className="notice notice--er">{registry.error}</div> : null}
      {banner ? (
        <div className="notice notice--ok">
          <Check size={15} />
          <div>
            <div className="notice__title">Done</div>
            <div className="notice__sub">{banner}</div>
          </div>
        </div>
      ) : null}

      {counts ? (
        <div className="metric-strip">
          <MetricTile center label="Accounts" value={number(counts.accounts)} />
          <MetricTile center label="Active" value={number(counts.active)} />
          <MetricTile center label="Suspended" value={number(counts.suspended)} />
          <MetricTile center label="Open invitations" value={number(counts.pending_invitations)} />
          <MetricTile
            center
            label="Units without an owner"
            sub={`of ${number(counts.units)} units`}
            tone={counts.units_without_owner > 0 ? "var(--wn)" : undefined}
            value={number(counts.units_without_owner)}
          />
        </div>
      ) : null}

      {counts && counts.units === 0 ? (
        <div className="notice notice--warn">
          <Building2 size={15} />
          <div>
            <div className="notice__title">No units to allocate against</div>
            <div className="notice__sub">
              A co-owner account is bound to a unit, so the Property Registry has to come
              first. Add blocks and units, then return here.
            </div>
          </div>
        </div>
      ) : null}

      <Tabs
        active={tab}
        items={[
          { key: "accounts", label: "Accounts", count: accounts.length },
          { key: "invitations", label: "Invitations", count: invitations.length },
          { key: "occupancy", label: "Occupancy" },
        ]}
        onChange={(next) => setTab(next as Tab)}
      />

      {tab === "accounts" ? (
        <AccountsTable
          accounts={accounts}
          loading={registry.loading}
          mayEdit={canEdit(permissions, "co_owners")}
          mayDelete={canDelete(permissions, "co_owners")}
          onChanged={reloadAll}
        />
      ) : null}

      {tab === "invitations" ? (
        <InvitationsTable
          invitations={invitations}
          loading={registry.loading}
          mayEdit={canEdit(permissions, "co_owners")}
          mayDelete={canDelete(permissions, "co_owners")}
          onChanged={reloadAll}
        />
      ) : null}

      {tab === "occupancy" ? (
        <OccupancyTable
          data={occupancy.data?.occupancy ?? []}
          loading={occupancy.loading}
          mayCreate={mayInvite}
          onChanged={() => occupancy.reload()}
          units={data?.units ?? []}
        />
      ) : null}

      {inviting ? (
        <InviteModal
          onClose={() => setInviting(false)}
          onSaved={async (message) => {
            setInviting(false);
            setBanner(message);
            await reloadAll();
          }}
          units={data?.units ?? []}
          vacantUnits={vacantUnits}
        />
      ) : null}

      {importing ? (
        <ImportModal
          columns={data?.csv_columns ?? []}
          onClose={() => setImporting(false)}
          onImported={async (count) => {
            setImporting(false);
            setBanner(`${count} invitation${count === 1 ? "" : "s"} issued from the CSV.`);
            await reloadAll();
          }}
        />
      ) : null}
    </SyndicShell>
  );
}

// --- Accounts ---------------------------------------------------------------

function AccountsTable({
  accounts,
  loading,
  mayEdit,
  mayDelete,
  onChanged,
}: {
  accounts: CoOwnerAccount[];
  loading: boolean;
  mayEdit: boolean;
  mayDelete: boolean;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(account: CoOwnerAccount, status: string) {
    setBusy(account.id);
    setError(null);
    try {
      await api(`/api/syndic/co-owners/${account.id}`, { method: "PATCH", body: { status } });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the account");
    } finally {
      setBusy(null);
    }
  }

  async function remove(account: CoOwnerAccount) {
    setBusy(account.id);
    setError(null);
    try {
      await api(`/api/syndic/co-owners/${account.id}`, { method: "DELETE" });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the account");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="section">
      <div className="section__header">
        <div>
          <h2 className="section__title">Co-owner accounts</h2>
          <p className="section__sub">
            {accounts.length} account{accounts.length === 1 ? "" : "s"} · each signs in to the
            resident app
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
                <th>Name</th>
                <th>Email</th>
                <th>Units held</th>
                <th>Status</th>
                <th>Last sign-in</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td className="bold color-cr">{account.name}</td>
                  <td className="mono">{account.email}</td>
                  <td className="wrap">
                    {account.units.length
                      ? account.units
                          .map(
                            (unit) =>
                              `${unit.unit_label}${unit.percent < 100 ? ` (${unit.percent}%)` : ""}`,
                          )
                          .join(", ")
                      : "-"}
                  </td>
                  <td>
                    <StatusPill value={account.status} />
                  </td>
                  <td>{relativeTime(account.last_login_at)}</td>
                  <td className="right">
                    {mayEdit ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy === account.id}
                        onClick={() =>
                          setStatus(account, account.status === "active" ? "suspended" : "active")
                        }
                        type="button"
                      >
                        {busy === account.id ? (
                          <Loader2 className="animate-spin" size={12} />
                        ) : account.status === "active" ? (
                          <Ban size={12} />
                        ) : (
                          <Check size={12} />
                        )}
                        {account.status === "active" ? "Suspend" : "Reactivate"}
                      </button>
                    ) : null}
                    {mayDelete && !account.last_login_at ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy === account.id}
                        onClick={() => remove(account)}
                        type="button"
                      >
                        <CircleSlash size={12} />
                        Remove
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {loading && !accounts.length ? (
                <tr>
                  <td className="empty-cell" colSpan={6}>
                    Loading accounts...
                  </td>
                </tr>
              ) : null}
              {!loading && !accounts.length ? (
                <tr>
                  <td className="empty-cell" colSpan={6}>
                    No co-owner has registered yet. Issue an invitation to get started.
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

// --- Invitations ------------------------------------------------------------

function InvitationsTable({
  invitations,
  loading,
  mayEdit,
  mayDelete,
  onChanged,
}: {
  invitations: InvitationRow[];
  loading: boolean;
  mayEdit: boolean;
  mayDelete: boolean;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(invitation: InvitationRow, action: "resend" | "revoke") {
    setBusy(invitation.id);
    setError(null);
    try {
      if (action === "resend") {
        await api(`/api/syndic/co-owners/invitations/${invitation.id}/resend`, { method: "POST" });
      } else {
        await api(`/api/syndic/co-owners/invitations/${invitation.id}`, { method: "DELETE" });
      }
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the invitation");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="section">
      <div className="section__header">
        <div>
          <h2 className="section__title">Invitations</h2>
          <p className="section__sub">
            Codes are single-use, expire after 14 days, and only work with the email they were
            issued to
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
                <th>Email</th>
                <th>Unit</th>
                <th>Share</th>
                <th>Code</th>
                <th>State</th>
                <th>Expires</th>
                <th>Issued by</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invitations.map((invitation) => (
                <tr key={invitation.id}>
                  <td className="mono">{invitation.email}</td>
                  <td className="bold color-cr">{invitation.unit_label}</td>
                  <td>{invitation.ownership_percent}%</td>
                  <td>
                    {invitation.state === "pending" ? (
                      <span className="code-badge">{invitation.code}</span>
                    ) : (
                      <span className="color-mt">—</span>
                    )}
                  </td>
                  <td>
                    <StatusPill value={invitation.state} />
                  </td>
                  <td>
                    {invitation.state === "pending" ? formatDate(invitation.expires_at) : "-"}
                  </td>
                  <td className="wrap">{invitation.invited_by_label ?? "-"}</td>
                  <td className="right">
                    {mayEdit && invitation.status !== "accepted" ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy === invitation.id}
                        onClick={() => act(invitation, "resend")}
                        type="button"
                      >
                        {busy === invitation.id ? (
                          <Loader2 className="animate-spin" size={12} />
                        ) : (
                          <RefreshCw size={12} />
                        )}
                        Re-issue
                      </button>
                    ) : null}
                    {mayDelete && invitation.state === "pending" ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy === invitation.id}
                        onClick={() => act(invitation, "revoke")}
                        type="button"
                      >
                        <Ban size={12} />
                        Revoke
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {loading && !invitations.length ? (
                <tr>
                  <td className="empty-cell" colSpan={8}>
                    Loading invitations...
                  </td>
                </tr>
              ) : null}
              {!loading && !invitations.length ? (
                <tr>
                  <td className="empty-cell" colSpan={8}>
                    No invitations issued yet
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

// --- Occupancy --------------------------------------------------------------

function OccupancyTable({
  data,
  loading,
  mayCreate,
  onChanged,
  units,
}: {
  data: Occupancy[];
  loading: boolean;
  mayCreate: boolean;
  onChanged: () => Promise<void>;
  units: AllocatableUnit[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <>
      <Section
        action={
          mayCreate ? (
            <button className="btn btn-secondary btn-sm" onClick={() => setAdding(true)} type="button">
              <Plus size={12} />
              Record occupant
            </button>
          ) : null
        }
        subtitle="Who lives in a unit its owner does not occupy — records, not accounts"
        title="Occupancy"
      >
        <div className="notice notice--info">
          <Users size={15} />
          <div>
            <div className="notice__title">Occupants do not hold a login</div>
            <div className="notice__sub">
              Service charges are the owner&apos;s liability and votes follow the owner&apos;s
              title, so the resident app is for co-owners. These records exist so the office has
              a name and number for maintenance access, gate passes and an evacuation list.
            </div>
          </div>
        </div>

        {data.length ? (
          <div className="table-wrap mt-4">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Occupant</th>
                  <th>Phone</th>
                  <th>Lease ends</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.id}>
                    <td className="bold color-cr">{row.unit_label}</td>
                    <td>{row.user_name}</td>
                    <td className="mono">{row.occupant_phone ?? "-"}</td>
                    <td>{formatDate(row.lease_end_date)}</td>
                    <td>
                      <StatusPill value={row.is_current ? "active" : "inactive"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message={loading ? "Loading..." : "No occupancy records"} />
        )}
      </Section>

      {adding ? (
        <OccupancyModal
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await onChanged();
          }}
          units={units}
        />
      ) : null}
    </>
  );
}

function OccupancyModal({
  onClose,
  onSaved,
  units,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
  units: AllocatableUnit[];
}) {
  const [unitId, setUnitId] = useState(units[0] ? String(units[0].id) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api("/api/syndic/co-owners/occupancy", {
        method: "POST",
        body: {
          unit_id: Number(unitId),
          occupant_name: form.get("occupant_name"),
          occupant_email: form.get("occupant_email"),
          occupant_phone: form.get("occupant_phone"),
          lease_start_date: form.get("lease_start_date"),
          lease_end_date: form.get("lease_end_date"),
        },
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the record");
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
          <button className="btn btn-primary" disabled={saving} form="occupancy-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <Plus size={13} />}
            {saving ? "Saving..." : "Record occupant"}
          </button>
        </>
      }
      icon={<Users size={17} />}
      onClose={onClose}
      subtitle="A contact record for a unit the owner does not live in. No login is created."
      title="Record an occupant"
    >
      <form id="occupancy-form" onSubmit={submit}>
        {error ? <div className="notice notice--er">{error}</div> : null}

        <div className="form-grid">
          <div>
            <label className="label">Unit</label>
            <SelectMenu
              ariaLabel="Unit"
              fullWidth
              onChange={setUnitId}
              options={units.map((unit) => ({ value: String(unit.id), label: unit.label }))}
              shape="field"
              value={unitId}
            />
          </div>
          <div>
            <label className="label" htmlFor="occupant_name">
              Occupant name
            </label>
            <input className="field" id="occupant_name" name="occupant_name" required />
          </div>
          <div>
            <label className="label" htmlFor="occupant_phone">
              Phone
            </label>
            <input className="field" id="occupant_phone" name="occupant_phone" />
          </div>
          <div>
            <label className="label" htmlFor="occupant_email">
              Email
            </label>
            <input className="field" id="occupant_email" name="occupant_email" type="email" />
          </div>
          <div>
            <label className="label" htmlFor="lease_start_date">
              Lease start
            </label>
            <input className="field" id="lease_start_date" name="lease_start_date" placeholder="YYYY-MM-DD" />
          </div>
          <div>
            <label className="label" htmlFor="lease_end_date">
              Lease end
            </label>
            <input className="field" id="lease_end_date" name="lease_end_date" placeholder="YYYY-MM-DD" />
          </div>
        </div>
      </form>
    </Modal>
  );
}

// --- Invite one -------------------------------------------------------------

function InviteModal({
  onClose,
  onSaved,
  units,
  vacantUnits,
}: {
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
  units: AllocatableUnit[];
  vacantUnits: AllocatableUnit[];
}) {
  // Default to the first unallocated unit — the reason the manager opened this.
  const [unitId, setUnitId] = useState(
    vacantUnits[0] ? String(vacantUnits[0].id) : units[0] ? String(units[0].id) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<InvitationRow | null>(null);

  const selected = units.find((unit) => String(unit.id) === unitId);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const response = await api<{ invitation: InvitationRow }>(
        "/api/syndic/co-owners/invitations",
        {
          method: "POST",
          body: {
            unit_id: Number(unitId),
            email: form.get("email"),
            first_name: form.get("first_name"),
            last_name: form.get("last_name"),
            phone: form.get("phone"),
            ownership_percent: Number(form.get("ownership_percent") || 100),
            is_primary_contact: true,
          },
        },
      );
      setIssued(response.invitation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not issue the invitation");
    } finally {
      setSaving(false);
    }
  }

  if (issued) {
    return (
      <Modal
        footer={
          <button
            className="btn btn-primary"
            onClick={() => onSaved(`Invitation ${issued.code} issued to ${issued.email}.`)}
            type="button"
          >
            <Check size={13} />
            Done
          </button>
        }
        icon={<KeyRound size={17} />}
        onClose={() => onSaved(`Invitation ${issued.code} issued to ${issued.email}.`)}
        subtitle={`For unit ${issued.unit_label}, valid until ${formatDate(issued.expires_at)}`}
        title="Invitation issued"
      >
        <div className="grid place-items-center gap-4 py-4 text-center">
          <span className="code-badge text-lg">{issued.code}</span>
          <p className="max-w-sm text-sm font-medium text-[var(--cmt)]">
            Send this code to <strong className="text-[var(--ct)]">{issued.email}</strong>. They
            register at <span className="font-mono">/app/register</span> with the code and that
            email address — no other address will work.
          </p>
        </div>

        <div className="notice notice--info">
          <Mail size={15} />
          <div>
            <div className="notice__title">Why a code and not a password</div>
            <div className="notice__sub">
              A co-owner account can read a financial history and cast a share-weighted vote. The
              office should never know its password, so the co-owner sets their own on first use.
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving} form="invite-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <Send size={13} />}
            {saving ? "Issuing..." : "Issue invitation"}
          </button>
        </>
      }
      icon={<UserPlus size={17} />}
      onClose={onClose}
      subtitle="Creates a single-use code bound to this unit and email address"
      title="Invite a co-owner"
      wide
    >
      <form id="invite-form" onSubmit={submit}>
        {error ? <div className="notice notice--er">{error}</div> : null}

        <div className="form-grid">
          <div>
            <label className="label">Unit</label>
            <SelectMenu
              ariaLabel="Unit"
              fullWidth
              onChange={setUnitId}
              options={units.map((unit) => ({
                value: String(unit.id),
                label: unit.has_owner ? `${unit.label} — already held` : unit.label,
              }))}
              shape="field"
              value={unitId}
            />
          </div>
          <div>
            <label className="label" htmlFor="ownership_percent">
              Share of title (%)
            </label>
            <input
              className="field"
              defaultValue={100}
              id="ownership_percent"
              max={100}
              min={1}
              name="ownership_percent"
              type="number"
            />
          </div>
        </div>

        <div className="form-grid mt-4">
          <div>
            <label className="label" htmlFor="first_name">
              First name
            </label>
            <input className="field" id="first_name" name="first_name" />
          </div>
          <div>
            <label className="label" htmlFor="last_name">
              Last name
            </label>
            <input className="field" id="last_name" name="last_name" />
          </div>
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input className="field" id="email" name="email" required type="email" />
          </div>
          <div>
            <label className="label" htmlFor="phone">
              Phone
            </label>
            <input className="field" id="phone" name="phone" placeholder="+230 5xxx xxxx" />
          </div>
        </div>

        {selected?.has_owner ? (
          <div className="notice notice--warn mt-4">
            <Users size={15} />
            <div>
              <div className="notice__title">This unit already has a holder</div>
              <div className="notice__sub">
                That is fine for a jointly held unit — set the share of title so the two add up to
                100%. The API refuses anything that would over-allocate.
              </div>
            </div>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

// --- Bulk import ------------------------------------------------------------

function ImportModal({
  columns,
  onClose,
  onImported,
}: {
  columns: string[];
  onClose: () => void;
  onImported: (count: number) => Promise<void>;
}) {
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await api<ImportResult>("/api/syndic/co-owners/invitations/import", {
        method: "POST",
        body: { csv, dry_run: dryRun },
      });
      if (!dryRun && response.imported > 0) {
        await onImported(response.imported);
        return;
      }
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that CSV");
    } finally {
      setBusy(false);
    }
  }

  async function readFile(file: File) {
    setCsv(await file.text());
    setResult(null);
  }

  const clean = Boolean(result && result.errors.length === 0 && result.valid_count > 0);

  return (
    <Modal
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn btn-secondary"
            disabled={busy || !csv.trim()}
            onClick={() => run(true)}
            type="button"
          >
            {busy ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
            Check file
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !clean}
            onClick={() => run(false)}
            type="button"
          >
            <Send size={13} />
            Issue {result?.valid_count ?? 0} invitation
            {result?.valid_count === 1 ? "" : "s"}
          </button>
        </>
      }
      icon={<Upload size={17} />}
      onClose={onClose}
      subtitle="Validates the whole file first and imports nothing if any row is wrong"
      title="Import co-owners from CSV"
      wide
    >
      {error ? <div className="notice notice--er">{error}</div> : null}

      <div className="toolbar">
        <button
          className="btn btn-secondary btn-sm"
          onClick={() =>
            downloadFile("/api/syndic/co-owners/invitations/template", "co-owner-import.csv")
          }
          type="button"
        >
          <Download size={12} />
          Download template
        </button>
        <label className="btn btn-secondary btn-sm cursor-pointer">
          <Upload size={12} />
          Choose file
          <input
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
            }}
            type="file"
          />
        </label>
      </div>

      <p className="mt-3 text-xs font-medium text-[var(--cmt)]">
        Columns: <span className="font-mono font-semibold">{columns.join(", ")}</span>. Only{" "}
        <span className="font-mono font-semibold">unit</span> and{" "}
        <span className="font-mono font-semibold">email</span> are required; the template comes
        pre-filled with the units that have no owner.
      </p>

      <label className="label mt-4" htmlFor="csv">
        CSV content
      </label>
      <textarea
        className="field font-mono text-xs"
        id="csv"
        onChange={(event) => {
          setCsv(event.target.value);
          setResult(null);
        }}
        placeholder={`${columns.join(",")}\nA-102,Marie,Laval,marie@example.mu,+230 5123 4567,100`}
        rows={7}
        value={csv}
      />

      {result ? (
        <div className="mt-4">
          {result.errors.length ? (
            <div className="notice notice--er">
              <Search size={15} />
              <div>
                <div className="notice__title">
                  {result.errors.length} row{result.errors.length === 1 ? "" : "s"} need fixing
                </div>
                <div className="notice__sub">
                  Nothing was imported. Correct these and check the file again — a half-imported
                  building is harder to unpick than a rejected file.
                </div>
              </div>
            </div>
          ) : (
            <div className="notice notice--ok">
              <Check size={15} />
              <div>
                <div className="notice__title">
                  {result.valid_count} row{result.valid_count === 1 ? "" : "s"} ready
                </div>
                <div className="notice__sub">
                  Every row matches a unit in this development and no unit would be
                  over-allocated.
                </div>
              </div>
            </div>
          )}

          <div className="mt-3 max-h-56 overflow-y-auto">
            {result.errors.map((row) => (
              <div className="import-row import-row--error" key={`error-${row.row}`}>
                <span className="import-row__num">Row {row.row}</span>
                <span className="import-row__body">{row.message}</span>
              </div>
            ))}
            {!result.errors.length
              ? (result.preview ?? []).map((row) => (
                  <div className="import-row" key={`ok-${row.row}`}>
                    <span className="import-row__num">Row {row.row}</span>
                    <span className="import-row__body">
                      {row.unit_label} → {row.email}
                      {row.ownership_percent < 100 ? ` (${row.ownership_percent}%)` : ""}
                    </span>
                  </div>
                ))
              : null}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
