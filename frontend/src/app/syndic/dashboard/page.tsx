"use client";

/**
 * Syndic dashboard — what is wrong in this building this morning.
 *
 * Deliberately a different question from the operator's Platform Overview one
 * layer up, which asks how the portfolio is doing. Here the ordering is by
 * urgency: money owed, work outstanding, decisions pending. Every tile links to
 * the screen that acts on it, because a dashboard that only informs is a
 * dashboard people stop opening.
 */

import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  Building2,
  CalendarClock,
  Megaphone,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { MetricTile, StatCard } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { SyndicShell } from "@/components/syndic/shell";
import { compactMoney, formatDate, money, number, percent, relativeTime } from "@/lib/format";
import { useSyndicApi } from "@/lib/syndic/hooks";
import { useSyndic } from "@/lib/syndic/session";
import type { SyndicOverview } from "@/lib/syndic/types";

export default function SyndicDashboardPage() {
  const { development } = useSyndic();
  const { data, error, loading } = useSyndicApi<SyndicOverview>("/api/syndic/overview");

  const kpis = data?.kpis;

  return (
    <SyndicShell>
      <PageHeader
        title={development?.name ?? "Development overview"}
        subtitle={
          development
            ? `${development.code} · ${development.location ?? "Mauritius"} · ${number(
                development.unit_count,
              )} units`
            : "Loading..."
        }
      />

      {error ? <div className="notice notice--er">{error}</div> : null}

      {kpis ? (
        <>
          <div className="kpi-grid">
            <StatCard
              icon={Banknote}
              label="Outstanding"
              sub={`${number(kpis.overdue_units)} unit${kpis.overdue_units === 1 ? "" : "s"} in arrears`}
              value={compactMoney(kpis.outstanding)}
            />
            <StatCard
              icon={AlertTriangle}
              label="Overdue"
              sub="Past the due date"
              tone="text-[var(--er)]"
              value={compactMoney(kpis.overdue)}
            />
            <StatCard
              icon={TrendingUp}
              label="Collection rate"
              sub={`${compactMoney(kpis.collected_this_month)} received this month`}
              value={percent(kpis.collection_rate)}
            />
            <StatCard
              icon={Wrench}
              label="Open jobs"
              sub={`${number(kpis.urgent_requests)} urgent or emergency`}
              tone={kpis.urgent_requests > 0 ? "text-[var(--wn)]" : undefined}
              value={number(kpis.open_requests)}
            />
          </div>

          <div className="metric-strip">
            <MetricTile center label="Units" value={number(kpis.units)} />
            <MetricTile
              center
              label="Units with an owner"
              sub={`${number(kpis.units - kpis.units_with_owner)} unallocated`}
              value={number(kpis.units_with_owner)}
            />
            <MetricTile center label="Co-owner accounts" value={number(kpis.co_owner_accounts)} />
            <MetricTile center label="Shares allocated" value={number(kpis.total_shares)} />
            <MetricTile center label="Bookings today" value={number(data.today.bookings)} />
            <MetricTile center label="Visitors today" value={number(data.today.visitors)} />
          </div>
        </>
      ) : null}

      {loading && !data ? <div className="loading-line" /> : null}

      <div className="split-grid">
        <Section
          action={
            <Link className="btn btn-secondary btn-sm" href="/syndic/finance?tab=arrears">
              All arrears
            </Link>
          }
          subtitle="Highest balances first — where collection effort goes"
          title="Who owes the most"
        >
          {data && data.arrears_top.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>Co-owner</th>
                    <th className="right">Balance</th>
                    <th className="right">Overdue</th>
                    <th className="right">Days</th>
                  </tr>
                </thead>
                <tbody>
                  {data.arrears_top.map((row) => (
                    <tr key={row.unit_id}>
                      <td className="bold color-cr">{row.unit_label}</td>
                      <td className="wrap">{row.owners.join(", ") || "Unallocated"}</td>
                      <td className="right mono">{money(row.balance)}</td>
                      <td className="right mono color-er">
                        {row.overdue > 0 ? money(row.overdue) : "-"}
                      </td>
                      <td className="right">{row.days_overdue || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message={loading ? "Loading..." : "Nothing outstanding — every unit is settled"} />
          )}
        </Section>

        <Section
          action={
            <Link className="btn btn-secondary btn-sm" href="/syndic/maintenance">
              Full queue
            </Link>
          }
          subtitle="Newest first"
          title="Open maintenance"
        >
          {data && data.recent_requests.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Issue</th>
                    <th>Unit</th>
                    <th>Priority</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_requests.map((row) => (
                    <tr key={row.id}>
                      <td className="mono">
                        <Link className="font-semibold" href={`/syndic/maintenance/${row.id}`}>
                          {row.reference}
                        </Link>
                      </td>
                      <td className="wrap bold color-cr">{row.title}</td>
                      <td>{row.unit_label ?? "Common"}</td>
                      <td>
                        <StatusPill value={row.priority} />
                      </td>
                      <td>
                        <StatusPill value={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message={loading ? "Loading..." : "No open maintenance requests"} />
          )}
        </Section>
      </div>

      <div className="split-grid">
        <Section subtitle="Money set aside by the co-ownership" title="Funds">
          {data && data.funds.length ? (
            <div className="metric-strip">
              {data.funds.map((fund) => (
                <MetricTile
                  key={fund.id}
                  label={fund.name}
                  sub={
                    fund.target_balance
                      ? `Target ${compactMoney(fund.target_balance)}`
                      : "No target set"
                  }
                  value={compactMoney(fund.balance)}
                />
              ))}
            </div>
          ) : (
            <EmptyState message="No funds opened yet" />
          )}

          {data?.last_billing_run ? (
            <div className="notice notice--info mt-4">
              <Banknote size={15} />
              <div>
                <div className="notice__title">
                  Last billing run — {data.last_billing_run.period_label}
                </div>
                <div className="notice__sub">
                  {number(data.last_billing_run.invoice_count)} invoices totalling{" "}
                  {money(data.last_billing_run.total_amount)}, issued by{" "}
                  {data.last_billing_run.run_by_label ?? "the office"}.
                </div>
              </div>
            </div>
          ) : data ? (
            <div className="notice notice--warn mt-4">
              <Banknote size={15} />
              <div>
                <div className="notice__title">No billing run yet</div>
                <div className="notice__sub">
                  Set a monthly charge on each unit, then run the first cycle from Billing &amp;
                  Payments.
                </div>
              </div>
            </div>
          ) : null}
        </Section>

        <Section subtitle="Meetings and notices" title="Coming up">
          {data && (data.upcoming_meetings.length || data.recent_announcements.length) ? (
            <>
              {data.upcoming_meetings.map((meeting) => (
                <div className="alert-row" key={`meeting-${meeting.id}`}>
                  <span className="alert-row__icon">
                    <CalendarClock size={13} />
                  </span>
                  <span className="alert-row__message">
                    <strong>{meeting.title}</strong> — {meeting.type_label},{" "}
                    {formatDate(meeting.scheduled_for)}
                  </span>
                  <span className="alert-row__time">
                    <StatusPill value={meeting.status} />
                  </span>
                </div>
              ))}
              {data.recent_announcements.map((announcement) => (
                <div className="alert-row" key={`notice-${announcement.id}`}>
                  <span className="alert-row__icon">
                    <Megaphone size={13} />
                  </span>
                  <span className="alert-row__message">{announcement.title}</span>
                  <span className="alert-row__time">
                    {relativeTime(announcement.published_at)}
                  </span>
                </div>
              ))}
            </>
          ) : (
            <EmptyState message="No meetings scheduled and no recent notices" />
          )}
        </Section>
      </div>

      {data && kpis && kpis.units === 0 ? (
        <div className="notice notice--warn">
          <Building2 size={15} />
          <div>
            <div className="notice__title">This development has no units yet</div>
            <div className="notice__sub">
              Start in the Property Registry: add blocks, then units with their share
              allocation. Everything else — billing, voting, co-owner accounts — hangs off
              that.
            </div>
          </div>
        </div>
      ) : null}

      {data && kpis && kpis.units > 0 && kpis.co_owner_accounts === 0 ? (
        <div className="notice notice--info">
          <Users size={15} />
          <div>
            <div className="notice__title">No co-owner accounts yet</div>
            <div className="notice__sub">
              Invite co-owners from the Co-Owners screen — one at a time, or by CSV import
              against the unit registry.
            </div>
          </div>
        </div>
      ) : null}
    </SyndicShell>
  );
}
