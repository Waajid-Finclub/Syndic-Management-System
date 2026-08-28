"use client";

/**
 * The client's own admin team, against the subscription's seat allowance.
 *
 * The seat meter is the first thing on the screen because it is the constraint
 * everything else runs into. An *active* account occupies a seat; suspending
 * one frees it while keeping the account's history, which is what a client
 * wants when somebody leaves — and saying that plainly here saves a support
 * call about why the "add" button is disabled.
 *
 * A manager cannot appoint another manager, and cannot change their own role or
 * status. Both are the same rule: authority is granted by the layer above.
 */

import { useState } from "react";
import { Ban, Check, KeyRound, Loader2, ShieldCheck, Trash2, UserCog, UserPlus } from "lucide-react";
import { Modal } from "@/components/modal";
import { PageHeader } from "@/components/page-header";
import { SelectMenu } from "@/components/select-menu";
import { Section } from "@/components/section";
import { StatusPill } from "@/components/status-pill";
import { SyndicShell } from "@/components/syndic/shell";
import { api } from "@/lib/api";
import { number, relativeTime } from "@/lib/format";
import { canCreate, canDelete, canEdit, useSyndicApi } from "@/lib/syndic/hooks";
import { useSyndic } from "@/lib/syndic/session";
import type { Seats, TeamMember, TeamResponse } from "@/lib/syndic/types";

export default function TeamPage() {
  const { permissions } = useSyndic();
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<TeamMember | null>(null);
  const [error, setError] = useState<string | null>(null);

  const team = useSyndicApi<TeamResponse>("/api/syndic/team");
  const data = team.data;
  const seats = data?.seats;

  const mayCreate = canCreate(permissions, "team");
  const mayEdit = canEdit(permissions, "team");
  const mayDelete = canDelete(permissions, "team");

  async function act(member: TeamMember, body: Record<string, unknown>) {
    setError(null);
    try {
      await api(`/api/syndic/team/${member.id}`, { method: "PATCH", body });
      await team.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the account");
    }
  }

  async function remove(member: TeamMember) {
    setError(null);
    try {
      await api(`/api/syndic/team/${member.id}`, { method: "DELETE" });
      await team.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the account");
    }
  }

  return (
    <SyndicShell>
      <PageHeader
        title="Team & Access"
        subtitle="Colleagues who sign in to this console"
        action={
          mayCreate ? (
            <button
              className="btn btn-primary"
              disabled={!seats || seats.remaining <= 0}
              onClick={() => setAdding(true)}
              type="button"
            >
              <UserPlus size={13} />
              Add team member
            </button>
          ) : null
        }
      />

      {team.error ? <div className="notice notice--er">{team.error}</div> : null}
      {error ? <div className="notice notice--er">{error}</div> : null}

      {seats ? <SeatMeter seats={seats} /> : null}

      <Section
        subtitle="Every account here is scoped to this development only"
        title="Team members"
      >
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last sign-in</th>
                <th>MFA</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(data?.team ?? []).map((member) => (
                <tr key={member.id}>
                  <td className="bold color-cr">
                    {member.name}
                    {member.is_self ? <span className="chip ml-2">You</span> : null}
                  </td>
                  <td className="mono">{member.email}</td>
                  <td>
                    {mayEdit && !member.is_self && member.role !== "syndic_manager" ? (
                      <SelectMenu
                        ariaLabel={`Role for ${member.name}`}
                        onChange={(role) => act(member, { role })}
                        options={(data?.grantable_roles ?? []).map((role) => ({
                          value: role.key,
                          label: role.label,
                        }))}
                        size="sm"
                        value={member.role}
                      />
                    ) : (
                      <StatusPill value={member.role} />
                    )}
                  </td>
                  <td>
                    <StatusPill value={member.status} />
                  </td>
                  <td>{relativeTime(member.last_login_at)}</td>
                  <td>{member.mfa_enabled ? <Check className="text-[var(--ok)]" size={13} /> : "-"}</td>
                  <td className="right">
                    {mayEdit && !member.is_self ? (
                      <>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setResetting(member)}
                          type="button"
                        >
                          <KeyRound size={12} />
                          Reset password
                        </button>
                        {member.role !== "syndic_manager" ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              act(member, {
                                status: member.status === "active" ? "suspended" : "active",
                              })
                            }
                            type="button"
                          >
                            {member.status === "active" ? <Ban size={12} /> : <Check size={12} />}
                            {member.status === "active" ? "Suspend" : "Reactivate"}
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    {mayDelete && !member.is_self && member.role !== "syndic_manager" ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => remove(member)}
                        type="button"
                      >
                        <Trash2 size={12} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {team.loading && !data ? (
                <tr>
                  <td className="empty-cell" colSpan={7}>
                    Loading team...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Section>

      {data ? (
        <Section
          action={<ShieldCheck className="text-[var(--cr)]" size={17} />}
          subtitle="What each role may do inside this development"
          title="Role permissions"
        >
          {data.roles.map((role) => (
            <div className="role-row" key={role.key}>
              <span className="role-row__name">{role.label}</span>
              <span className="role-row__summary">{role.summary}</span>
            </div>
          ))}

          <div className="notice notice--info mt-4">
            <UserCog size={15} />
            <div>
              <div className="notice__title">Only the platform operator appoints a manager</div>
              <div className="notice__sub">
                A syndic manager holds the full matrix for this development, including the
                ability to add colleagues. Granting that is the operator&apos;s call, not
                something the console can do to itself.
              </div>
            </div>
          </div>
        </Section>
      ) : null}

      {adding ? (
        <AddMemberModal
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await team.reload();
          }}
          roles={data?.grantable_roles ?? []}
          seats={seats}
        />
      ) : null}

      {resetting ? (
        <ResetPasswordModal
          member={resetting}
          onClose={() => setResetting(null)}
          onSaved={async () => {
            setResetting(null);
            await team.reload();
          }}
        />
      ) : null}
    </SyndicShell>
  );
}

function SeatMeter({ seats }: { seats: Seats }) {
  const pips = Array.from({ length: Math.max(seats.allowed, seats.used) });

  return (
    <div className="share-meter">
      <div className="share-meter__copy">
        <span className="share-meter__label">Admin seats</span>
        <span className="share-meter__value">
          {number(seats.used)} / {number(seats.allowed)}
        </span>
      </div>
      <div className="seat-strip flex-1">
        {pips.map((_, index) => (
          <span className={`seat-pip ${index < seats.used ? "is-used" : ""}`} key={index} />
        ))}
      </div>
      <span className="chip">
        {seats.is_overridden ? "Negotiated allowance" : `${seats.plan_name ?? "Plan"} allowance`}
      </span>
    </div>
  );
}

function AddMemberModal({
  onClose,
  onSaved,
  roles,
  seats,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
  roles: { key: string; label: string; summary: string }[];
  seats?: Seats;
}) {
  const [role, setRole] = useState(roles[0]?.key ?? "assistant_manager");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = roles.find((entry) => entry.key === role);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api("/api/syndic/team", {
        method: "POST",
        body: {
          first_name: form.get("first_name"),
          last_name: form.get("last_name"),
          email: form.get("email"),
          phone: form.get("phone"),
          password: form.get("password"),
          role,
        },
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account");
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
          <button className="btn btn-primary" disabled={saving} form="member-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <UserPlus size={13} />}
            Add member
          </button>
        </>
      }
      icon={<UserPlus size={17} />}
      onClose={onClose}
      subtitle={
        seats
          ? `${number(seats.remaining)} of ${number(seats.allowed)} seats free`
          : undefined
      }
      title="Add a team member"
      wide
    >
      <form id="member-form" onSubmit={submit}>
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
            <ShieldCheck size={15} />
            <div>
              <div className="notice__title">{selected.label}</div>
              <div className="notice__sub">{selected.summary}</div>
            </div>
          </div>
        ) : null}

        <p className="mt-3 text-xs font-medium text-[var(--cmt)]">
          They sign in at <span className="font-mono">/syndic/login</span>. Ask them to change
          this password from their account screen on first use — you will not be able to see it
          again.
        </p>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  member,
  onClose,
  onSaved,
}: {
  member: TeamMember;
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
      await api(`/api/syndic/team/${member.id}`, {
        method: "PATCH",
        body: { password: form.get("password") },
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset the password");
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
          <button className="btn btn-primary" disabled={saving} form="reset-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <KeyRound size={13} />}
            Reset password
          </button>
        </>
      }
      icon={<KeyRound size={17} />}
      onClose={onClose}
      subtitle={member.email}
      title={`Reset password for ${member.name}`}
    >
      <form id="reset-form" onSubmit={submit}>
        {error ? <div className="notice notice--er">{error}</div> : null}

        <label className="label" htmlFor="password">
          New temporary password
        </label>
        <input className="field" id="password" minLength={10} name="password" required type="password" />

        <p className="mt-3 text-xs font-medium text-[var(--cmt)]">
          The reset is written to the audit log under your name. Ask them to change it from
          their own account screen, where the current password is required.
        </p>
      </form>
    </Modal>
  );
}
