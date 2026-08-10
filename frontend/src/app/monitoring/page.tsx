"use client";

import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Bug,
  Database,
  FileText,
  Gauge,
  HardDrive,
  Inbox,
  MessageSquare,
  Plug,
  Rocket,
  Tag,
  Timer,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { relativeTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { MonitoringResponse } from "@/lib/types";

const ICONS: Record<string, LucideIcon> = {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Bug,
  Database,
  FileText,
  Gauge,
  HardDrive,
  Inbox,
  MessageSquare,
  Plug,
  Rocket,
  Tag,
  Timer,
  Users,
};

const SEVERITY_COLOURS: Record<string, string> = {
  success: "var(--ok)",
  info: "var(--blu)",
  warning: "var(--wn)",
  error: "var(--er)",
};

export default function MonitoringPage() {
  const monitoring = useApi<MonitoringResponse>("/api/monitoring?group=system");
  const data = monitoring.data;
  const metrics = data?.metrics ?? [];

  return (
    <AppShell operational={data?.all_operational ?? true}>
      <PageHeader
        title="System Monitoring"
        subtitle="Live service health across the API, database, queues and storage"
        action={
          data ? (
            <span className={`topbar__status ${data.all_operational ? "" : "topbar__status--warn"}`}>
              <span className="topbar__dot" />
              {data.all_operational
                ? "All systems operational"
                : `${data.degraded_count} metric${data.degraded_count === 1 ? "" : "s"} need attention`}
            </span>
          ) : null
        }
      />

      {monitoring.error ? <div className="notice notice--er">{monitoring.error}</div> : null}
      {monitoring.loading && !data ? <div className="loading-line">Reading service health...</div> : null}

      {metrics.length ? (
        <div className="health-grid">
          {metrics.map((metric) => {
            const Icon = ICONS[metric.icon ?? ""] ?? Activity;
            return (
              <div className={`health-tile ${metric.is_ok ? "" : "health-tile--warn"}`} key={metric.id}>
                <div className="health-tile__top">
                  <Icon size={15} />
                  <span
                    className="topbar__dot"
                    style={{ background: metric.is_ok ? "var(--ok)" : "var(--wn)" }}
                  />
                </div>
                <div className="health-tile__value">{metric.value_text}</div>
                <div className="health-tile__label">{metric.label}</div>
                {metric.target_text ? (
                  <div className="health-tile__target">Target: {metric.target_text}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <Section title="Recent alerts" subtitle="Platform events from the last 24 hours">
        {(data?.alerts ?? []).map((alert) => (
          <div className="alert-row" key={alert.id}>
            <span
              className="alert-row__dot"
              style={{ background: SEVERITY_COLOURS[alert.severity] ?? "var(--cmt)" }}
            />
            <span className="alert-row__message">{alert.message}</span>
            <span className="alert-row__time">{relativeTime(alert.occurred_at)}</span>
          </div>
        ))}
        {data && !data.alerts.length ? <EmptyState message="No alerts recorded" /> : null}
      </Section>
    </AppShell>
  );
}
