"use client";

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Download,
  Home,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { StatCard } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { downloadFile } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { compactMoney, money, monthLabel, number, percent } from "@/lib/format";
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

  return (
    <AppShell>
      <PageHeader
        title="Platform control centre"
        subtitle="The portfolio signals that need attention today."
        action={
          <div className="page__actions">
            <button
              className="btn btn-primary"
              onClick={() => downloadFile("/api/developments/export", "portfolio-report.csv")}
              type="button"
            >
              <Download size={13} />
              Export portfolio
            </button>
          </div>
        }
      />

      {overview.error ? <div className="notice notice--er">{overview.error}</div> : null}
      {overview.loading && !data ? <div className="loading-line">Loading platform figures...</div> : null}

      {data ? (
        <>
          <div className="kpi-grid kpi-grid--compact">
            <StatCard icon={Building2} label="Live properties" value={number(data.kpis.properties)} sub="Client developments" />
            <StatCard icon={Home} label="Managed units" value={number(data.kpis.units)} sub="Across the portfolio" />
            <StatCard
              icon={Wallet}
              label="Monthly recurring revenue"
              value={compactMoney(data.kpis.mrr)}
              sub={`Annualised ${compactMoney(data.kpis.arr)}`}
            />
          </div>

          <div className="split-grid">
            <Section title="Revenue growth" subtitle="Monthly recurring revenue over the last 12 months">
              <RevenueChart points={data.revenue_trend} />
            </Section>

            <Section title="Onboarding to unblock" subtitle="Properties grouped by the next delivery stage">
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
            title="Recent client properties"
            subtitle="A concise operational view of the newest developments"
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
                    <th className="right">Units</th>
                    <th>Status</th>
                    <th className="right">MRR</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_properties.map((property) => (
                    <tr key={property.id}>
                      <td className="bold color-cr">{property.name}</td>
                      <td>{property.syndic_manager_name ?? "-"}</td>
                      <td className="right mono">{number(property.unit_count)}</td>
                      <td>
                        <StatusPill value={property.status} />
                      </td>
                      <td className="right mono bold">{compactMoney(property.mrr)}</td>
                    </tr>
                  ))}
                  {!data.recent_properties.length ? (
                    <tr>
                      <td className="empty-cell" colSpan={5}>
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
