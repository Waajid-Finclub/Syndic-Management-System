"use client";

/**
 * Funds — reserve, sinking, maintenance, operating.
 *
 * A co-ownership normally runs more than one pot, and the question a committee
 * asks is always the same: how far is each one from its target. So the balance
 * is shown against that target rather than on its own, and a change to a
 * balance is written to the audit log with its before and after values.
 */

import { useState } from "react";
import { Landmark, Loader2, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { PageHeader } from "@/components/page-header";
import { SelectMenu } from "@/components/select-menu";
import { Section } from "@/components/section";
import { SyndicShell } from "@/components/syndic/shell";
import { api } from "@/lib/api";
import { money, percent } from "@/lib/format";
import { canCreate, canEdit, useSyndicApi } from "@/lib/syndic/hooks";
import { useSyndic } from "@/lib/syndic/session";
import type { Fund } from "@/lib/syndic/types";

export default function FundsPage() {
  const { permissions } = useSyndic();
  const [editing, setEditing] = useState<Fund | null>(null);
  const [creating, setCreating] = useState(false);

  const funds = useSyndicApi<{ funds: Fund[]; fund_types: string[] }>("/api/syndic/finance/funds");
  const rows = funds.data?.funds ?? [];

  return (
    <SyndicShell>
      <PageHeader
        title="Funds"
        subtitle="Money the co-ownership holds against future works"
        action={
          canCreate(permissions, "funds") ? (
            <button className="btn btn-primary" onClick={() => setCreating(true)} type="button">
              <Plus size={13} />
              Open a fund
            </button>
          ) : null
        }
      />

      {funds.error ? <div className="notice notice--er">{funds.error}</div> : null}

      <Section subtitle={`${rows.length} fund${rows.length === 1 ? "" : "s"}`} title="Fund balances">
        {rows.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fund</th>
                  <th>Type</th>
                  <th className="right">Balance</th>
                  <th className="right">Target</th>
                  <th className="right">Progress</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((fund) => {
                  const progress = fund.target_balance
                    ? Math.min((fund.balance / fund.target_balance) * 100, 100)
                    : null;
                  return (
                    <tr key={fund.id}>
                      <td className="bold color-cr">{fund.name}</td>
                      <td>{fund.fund_type}</td>
                      <td className="right mono">{money(fund.balance)}</td>
                      <td className="right mono">
                        {fund.target_balance ? money(fund.target_balance) : "-"}
                      </td>
                      <td className="right">
                        {progress === null ? (
                          "-"
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <div className="progress-track w-24">
                              <div className="progress-track__fill" style={{ width: `${progress}%` }} />
                            </div>
                            <span className="mono text-xs">{percent(progress, 0)}</span>
                          </div>
                        )}
                      </td>
                      <td className="right">
                        {canEdit(permissions, "funds") ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setEditing(fund)}
                            type="button"
                          >
                            Adjust
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            message={
              funds.loading
                ? "Loading funds..."
                : "No funds opened yet — most co-ownerships run a reserve and a sinking fund"
            }
          />
        )}
      </Section>

      {creating || editing ? (
        <FundModal
          fund={editing}
          fundTypes={funds.data?.fund_types ?? []}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
            setEditing(null);
            await funds.reload();
          }}
        />
      ) : null}
    </SyndicShell>
  );
}

function FundModal({
  fund,
  fundTypes,
  onClose,
  onSaved,
}: {
  fund: Fund | null;
  fundTypes: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [fundType, setFundType] = useState(fund?.fund_type ?? fundTypes[0] ?? "reserve");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    const body = {
      name: form.get("name"),
      fund_type: fundType,
      balance: form.get("balance"),
      target_balance: form.get("target_balance") || null,
    };
    try {
      if (fund) {
        await api(`/api/syndic/finance/funds/${fund.id}`, { method: "PATCH", body });
      } else {
        await api("/api/syndic/finance/funds", { method: "POST", body });
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the fund");
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
          <button className="btn btn-primary" disabled={saving} form="fund-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <Plus size={13} />}
            {fund ? "Save fund" : "Open fund"}
          </button>
        </>
      }
      icon={<Landmark size={17} />}
      onClose={onClose}
      subtitle={fund ? "Balance changes are written to the audit log" : undefined}
      title={fund ? `Adjust ${fund.name}` : "Open a fund"}
      wide
    >
      <form id="fund-form" onSubmit={submit}>
        {error ? <div className="notice notice--er">{error}</div> : null}

        <div className="form-grid">
          <div>
            <label className="label" htmlFor="name">
              Fund name
            </label>
            <input
              className="field"
              defaultValue={fund?.name ?? ""}
              id="name"
              name="name"
              placeholder="Reserve Fund"
              required
            />
          </div>
          <div>
            <label className="label">Type</label>
            <SelectMenu
              ariaLabel="Fund type"
              fullWidth
              onChange={setFundType}
              options={fundTypes.map((type) => ({ value: type, label: type }))}
              shape="field"
              value={fundType}
            />
          </div>
          <div>
            <label className="label" htmlFor="balance">
              Balance
            </label>
            <input
              className="field"
              defaultValue={fund?.balance ?? 0}
              id="balance"
              min={0}
              name="balance"
              step="0.01"
              type="number"
            />
          </div>
          <div>
            <label className="label" htmlFor="target_balance">
              Target
            </label>
            <input
              className="field"
              defaultValue={fund?.target_balance ?? ""}
              id="target_balance"
              min={0}
              name="target_balance"
              step="0.01"
              type="number"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}
