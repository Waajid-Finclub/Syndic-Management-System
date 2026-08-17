"use client";

/**
 * Home — the one screen a resident opens without a reason.
 *
 * Ordered by what people actually come here for: money owed, then the four
 * numbers worth glancing at, then their own assets, then what has happened
 * lately. The balance card leads because "what do I owe and by when" is the
 * question this app exists to answer.
 *
 * Everything is drawn from a single /home response — six screens' worth of
 * data in one round trip, which is the difference between instant and sluggish
 * on a phone connection.
 */

import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Banknote,
  Bell,
  Building2,
  CalendarDays,
  Dumbbell,
  Landmark,
  MessageSquare,
  SquareParking,
  TriangleAlert,
  Vote,
  Warehouse,
  Waves,
  Wrench,
  Zap,
} from "lucide-react";
import { ResolvedIcon, toneForCategory } from "@/components/resident/icons";
import { InstallPrompt } from "@/components/resident/shell";
import {
  Balance,
  Card,
  Empty,
  Mark,
  ScreenSkeleton,
  StaleDataNotice,
  SectionTitle,
  formatShortDay,
  relativeTime,
  rs,
  rsCompact,
} from "@/components/resident/ui";
import { useResidentApi } from "@/lib/resident/hooks";
import { useResident } from "@/lib/resident/session";
import type { Dashboard } from "@/lib/resident/types";

export default function HomeScreen() {
  const router = useRouter();
  const { user, unit } = useResident();
  const { data, loading, stale } = useResidentApi<Dashboard>("/api/resident/home");

  return (
    <>
      <header className="r-topbar">
        <div className="r-topbar__identity">
          <div className="r-topbar__greeting">{greeting()},</div>
          <div className="r-topbar__name">{user?.name ?? " "}</div>
          {unit ? (
            <>
              <div className="r-topbar__where">
                <Building2 size={12} />
                {unit.development?.name} · Unit {unit.label}
              </div>
              <div className="r-topbar__shares">
                {unit.tenure === "owner"
                  ? `Share ${unit.share_value.toLocaleString("en-GB")} / ${unit.total_shares.toLocaleString("en-GB")} (${unit.share_percent}%)`
                  : `Tenant · ${unit.unit_type}${unit.area_sqm ? ` · ${unit.area_sqm} m²` : ""}`}
              </div>
            </>
          ) : null}
        </div>
        <button
          aria-label="Notifications"
          className="r-iconbtn"
          onClick={() => router.push("/app/account/notifications")}
          type="button"
        >
          <Bell size={17} />
          {data && data.unread_notifications > 0 ? (
            <span className="r-iconbtn__badge">{data.unread_notifications}</span>
          ) : null}
        </button>
      </header>

      <div className="r-screen">
        {loading && !data ? <ScreenSkeleton /> : null}

        {data ? (
          <>
            <InstallPrompt />
            {stale ? <StaleDataNotice /> : null}

            {data.account ? <BalanceCard summary={data.account} /> : <TenantCard />}

            <div className="r-kpi-grid">
              {data.kpis.reserve_fund ? (
                <div className="r-kpi">
                  <span className="r-kpi__mark tint-ok">
                    <Landmark size={15} />
                  </span>
                  <div className="r-kpi__value">{rsCompact(data.kpis.reserve_fund.balance)}</div>
                  <div className="r-kpi__label">Reserve fund</div>
                </div>
              ) : null}

              <button className="r-kpi" onClick={() => router.push("/app/report")} type="button">
                <span className="r-kpi__mark tint-wn">
                  <Wrench size={15} />
                </span>
                <div className="r-kpi__value">{data.kpis.open_requests}</div>
                <div className="r-kpi__label">Open requests</div>
              </button>

              <button className="r-kpi" onClick={() => router.push("/app/coop")} type="button">
                <span className="r-kpi__mark tint-blu">
                  <CalendarDays size={15} />
                </span>
                <div className="r-kpi__value">
                  {data.kpis.next_meeting
                    ? formatShortDay(data.kpis.next_meeting.scheduled_for)
                    : "—"}
                </div>
                <div className="r-kpi__label">
                  {data.kpis.next_meeting ? data.kpis.next_meeting.reference : "No meeting set"}
                </div>
              </button>

              {data.kpis.open_votes === undefined ? null : (
                <button
                  className="r-kpi"
                  onClick={() => router.push("/app/coop/voting")}
                  type="button"
                >
                  <span className="r-kpi__mark tint-vio">
                    <Vote size={15} />
                  </span>
                  <div className="r-kpi__value">{data.kpis.open_votes}</div>
                  <div className="r-kpi__label">
                    {data.kpis.open_votes === 1 ? "Vote open" : "Votes open"}
                  </div>
                </button>
              )}
            </div>

            <SectionTitle>My property</SectionTitle>
            <AssetRail assets={data.assets} facilities={data.facilities} />

            <SectionTitle
              action={
                <button
                  className="r-section-row__link"
                  onClick={() => router.push("/app/account/notifications")}
                  type="button"
                >
                  See all
                </button>
              }
            >
              Recent activity
            </SectionTitle>

            {data.activity.length === 0 ? (
              <Empty icon={Bell} title="Nothing yet">
                Invoices, maintenance updates and notices will appear here.
              </Empty>
            ) : (
              <div className="r-list">
                {data.activity.map((entry) => (
                  <button
                    className="r-row"
                    key={entry.id}
                    onClick={() => entry.link_path && router.push(entry.link_path)}
                    type="button"
                  >
                    <span className={`r-row__mark ${toneForCategory(entry.category)}`}>
                      <ResolvedIcon name={entry.icon_key} size={15} />
                    </span>
                    <span className="r-row__body">
                      <span className="r-row__title">{entry.title}</span>
                      <span className="r-row__sub">{entry.body}</span>
                    </span>
                    <span className="r-row__time">{relativeTime(entry.created_at)}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </>
  );
}

function BalanceCard({ summary }: { summary: NonNullable<Dashboard["account"]> }) {
  const router = useRouter();
  const settled = summary.outstanding <= 0;

  return (
    <Card accent>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="r-label">Service charges due</div>
          <Balance amount={summary.outstanding} tone={settled ? "clear" : "due"} />

          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            {settled ? (
              <span className="pill pill--paid">All settled</span>
            ) : summary.is_overdue ? (
              <span className="pill pill--overdue">
                {summary.overdue_count} overdue
              </span>
            ) : null}

            {!settled && summary.days_until_due !== null ? (
              <span className="r-muted">
                {summary.days_until_due <= 0
                  ? "Due today"
                  : `Due in ${summary.days_until_due} day${summary.days_until_due === 1 ? "" : "s"}`}
              </span>
            ) : null}
          </div>

          {summary.is_overdue && summary.overdue_since ? (
            <div className="r-muted" style={{ marginTop: 6, display: "flex", gap: 5 }}>
              <TriangleAlert size={13} className="text-er" />
              Overdue since {formatShortDay(summary.overdue_since)}
            </div>
          ) : null}
        </div>

        {settled ? null : (
          <button
            className="r-btn r-btn--sm r-btn--accent"
            onClick={() => router.push("/app/finance/pay")}
            style={{ alignSelf: "flex-start", flexShrink: 0 }}
            type="button"
          >
            Pay
            <ArrowRight size={14} />
          </button>
        )}
      </div>

      <div
        className="r-muted"
        style={{ display: "flex", gap: 14, marginTop: 12, paddingTop: 11, borderTop: "1px solid var(--clg)" }}
      >
        <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
          <Banknote size={13} />
          {rs(summary.paid_ytd, false)} paid this year
        </span>
        <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
          <MessageSquare size={13} className="text-ok" />
          WhatsApp on
        </span>
      </div>
    </Card>
  );
}

/** Tenants have no service-charge liability — say so rather than showing Rs 0. */
function TenantCard() {
  return (
    <Card accent>
      <div className="r-label">Your tenancy</div>
      <p className="r-muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
        Service charges are billed to the owner of your unit, so there is no balance on this
        account. You can still report issues, book facilities and register visitors.
      </p>
    </Card>
  );
}

function AssetRail({
  assets,
  facilities,
}: {
  assets: Dashboard["assets"];
  facilities: Dashboard["facilities"];
}) {
  const router = useRouter();

  const items = [
    ...assets.parking.map((bay) => ({
      key: `p-${bay.id}`,
      icon: SquareParking,
      tone: "tint-blu",
      label: `Parking ${bay.code}`,
      sub: `${bay.allocation === "owner" ? "Owner allocated" : bay.allocation} · Level ${bay.level ?? "—"}`,
      href: "/app/assets/parking",
    })),
    ...assets.ev_bays.map((bay) => ({
      key: `e-${bay.id}`,
      icon: Zap,
      tone: "tint-tl",
      label: `EV bay ${bay.code}`,
      sub: bay.month_totals
        ? `${bay.month_totals.kwh.toFixed(1)} kWh this month`
        : `${bay.charger_kw ?? "—"} kW charger`,
      href: "/app/assets/ev",
    })),
    ...assets.storage.map((store) => ({
      key: `s-${store.id}`,
      icon: Warehouse,
      tone: "tint-wn",
      label: `Store ${store.code}`,
      sub: `${store.area_sqm ?? "—"} m² · ${store.access_method ?? "Allocated"}`,
      href: "/app/assets/storage",
    })),
    ...facilities.map((facility) => ({
      key: `f-${facility.id}`,
      icon: iconForFacility(facility.facility_type),
      tone: "tint-neutral",
      label: facility.name,
      sub: facility.is_open === null ? facility.hours_label ?? "" : facility.is_open ? "Open now" : "Closed now",
      href: "/app/coop/facilities",
    })),
  ];

  if (items.length === 0) {
    return (
      <Empty icon={SquareParking} title="Nothing allocated">
        No parking bay, storage unit or charging bay is allocated to your unit.
      </Empty>
    );
  }

  return (
    <div className="r-rail">
      {items.map((item) => (
        <button
          className="r-rail__item"
          key={item.key}
          onClick={() => router.push(item.href)}
          type="button"
        >
          <Mark icon={item.icon} size={30} iconSize={15} tone={item.tone} />
          <div className="r-rail__label">{item.label}</div>
          <div className="r-rail__sub">{item.sub}</div>
        </button>
      ))}
    </div>
  );
}

function iconForFacility(type: string) {
  switch (type) {
    case "gym":
      return Dumbbell;
    case "pool":
      return Waves;
    case "hall":
      return Landmark;
    default:
      return Building2;
  }
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
