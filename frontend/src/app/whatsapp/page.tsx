"use client";

import { useState } from "react";
import { CheckCheck, Eye, Inbox, MessageSquare, Send, Wallet, XCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { StatCard } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { Tabs } from "@/components/tabs";
import { compactMoney, compactNumber, money, number, percent } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { WhatsAppResponse } from "@/lib/types";
import { MessageCenter } from "./message-center";

const TABS = [
  { key: "status", label: "Status" },
  { key: "center", label: "WhatsApp Centre" },
];

export default function WhatsAppPage() {
  const [tab, setTab] = useState("status");
  const whatsapp = useApi<WhatsAppResponse>("/api/whatsapp/");
  const data = whatsapp.data;
  const stats = data?.stats ?? null;

  return (
    <AppShell whatsappOk={Boolean(stats && stats.queue_depth < 50)}>
      <PageHeader
        title="WhatsApp Business Integration"
        subtitle="Delivery performance, approved message templates and connected numbers"
      />

      <Tabs active={tab} items={TABS} onChange={setTab} />

      {tab === "center" ? (
        <MessageCenter onSent={() => void whatsapp.reload()} />
      ) : (
        <>
          {whatsapp.error ? <div className="notice notice--er">{whatsapp.error}</div> : null}
          {whatsapp.loading && !data ? <div className="loading-line">Loading WhatsApp status...</div> : null}

          {stats ? (
            <div className="kpi-grid">
              <StatCard icon={Send} label="Total sent" value={compactNumber(stats.total_sent)} sub={stats.period_month} />
              <StatCard
                icon={CheckCheck}
                label="Delivered"
                value={compactNumber(stats.delivered)}
                sub={percent(stats.delivered_pct, 0)}
              />
              <StatCard icon={Eye} label="Read" value={compactNumber(stats.read)} sub={percent(stats.read_pct, 0)} />
              <StatCard icon={XCircle} label="Failed" value={number(stats.failed)} sub={percent(stats.failed_pct)} />
              <StatCard icon={Inbox} label="Queue depth" value={number(stats.queue_depth)} sub="Pending dispatch" />
              <StatCard icon={Wallet} label="Monthly cost" value={compactMoney(stats.monthly_cost)} sub="Meta Cloud API" />
            </div>
          ) : null}

          <Section title="Message templates" subtitle="Meta-approved templates and their 30-day performance">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Template</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th className="right">Sent (30d)</th>
                    <th className="right">Delivered</th>
                    <th className="right">Read</th>
                    <th className="right">Cost / msg</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.templates ?? []).map((template) => (
                    <tr key={template.id}>
                      <td className="mono bold color-cr">{template.name}</td>
                      <td>{template.category}</td>
                      <td>
                        <StatusPill value={template.status} />
                      </td>
                      <td className="right mono">{template.sent_30d ? number(template.sent_30d) : "-"}</td>
                      <td className="right mono">{percent(template.delivered_pct, 0)}</td>
                      <td className="right mono">{percent(template.read_pct, 0)}</td>
                      <td className="right mono">{money(template.cost_per_message)}</td>
                    </tr>
                  ))}
                  {data && !data.templates.length ? (
                    <tr>
                      <td className="empty-cell" colSpan={7}>
                        No templates registered
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Connected numbers" subtitle="WhatsApp Business numbers registered against the platform">
            {(data?.numbers ?? []).map((entry) => (
              <div className="number-row" key={entry.id}>
                <span className="number-row__icon">
                  <MessageSquare size={15} />
                </span>
                <div className="number-row__copy">
                  <div className="number-row__name">{entry.display_name}</div>
                  <div className="number-row__phone">{entry.phone_number}</div>
                </div>
                <StatusPill value={entry.status} />
                <span className="chip">{number(entry.monthly_messages)} / mo</span>
              </div>
            ))}
            {data && !data.numbers.length ? <EmptyState message="No numbers connected" /> : null}
          </Section>
        </>
      )}
    </AppShell>
  );
}
