"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Minus, Plus, Search, ShieldCheck, UserPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Modal } from "@/components/modal";
import { PageHeader } from "@/components/page-header";
import { SelectMenu } from "@/components/select-menu";
import { MetricTile } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { Section } from "@/components/section";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { canCreate } from "@/lib/permissions";
import type { Development, DevelopmentListResponse, User, UsersResponse } from "@/lib/types";

const CONSOLE_ROLES = new Set(["super_admin", "platform_admin", "support_user", "auditor"]);

export default function UsersPage() {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const session = useApi<{ user: User | null }>("/api/auth/me");
  const registry = useApi<UsersResponse>("/api/users/");
  const properties = useApi<DevelopmentListResponse>("/api/developments/");

  const currentUser = session.data?.user ?? null;
  const data = registry.data;

  const rows = useMemo(() => {
    const users = data?.users ?? [];
    const term = query.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) =>
      [user.name, user.email, user.role_display, user.scope_label]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [data, query]);

  return (
    <AppShell onSearch={setQuery} searchPlaceholder="Search name, email, role..." searchValue={query}>
      <PageHeader
        title="Users & Access Rights"
        subtitle="Every account on the platform, across the console, the syndic app and the resident app"
        action={
          canCreate(currentUser, "users") ? (
            <button className="btn btn-primary" onClick={() => setCreating(true)} type="button">
              <UserPlus size={13} />
              Create user
            </button>
          ) : null
        }
      />

      {registry.error ? <div className="notice notice--er">{registry.error}</div> : null}

      {data ? (
        <div className="metric-strip">
          {data.role_counts.map((role) => (
            <MetricTile center key={role.role} label={role.label} value={role.count} />
          ))}
        </div>
      ) : null}

      <div className="section">
        <div className="section__header">
          <div>
            <h2 className="section__title">User registry</h2>
            <p className="section__sub">{rows.length} account{rows.length === 1 ? "" : "s"} shown</p>
          </div>
          <div className="searchbox">
            <Search size={14} />
            <input
              aria-label="Filter users"
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
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Property</th>
                  <th>Status</th>
                  <th>Last login</th>
                  <th>MFA</th>
                  <th>WA</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((user) => (
                  <tr key={user.id}>
                    <td className="bold color-cr">{user.name}</td>
                    <td className="mono">{user.email}</td>
                    <td>
                      <StatusPill value={user.role} />
                    </td>
                    <td>{user.scope_label}</td>
                    <td>
                      <StatusPill value={user.status} />
                    </td>
                    <td>{relativeTime(user.last_login_at)}</td>
                    <td>{user.mfa_enabled ? <Check className="text-[var(--ok)]" size={13} /> : <Minus className="color-mt" size={13} />}</td>
                    <td>{user.whatsapp_enabled ? <Check className="text-[var(--ok)]" size={13} /> : <Minus className="color-mt" size={13} />}</td>
                  </tr>
                ))}
                {registry.loading && !rows.length ? (
                  <tr>
                    <td className="empty-cell" colSpan={8}>
                      Loading users...
                    </td>
                  </tr>
                ) : null}
                {!registry.loading && !rows.length ? (
                  <tr>
                    <td className="empty-cell" colSpan={8}>
                      No users match this view
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {data ? (
        <Section
          title="Role permission matrix"
          subtitle="What each role may do once signed in"
          action={<ShieldCheck className="text-[var(--cr)]" size={17} />}
        >
          {data.roles.map((role) => (
            <div className="role-row" key={role.key}>
              <span className="role-row__name">{role.label}</span>
              <span className="role-row__summary">{role.summary}</span>
            </div>
          ))}
        </Section>
      ) : null}

      {creating ? (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await registry.reload();
          }}
          properties={properties.data?.developments ?? []}
          roles={data?.roles ?? []}
        />
      ) : null}
    </AppShell>
  );
}

function CreateUserModal({
  onClose,
  onSaved,
  properties,
  roles,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
  properties: Development[];
  roles: { key: string; label: string }[];
}) {
  const [role, setRole] = useState("syndic_manager");
  const [developmentId, setDevelopmentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsPassword = CONSOLE_ROLES.has(role);
  const roleOptions = roles.map((item) => ({ value: item.key, label: item.label }));
  const propertyOptions = properties.map((property) => ({
    value: String(property.id),
    label: property.name,
  }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);

    try {
      await api("/api/users/", {
        method: "POST",
        body: {
          first_name: form.get("first_name"),
          last_name: form.get("last_name"),
          email: form.get("email"),
          phone: form.get("phone"),
          role,
          development_id: developmentId ? Number(developmentId) : null,
          unit_label: form.get("unit_label"),
          password: form.get("password") || null,
          mfa_enabled: needsPassword,
        },
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the user");
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
          <button className="btn btn-primary" disabled={saving} form="create-user-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <Plus size={13} />}
            {saving ? "Creating..." : "Create user"}
          </button>
        </>
      }
      icon={<UserPlus size={17} />}
      onClose={onClose}
      subtitle="Console roles need a password; resident and vendor accounts are invited from the syndic console"
      title="Create user"
      wide
    >
      <form id="create-user-form" onSubmit={submit}>
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
            <SelectMenu ariaLabel="Role" fullWidth onChange={setRole} options={roleOptions} shape="field" value={role} />
          </div>
          <div>
            <label className="label">Property scope</label>
            <SelectMenu
              ariaLabel="Property scope"
              fullWidth
              onChange={setDevelopmentId}
              options={propertyOptions}
              placeholder="Platform-wide"
              shape="field"
              value={developmentId}
            />
          </div>
        </div>

        <div className="form-grid mt-4">
          <div>
            <label className="label" htmlFor="unit_label">
              Unit (owners and tenants)
            </label>
            <input className="field" id="unit_label" name="unit_label" placeholder="e.g. 4B" />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password {needsPassword ? "" : "(optional)"}
            </label>
            <input
              className="field"
              id="password"
              minLength={10}
              name="password"
              required={needsPassword}
              type="password"
            />
          </div>
        </div>

        {needsPassword ? (
          <div className="notice notice--info mt-4">
            <ShieldCheck size={15} />
            <div>
              <div className="notice__title">Console account</div>
              <div className="notice__sub">
                This role can sign in to the admin console. MFA is enabled by default and every action is audited.
              </div>
            </div>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
