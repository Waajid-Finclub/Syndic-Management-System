"use client";

import { useState } from "react";
import { Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { MetricTile } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { api } from "@/lib/api";
import { formatDate, number, relativeTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { canCreate, canDelete } from "@/lib/permissions";
import type { ApiKey, IntegrationsResponse, User } from "@/lib/types";

export default function IntegrationsPage() {
  const session = useApi<{ user: User | null }>("/api/auth/me");
  const integrations = useApi<IntegrationsResponse>("/api/integrations/");
  const [creating, setCreating] = useState(false);
  const [issuedKey, setIssuedKey] = useState<ApiKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<number | null>(null);

  const user = session.data?.user ?? null;
  const data = integrations.data;

  async function revoke(key: ApiKey) {
    setBusyKey(key.id);
    setError(null);
    try {
      await api(`/api/integrations/keys/${key.id}`, { method: "DELETE" });
      await integrations.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke the key");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="API & Integrations"
        subtitle="Outbound connectors, the public API surface and issued platform keys"
        action={
          canCreate(user, "integrations") ? (
            <button className="btn btn-primary" onClick={() => setCreating(true)} type="button">
              <Plus size={13} />
              New API key
            </button>
          ) : null
        }
      />

      {error ? <div className="notice notice--er">{error}</div> : null}
      {integrations.error ? <div className="notice notice--er">{integrations.error}</div> : null}
      {integrations.loading && !data ? <div className="loading-line">Loading integrations...</div> : null}

      {data?.api_metrics.length ? (
        <div className="metric-strip">
          {data.api_metrics.map((metric) => (
            <MetricTile center key={metric.id} label={metric.label} value={metric.value_text} />
          ))}
        </div>
      ) : null}

      <Section title="Active integrations" subtitle="Connectors the platform depends on">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Integration</th>
                <th>Protocol</th>
                <th>Direction</th>
                <th>Status</th>
                <th>Last sync</th>
                <th className="right">Requests / day</th>
              </tr>
            </thead>
            <tbody>
              {(data?.integrations ?? []).map((integration) => (
                <tr key={integration.id}>
                  <td className="bold color-cr">{integration.name}</td>
                  <td>{integration.protocol ?? "-"}</td>
                  <td>{integration.direction ?? "-"}</td>
                  <td>
                    <StatusPill value={integration.status} />
                  </td>
                  <td>{integration.last_sync_label ?? "-"}</td>
                  <td className="right mono">{number(integration.requests_per_day)}</td>
                </tr>
              ))}
              {data && !data.integrations.length ? (
                <tr>
                  <td className="empty-cell" colSpan={6}>
                    No integrations configured
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="API keys"
        subtitle="Keys are shown once at creation and stored only as a hash"
        action={<KeyRound className="text-[var(--cr)]" size={17} />}
      >
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th>Created</th>
                <th>Last used</th>
                <th>Status</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.api_keys ?? []).map((key) => (
                <tr key={key.id}>
                  <td className="bold color-cr">{key.name}</td>
                  <td className="mono">{key.key_prefix}...</td>
                  <td>{formatDate(key.created_at)}</td>
                  <td>{key.last_used_at ? relativeTime(key.last_used_at) : "Never"}</td>
                  <td>
                    <StatusPill value={key.is_active ? "active" : "disabled"} />
                  </td>
                  <td className="right">
                    {key.is_active && canDelete(user, "integrations") ? (
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={busyKey === key.id}
                        onClick={() => revoke(key)}
                        type="button"
                      >
                        {busyKey === key.id ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />}
                        Revoke
                      </button>
                    ) : (
                      <span className="color-mt">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {data && !data.api_keys.length ? (
                <tr>
                  <td className="empty-cell" colSpan={6}>
                    No API keys issued
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="API endpoints" subtitle="OpenAPI 3.0 surface exposed to partner integrations">
        {data?.endpoints.length ? (
          <div className="endpoint-grid">
            {data.endpoints.map((endpoint) => (
              <span className="endpoint-chip" key={endpoint}>
                {endpoint}
              </span>
            ))}
          </div>
        ) : (
          <EmptyState message="No endpoints published" />
        )}
      </Section>

      {creating ? (
        <CreateKeyModal
          onClose={() => setCreating(false)}
          onCreated={async (key) => {
            setCreating(false);
            setIssuedKey(key);
            await integrations.reload();
          }}
        />
      ) : null}

      {issuedKey?.plaintext_key ? (
        <Modal
          footer={
            <button className="btn btn-primary" onClick={() => setIssuedKey(null)} type="button">
              I have copied it
            </button>
          }
          icon={<KeyRound size={17} />}
          onClose={() => setIssuedKey(null)}
          subtitle="Copy this now — it is stored as a hash and cannot be shown again"
          title={issuedKey.name}
        >
          <div className="notice notice--warn">
            <Copy size={15} />
            <div>
              <div className="notice__title">One-time secret</div>
              <div className="notice__sub">Anyone holding this key can call the platform API as this integration.</div>
            </div>
          </div>
          <code className="mono block w-full break-all rounded-lg border border-[var(--cbr)] bg-[var(--cc)] p-3 text-xs">
            {issuedKey.plaintext_key}
          </code>
        </Modal>
      ) : null}
    </AppShell>
  );
}

function CreateKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (key: ApiKey) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);

    try {
      const key = await api<ApiKey>("/api/integrations/keys", {
        method: "POST",
        body: { name: form.get("name") },
      });
      await onCreated(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the key");
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
          <button className="btn btn-primary" disabled={saving} form="create-key-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <Plus size={13} />}
            {saving ? "Issuing..." : "Issue key"}
          </button>
        </>
      }
      icon={<KeyRound size={17} />}
      onClose={onClose}
      subtitle="Name the integration this key belongs to"
      title="New API key"
    >
      <form id="create-key-form" onSubmit={submit}>
        {error ? <div className="notice notice--er">{error}</div> : null}
        <label className="label" htmlFor="name">
          Integration name
        </label>
        <input className="field" id="name" name="name" placeholder="e.g. Portfolio reporting" required />
      </form>
    </Modal>
  );
}
