"use client";

import { useState } from "react";
import { Download, Lock, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Tabs } from "@/components/tabs";
import { downloadFile } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { canExport } from "@/lib/permissions";
import type { AuditResponse, User } from "@/lib/types";

const ACTION_COLOURS: Record<string, string> = {
  CREATE: "var(--ok)",
  MODIFY: "var(--blu)",
  DELETE: "var(--er)",
  VOTE: "var(--vio)",
  CHARGE: "var(--tl)",
  BOOK: "var(--vio)",
  SEND: "var(--ok)",
  ASSIGN: "var(--wn)",
  REGISTER: "var(--blu)",
  BACKUP: "var(--ok)",
  LOGIN: "var(--cmt)",
};

export default function AuditPage() {
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");

  const session = useApi<{ user: User | null }>("/api/auth/me");
  const search = query.trim() ? `&q=${encodeURIComponent(query.trim())}` : "";
  const audit = useApi<AuditResponse>(`/api/audit?category=${category}${search}&limit=200`);

  const user = session.data?.user ?? null;
  const data = audit.data;
  const tabs = (data?.categories ?? []).map((item) => ({
    key: item.key,
    label: item.label,
    count: item.count,
  }));

  const exportUrl = `/api/audit/export?category=${category}${search}`;

  return (
    <AppShell>
      <PageHeader
        title="Audit Log"
        subtitle="Append-only record of every action taken across the platform"
        action={
          canExport(user, "audit") ? (
            <button
              className="btn btn-primary"
              onClick={() => downloadFile(exportUrl, "audit-log.csv")}
              type="button"
            >
              <Download size={13} />
              Export CSV
            </button>
          ) : null
        }
      />

      {audit.error ? <div className="notice notice--er">{audit.error}</div> : null}

      {tabs.length ? <Tabs active={category} items={tabs} onChange={setCategory} /> : null}

      <div className="section">
        <div className="section__header">
          <div>
            <h2 className="section__title">Activity</h2>
            <p className="section__sub">
              {data ? `${data.entries.length} of ${data.total} entries` : "Loading..."}
            </p>
          </div>
          <div className="searchbox">
            <Search size={14} />
            <input
              aria-label="Search the audit log"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search detail, user, entity..."
              value={query}
            />
          </div>
        </div>

        <div className="section__body section__body--flush">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Property</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {(data?.entries ?? []).map((entry) => (
                  <tr key={entry.id}>
                    <td className="mono">{formatDateTime(entry.occurred_at)}</td>
                    <td>{entry.user_label}</td>
                    <td>{entry.development_label}</td>
                    <td className="bold" style={{ color: ACTION_COLOURS[entry.action] ?? "var(--ct)" }}>
                      {entry.action}
                    </td>
                    <td>{entry.entity}</td>
                    <td className="wrap">{entry.detail}</td>
                  </tr>
                ))}
                {audit.loading && !data?.entries.length ? (
                  <tr>
                    <td className="empty-cell" colSpan={6}>
                      Loading audit entries...
                    </td>
                  </tr>
                ) : null}
                {!audit.loading && data && !data.entries.length ? (
                  <tr>
                    <td className="empty-cell" colSpan={6}>
                      No entries match this view
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {data ? (
        <div className="notice notice--info">
          <Lock size={15} />
          <div>
            <div className="notice__title">Immutable record</div>
            <div className="notice__sub">
              {data.retention_note} Total: {data.total.toLocaleString("en-GB")} entries.
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
