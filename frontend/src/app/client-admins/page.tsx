"use client";

/**
 * Client Admins — the operator's side of the account chain.
 *
 * This is where layer 1 hands authority to layer 2. The operator provisions the
 * first syndic manager for a client; from there the client fills its own seats.
 * So the screen is grouped by client rather than being one flat user list, and
 * the headline figure is how many clients are still waiting for a manager —
 * a client with units but nobody to sign in is a stalled onboarding.
 *
 * Support impersonation is launched from here too, because "open their console
 * and look" is the natural next action after "why has this client not gone
 * live".
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  Check,
  KeyRound,
  LifeBuoy,
  Loader2,
  Search,
  Settings2,
  UserPlus,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { PageHeader } from "@/components/page-header";
import { SelectMenu } from "@/components/select-menu";
import { Section } from "@/components/section";
import { MetricTile } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { api } from "@/lib/api";
import { number, relativeTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { canCreate, canEdit } from "@/lib/permissions";
import type { RoleDefinition, User } from "@/lib/types";

type Seats = {
  development_id: number;
  allowed: number;
  used: number;
  remaining: number;
  total_accounts: number;
  plan_name: string | null;
  plan_seats: number;
  is_overridden: boolean;
  has_manager: boolean;
};

type ClientRow = {
  development: {
    id: number;
    code: string;
    name: string;
    location: string | null;
    status: string;
    unit_count: number;
    plan_name: string | null;
  };
  seats: Seats;
  admins: User[];
};

type Response = {
  clients: ClientRow[];
  roles: RoleDefinition[];
  totals: {
    clients: number;
    provisioned: number;
    seats_allowed: number;
    seats_used: number;
    awaiting_manager: number;
  };
};

export default function ClientAdminsPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [provisioning, setProvisioning] = useState<ClientRow | null>(null);
  const [adjustingSeats, setAdjustingSeats] = useState<ClientRow | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const session = useApi<{ user: User | null }>("/api/auth/me");
  const registry = useApi<Response>("/api/client-admins/");

  const currentUser = session.data?.user ?? null;
  const data = registry.data;
  const isSuperAdmin = currentUser?.role === "super_admin";

  const clients = useMemo(() => {
    const rows = data?.clients ?? [];
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (row) =>
        [row.development.name, row.development.code, row.development.location]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term)) ||
        row.admins.some((admin) =>
          [admin.name, admin.email].some((value) => value.toLowerCase().includes(term)),
        ),
    );
  }, [data, query]);

  async function impersonate(client: ClientRow) {
    setError(null);
    try {
      const response = await api<{ redirect: string }>(
        `/api/impersonate/${client.development.id}`,
        { method: "POST" },
      );
      router.push(response.redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the client console");
    }
  }

  return (
    <AppShell
      onSearch={setQuery}
      searchPlaceholder="Search clients, admins..."
      searchValue={query}
    >
      <PageHeader
        title="Client Admins"
        subtitle="Provision the accounts that manage each client property"
      />

      {registry.error ? <div className="notice notice--er">{registry.error}</div> : null}
      {error ? <div className="notice notice--er">{error}</div> : null}
      {banner ? (
        <div className="notice notice--ok">
          <Check size={15} />
          <div>
            <div className="notice__title">Done</div>
            <div className="notice__sub">{banner}</div>
          </div>
        </div>
      ) : null}

      {data ? (
        <div className="metric-strip">
          <MetricTile center label="Client properties" value={number(data.totals.clients)} />
          <MetricTile center label="Admin accounts" value={number(data.totals.provisioned)} />
          <MetricTile
            center
            label="Seats in use"
            sub={`of ${number(data.totals.seats_allowed)} allowed`}
            value={number(data.totals.seats_used)}
          />
          <MetricTile
            center
            label="Awaiting a manager"
            sub="Cannot sign in yet"
            tone={data.totals.awaiting_manager > 0 ? "var(--wn)" : undefined}
            value={number(data.totals.awaiting_manager)}
          />
        </div>
      ) : null}

      {data && data.totals.awaiting_manager > 0 ? (
        <div className="notice notice--warn">
          <AlertTriangle size={15} />
          <div>
            <div className="notice__title">
              {number(data.totals.awaiting_manager)} client
              {data.totals.awaiting_manager === 1 ? "" : "s"} have no syndic manager
            </div>
            <div className="notice__sub">
              Nobody at those properties can sign in to set up their registry, invite co-owners
              or run billing. Provisioning the first manager is what unblocks their onboarding.
            </div>
          </div>
        </div>
      ) : null}

      {clients.map((client) => (
        <Section
          action={
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip">
                {number(client.seats.used)} / {number(client.seats.allowed)} seats
              </span>
              {isSuperAdmin ? (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => impersonate(client)}
                  type="button"
                >
                  <LifeBuoy size={12} />
                  Open console
                </button>
              ) : null}
              {canEdit(currentUser, "subscriptions") ? (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setAdjustingSeats(client)}
                  type="button"
                >
                  <Settings2 size={12} />
                  Seats
                </button>
              ) : null}
              {canCreate(currentUser, "users") ? (
                <button
                  className="btn btn-primary btn-sm"
                  disabled={client.seats.remaining <= 0}
                  onClick={() => setProvisioning(client)}
                  type="button"
                >
                  <UserPlus size={12} />
                  Provision
                </button>
              ) : null}
            </div>
          }
          key={client.development.id}
          subtitle={`${client.development.code} · ${client.development.location ?? "Mauritius"} · ${number(
            client.development.unit_count,
          )} units · ${client.seats.plan_name ?? "No plan"}`}
          title={client.development.name}
        >
          {!client.seats.has_manager ? (
            <div className="notice notice--warn">
              <Building2 size={15} />
              <div>
                <div className="notice__title">No syndic manager yet</div>
                <div className="notice__sub">
                  {client.seats.allowed <= 0
                    ? "This client has no subscription, so it has no seat allowance. Assign a plan first."
                    : "The first account must be a Syndic Manager — no other role can set up the registry or add colleagues."}
                </div>
              </div>
            </div>
          ) : null}

          {client.admins.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Last sign-in</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {client.admins.map((admin) => (
                    <tr key={admin.id}>
                      <td className="bold color-cr">{admin.name}</td>
                      <td className="mono">{admin.email}</td>
                      <td>
                        <StatusPill value={admin.role} />
                      </td>
                      <td>
                        <StatusPill value={admin.status} />
                      </td>
                      <td>{relativeTime(admin.last_login_at)}</td>
                      <td className="right">
                        {canEdit(currentUser, "users") ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={async () => {
                              setError(null);
                              try {
                                await api(
                                  `/api/client-admins/${client.development.id}/admins/${admin.id}`,
                                  {
                                    method: "PATCH",
                                    body: {
                                      status:
                                        admin.status === "active" ? "suspended" : "active",
                                    },
                                  },
                                );
                                await registry.reload();
                              } catch (err) {
                                setError(
                                  err instanceof Error ? err.message : "Could not update",
                                );
                              }
                            }}
                            type="button"
                          >
                            {admin.status === "active" ? "Suspend" : "Reactivate"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="No admin accounts provisioned for this client" />
          )}
        </Section>
      ))}

      {registry.loading && !data ? <div className="loading-line" /> : null}
      {!registry.loading && !clients.length ? (
        <div className="section">
          <div className="section__body">
            <div className="grid place-items-center gap-2 py-12 text-center text-[var(--cmt)]">
              <Search size={28} />
              <p className="text-sm font-semibold">No client matches this search</p>
            </div>
          </div>
        </div>
      ) : null}

      {provisioning ? (
        <ProvisionModal
          client={provisioning}
          onClose={() => setProvisioning(null)}
          onSaved={async (message) => {
            setProvisioning(null);
            setBanner(message);
            await registry.reload();
          }}
          roles={data?.roles ?? []}
        />
      ) : null}

      {adjustingSeats ? (
        <SeatsModal
          client={adjustingSeats}
          onClose={() => setAdjustingSeats(null)}
          onSaved={async (message) => {
            setAdjustingSeats(null);
            setBanner(message);
            await registry.reload();
          }}
        />
      ) : null}
    </AppShell>
  );
}

function ProvisionModal({
  client,
  onClose,
  onSaved,
  roles,
}: {
  client: ClientRow;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
  roles: RoleDefinition[];
}) {
  // The first account for a client must be a manager; the API enforces it, and
  // defaulting to it here means the operator does not have to know that.
  const [role, setRole] = useState(client.seats.has_manager ? "finance_officer" : "syndic_manager");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = roles.find((entry) => entry.key === role);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const response = await api<{ admin: { name: string; email: string } }>(
        `/api/client-admins/${client.development.id}`,
        {
          method: "POST",
          body: {
            first_name: form.get("first_name"),
            last_name: form.get("last_name"),
            email: form.get("email"),
            phone: form.get("phone"),
            password: form.get("password"),
            role,
          },
        },
      );
      await onSaved(
        `${response.admin.name} provisioned for ${client.development.name}. ` +
          `They sign in at /syndic/login.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not provision the account");
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
          <button className="btn btn-primary" disabled={saving} form="provision-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <UserPlus size={13} />}
            Provision account
          </button>
        </>
      }
      icon={<UserPlus size={17} />}
      onClose={onClose}
      subtitle={`${client.development.name} — ${number(client.seats.remaining)} of ${number(
        client.seats.allowed,
      )} seats free`}
      title="Provision a client admin"
      wide
    >
      <form id="provision-form" onSubmit={submit}>
        {error ? <div className="notice notice--er">{error}</div> : null}

        <div className="form-grid">
          <div>
            <label className="label" htmlFor="first_name">
              First name
            </label>
            <input className="field" id="first_name" name="first_name" required />
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
            <input className="field" id="phone" name="phone" />
          </div>
        </div>

        <div className="form-grid mt-4">
          <div>
            <label className="label">Role</label>
            <SelectMenu
              ariaLabel="Role"
              disabled={!client.seats.has_manager}
              fullWidth
              onChange={setRole}
              options={roles.map((entry) => ({ value: entry.key, label: entry.label }))}
              shape="field"
              value={role}
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Temporary password
            </label>
            <input
              className="field"
              id="password"
              minLength={10}
              name="password"
              required
              type="password"
            />
          </div>
        </div>

        {selected ? (
          <div className="notice notice--info mt-4">
            <KeyRound size={15} />
            <div>
              <div className="notice__title">{selected.label}</div>
              <div className="notice__sub">{selected.summary}</div>
            </div>
          </div>
        ) : null}

        {!client.seats.has_manager ? (
          <p className="mt-3 text-xs font-medium text-[var(--cmt)]">
            The first account for a client is always a Syndic Manager — it is the only role that
            can set up the registry and add the rest of the team.
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

function SeatsModal({
  client,
  onClose,
  onSaved,
}: {
  client: ClientRow;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(value: number | null) {
    setSaving(true);
    setError(null);
    try {
      const response = await api<{ seats: Seats }>(
        `/api/client-admins/${client.development.id}/seats`,
        { method: "PATCH", body: { admin_seats: value } },
      );
      await onSaved(
        `${client.development.name} now has ${number(response.seats.allowed)} admin seats.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the allowance");
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
          <button
            className="btn btn-secondary"
            disabled={saving || !client.seats.is_overridden}
            onClick={() => save(null)}
            type="button"
          >
            Reset to plan
          </button>
          <button className="btn btn-primary" disabled={saving} form="seats-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
            Save allowance
          </button>
        </>
      }
      icon={<Settings2 size={17} />}
      onClose={onClose}
      subtitle={client.development.name}
      title="Admin seat allowance"
    >
      <form
        id="seats-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          save(Number(form.get("admin_seats")));
        }}
      >
        {error ? <div className="notice notice--er">{error}</div> : null}

        <label className="label" htmlFor="admin_seats">
          Seats
        </label>
        <input
          className="field"
          defaultValue={client.seats.allowed}
          id="admin_seats"
          max={50}
          min={Math.max(client.seats.used, 1)}
          name="admin_seats"
          type="number"
        />

        <p className="mt-3 text-xs font-medium text-[var(--cmt)]">
          The {client.seats.plan_name ?? "current"} plan grants{" "}
          {number(client.seats.plan_seats)} seats.{" "}
          {client.seats.is_overridden
            ? "This client has a negotiated allowance that overrides it."
            : "Setting a value here overrides the plan for this client only, so a change to the plan catalog will not rewrite a signed contract."}
        </p>

        <p className="mt-2 text-xs font-medium text-[var(--cmt)]">
          {number(client.seats.used)} seat{client.seats.used === 1 ? " is" : "s are"} currently in
          use, so the allowance cannot go below that. Suspended accounts do not occupy a seat.
        </p>
      </form>
    </Modal>
  );
}
