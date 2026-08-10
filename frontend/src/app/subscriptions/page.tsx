"use client";

import { CheckCircle2, PartyPopper } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { MetricTile } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { compactMoney, money, number, percent } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { SubscriptionResponse } from "@/lib/types";

export default function SubscriptionsPage() {
  const subscriptions = useApi<SubscriptionResponse>("/api/subscriptions/");
  const data = subscriptions.data;

  return (
    <AppShell>
      <PageHeader
        title="Subscriptions & Pricing"
        subtitle="Plan catalog, per-property contracts and the platform's recurring revenue"
      />

      {subscriptions.error ? <div className="notice notice--er">{subscriptions.error}</div> : null}
      {subscriptions.loading && !data ? <div className="loading-line">Loading subscriptions...</div> : null}

      {data ? (
        <>
          <div className="notice notice--ok">
            <PartyPopper size={17} />
            <div>
              <div className="notice__title">{data.promo.headline}</div>
              <div className="notice__sub">{data.promo.detail}</div>
            </div>
          </div>

          <div className="plan-grid">
            {data.plans.map((plan) => (
              <article className={`plan-card ${plan.is_popular ? "plan-card--popular" : ""}`} key={plan.id}>
                {plan.is_popular ? <span className="plan-card__badge">Most popular</span> : null}
                <div className="plan-card__name">{plan.name}</div>
                <div className="plan-card__price">
                  <span className="plan-card__amount">MUR {number(plan.monthly_unit_rate)}</span>
                  <span className="plan-card__unit">/ unit / month</span>
                </div>
                <div className="plan-card__vat">
                  MUR {number(plan.rate_incl_vat, 2)} incl. {number(plan.vat_rate)}% VAT
                </div>
                <ul className="plan-card__features">
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <CheckCircle2 size={13} />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="plan-card__foot">
                  {plan.client_count} client{plan.client_count === 1 ? "" : "s"}
                </div>
              </article>
            ))}
          </div>

          <div className="metric-strip">
            <MetricTile label="MRR" value={compactMoney(data.metrics.mrr)} sub="Exclusive of VAT" />
            <MetricTile label="ARR" value={compactMoney(data.metrics.arr)} sub="MRR × 12" />
            <MetricTile label="Churn" value={percent(data.metrics.churn_pct)} sub="Cancelled / total" />
            <MetricTile label="ARPC" value={compactMoney(data.metrics.arpc)} sub="Average revenue per client" />
            <MetricTile label="Clients" value={number(data.metrics.client_count)} sub="Trial and active" />
            <MetricTile label="LTV" value={compactMoney(data.metrics.ltv)} sub="At the current churn rate" />
          </div>

          <Section
            title="Property subscriptions"
            subtitle="Every contracted development and what it bills each month"
          >
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>Plan</th>
                    <th className="right">Rate / unit</th>
                    <th className="right">Billed units</th>
                    <th className="right">MRR</th>
                    <th className="right">Incl. VAT</th>
                    <th>Status</th>
                    <th>Started</th>
                  </tr>
                </thead>
                <tbody>
                  {data.subscriptions.map((subscription) => (
                    <tr key={subscription.id}>
                      <td className="bold color-cr">{subscription.development_name ?? "-"}</td>
                      <td>
                        <StatusPill value={subscription.plan_code} />
                      </td>
                      <td className="right mono">{money(subscription.monthly_unit_rate, 0)}</td>
                      <td className="right mono">{number(subscription.active_units_count)}</td>
                      <td className="right mono bold">{money(subscription.mrr, 0)}</td>
                      <td className="right mono">{money(subscription.mrr_incl_vat, 0)}</td>
                      <td>
                        <StatusPill value={subscription.status} />
                      </td>
                      <td>{subscription.start_date ?? "-"}</td>
                    </tr>
                  ))}
                  {!data.subscriptions.length ? (
                    <tr>
                      <td className="empty-cell" colSpan={8}>
                        No subscriptions yet
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      ) : null}

      {!subscriptions.loading && !data && !subscriptions.error ? (
        <EmptyState message="No subscription data available" />
      ) : null}
    </AppShell>
  );
}
