"use client";

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CircleParking,
  Download,
  Home,
  MessageSquare,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { MetricTile, StatCard } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { downloadFile } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { compactMoney, compactNumber, money, monthLabel, number, percent } from "@/lib/format";
import type { PlatformOverview } from "@/lib/types";

const PIPELINE_COLOURS: Record<string, string> = {
  prospect: "var(--cmt)",
  contracted: "var(--blu)",
  setup: "var(--cg2)",
  data_import: "var(--wn)",
  uat: "var(--vio)",
  go_live: "var(--ok)",
};

export default function DashboardPage() {
  const overview = useApi<PlatformOverview>("/api/platform/overview");
  const data = overview.data;

  const planMix = (data?.plan_mix ?? [])
    .map((plan) => `${plan.name} ${plan.clients}`)
    .join(" · ");

  return (
    <AppShell>
      <PageHeader
        title="Platform Overview"
        subtitle="SyndicMS SaaS · portfolio-wide figures across every client property"
        action={
          <div className="page__actions">
            <span className="chip">
              <CalendarDays size={12} />
              This month
            </span>
            <button
              className="btn btn-primary"
              onClick={() => downloadFile("/api/developments/export", "portfolio-report.csv")}
              type="button"
            >
              <Download size={13} />
              Report
            </button>
          </div>
        }
      />

      {overview.error ? <div className="notice notice--er">{overview.error}</div> : null}
      {overview.loading && !data ? <div className="loading-line">Loading platform figures...</div> : null}

      {data ? (
        <>
          <div className="kpi-grid">
            <StatCard icon={Building2} label="Properties" value={number(data.kpis.properties)} sub="Client developments" />
            <StatCard icon={Home} label="Units" value={number(data.kpis.units)} sub="Across the portfolio" />
            <StatCard
              icon={CircleParking}
              label="Parking"
              value={number(data.kpis.parking)}
              sub={`${number(data.kpis.ev_parking)} EV bays`}
            />
            <StatCard icon={Users} label="Portal users" value={number(data.kpis.users)} sub="Owners, tenants, staff" />
            <StatCard icon={Wallet} label="MRR" value={compactMoney(data.kpis.mrr)} sub={`ARR ${compactMoney(data.kpis.arr)}`} />
            <StatCard icon={TrendingUp} label="Uptime" value={data.kpis.uptime ?? "-"} sub="Rolling 30 days" />
          </div>

          <div className="metric-strip">
            <MetricTile
              label="Subscription revenue"
              value={compactMoney(data.kpis.mrr)}
              sub={planMix || "No plans configured"}
            />
            <MetricTile
              label="WhatsApp messages"
              value={data.whatsapp ? compactNumber(data.whatsapp.total_sent) : "-"}
              sub={data.whatsapp ? `${percent(data.whatsapp.delivered_pct, 0)} delivery rate` : "No traffic recorded"}
            />
            <MetricTile
              label="Setup fees"
              value={money(data.setup_fees_collected, 0)}
              sub="Free for the first 2 years"
            />
            <MetricTile
              label="WhatsApp cost"
              value={data.whatsapp ? compactMoney(data.whatsapp.monthly_cost) : "-"}
              sub="Current month to date"
            />
          </div>

          <div className="split-grid">
            <Section title="Revenue growth" subtitle="Monthly recurring revenue over the last 12 months">
              <RevenueChart points={data.revenue_trend} />
            </Section>

            <Section title="Onboarding pipeline" subtitle="Client properties by implementation stage">
              {data.pipeline.map((stage) => (
                <div className="pipeline-row" key={stage.stage}>
                  <span
                    className="pipeline-row__dot"
                    style={{ background: PIPELINE_COLOURS[stage.stage] ?? "var(--cmt)" }}
                  />
                  <span className="pipeline-row__label">{stage.label}</span>
                  <span
                    className="pipeline-row__count"
                    style={{ color: PIPELINE_COLOURS[stage.stage] ?? "var(--ct)" }}
                  >
                    {stage.count}
                  </span>
                </div>
              ))}
            </Section>
          </div>

          <Section
            title="Client properties"
            subtitle="Most recently added developments"
            action={
              <Link className="btn btn-secondary btn-sm" href="/properties">
                View all {data.property_count}
                <ArrowRight size={13} />
              </Link>
            }
          >
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>Syndic</th>
                    <th>Plan</th>
                    <th className="right">Units</th>
                    <th className="right">Parking</th>
                    <th>Status</th>
                    <th className="right">MRR</th>
                    <th>WA</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_properties.map((property) => (
                    <tr key={property.id}>
                      <td className="bold color-cr">{property.name}</td>
                      <td>{property.syndic_manager_name ?? "-"}</td>
                      <td>
                        <StatusPill value={property.plan_code} />
                      </td>
                      <td className="right mono">{number(property.unit_count)}</td>
                      <td className="right mono">{number(property.parking_count)}</td>
                      <td>
                        <StatusPill value={property.status} />
                      </td>
                      <td className="right mono bold">{compactMoney(property.mrr)}</td>
                      <td>
                        {property.whatsapp_enabled ? (
                          <MessageSquare className="text-[var(--ok)]" size={13} />
                        ) : (
                          <span className="color-mt">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!data.recent_properties.length ? (
                    <tr>
                      <td className="empty-cell" colSpan={8}>
                        No client properties yet
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      ) : null}

      {!overview.loading && !data && !overview.error ? <EmptyState message="No platform data available" /> : null}
    </AppShell>
  );
}

function RevenueChart({ points }: { points: PlatformOverview["revenue_trend"] }) {
  if (!points.length) return <EmptyState message="No revenue history recorded" />;

  const max = Math.max(...points.map((point) => point.mrr_amount), 1);
  const first = points[0];
  const last = points[points.length - 1];
  const growth = first.mrr_amount ? ((last.mrr_amount - first.mrr_amount) / first.mrr_amount) * 100 : 0;

  return (
    <>
      <div className="revenue-chart">
        {points.map((point, index) => (
          <div
            className="revenue-chart__col"
            key={point.period_month}
            title={`${point.period_month}: ${money(point.mrr_amount, 0)}`}
          >
            <span
              className={`revenue-chart__bar ${index === points.length - 1 ? "revenue-chart__bar--current" : ""}`}
              style={{ height: `${Math.max((point.mrr_amount / max) * 100, 4)}%` }}
            />
            <span className="revenue-chart__label">{monthLabel(point.period_month)}</span>
          </div>
        ))}
      </div>
      <div className="revenue-chart__foot">
        <span>{compactMoney(first.mrr_amount)}</span>
        <span className="bold color-cr">
          {compactMoney(last.mrr_amount)} &uarr; {percent(growth, 0)}
        </span>
      </div>
    </>
  );
}
