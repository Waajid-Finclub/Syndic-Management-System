"use client";

/**
 * EV charging.
 *
 * Sessions are metered by the charger and reported to the platform — the app
 * shows them, it does not create them. Each row carries kWh, duration and cost
 * so a resident can check the tariff was applied correctly, and the month
 * total matches what will appear on the next invoice.
 */

import { Zap } from "lucide-react";
import {
  Card,
  Empty,
  ScreenHeader,
  ScreenSkeleton,
  StaleDataNotice,
  SectionTitle,
  Status,
  formatDay,
  rs,
} from "@/components/resident/ui";
import { useResidentApi } from "@/lib/resident/hooks";
import type { EvSession, EvTotals, ParkingBay, StorageUnit } from "@/lib/resident/types";

type AssetsPayload = {
  parking: ParkingBay[];
  ev_bays: ParkingBay[];
  storage: StorageUnit[];
};

type BayPayload = {
  bay: ParkingBay;
  sessions: EvSession[];
  totals: EvTotals;
};

export default function EvScreen() {
  const assets = useResidentApi<AssetsPayload>("/api/resident/assets");
  const bayId = assets.data?.ev_bays[0]?.id ?? null;
  const detail = useResidentApi<BayPayload>(bayId ? `/api/resident/assets/ev/${bayId}` : null);

  if (assets.loading || (bayId && detail.loading && !detail.data)) {
    return (
      <div className="r-screen r-screen--plain">
        <ScreenHeader back="/app/home" title="EV charging" />
        <ScreenSkeleton rows={3} />
      </div>
    );
  }

  if (!bayId || !detail.data) {
    return (
      <div className="r-screen r-screen--plain">
        <ScreenHeader back="/app/home" title="EV charging" />
        <Empty icon={Zap} title="No charging bay">
          No EV charging bay is allocated to your unit. Your syndic manager can tell you whether
          the development has capacity to add one.
        </Empty>
      </div>
    );
  }

  const { bay, sessions, totals } = detail.data;

  return (
    <div className="r-screen r-screen--plain">
      <ScreenHeader back="/app/home" subtitle={`Bay ${bay.code}`} title="EV charging" />

      {assets.stale || detail.stale ? <StaleDataNotice /> : null}

      <Card accent>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span className="r-row__mark tint-tl" style={{ width: 46, height: 46 }}>
            <Zap size={20} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>
              Bay {bay.code}
            </div>
            <div className="r-muted">
              Level {bay.level ?? "—"} · {bay.charger_kw} kW {bay.charger_type} charger
            </div>
            <div className="text-accent" style={{ fontSize: 11, fontWeight: 600, marginTop: 2 }}>
              {rs(bay.tariff_per_kwh)} per kWh
            </div>
          </div>
        </div>
      </Card>

      <div className="r-kpi-grid">
        <div className="r-kpi">
          <span className="r-kpi__mark tint-tl">
            <Zap size={15} />
          </span>
          <div className="r-kpi__value">{totals.kwh.toFixed(1)} kWh</div>
          <div className="r-kpi__label">This month</div>
        </div>
        <div className="r-kpi">
          <span className="r-kpi__mark tint-neutral">
            <Zap size={15} />
          </span>
          <div className="r-kpi__value">{rs(totals.amount, false)}</div>
          <div className="r-kpi__label">
            {totals.session_count} session{totals.session_count === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <SectionTitle>Charging history</SectionTitle>

      {sessions.length === 0 ? (
        <Empty icon={Zap} title="No sessions yet">
          Charging sessions appear here as soon as the charger reports them.
        </Empty>
      ) : (
        <div className="r-list">
          {sessions.map((session) => (
            <div className="r-row" key={session.id}>
              <span className="r-row__mark tint-tl">
                <Zap size={15} />
              </span>
              <span className="r-row__body">
                <span className="r-row__title">
                  {session.kwh.toFixed(1)} kWh · {session.duration_label ?? "—"}
                </span>
                <span className="r-row__sub">
                  {formatDay(session.started_at)}
                  {session.vehicle_label ? ` · ${session.vehicle_label}` : ""}
                </span>
              </span>
              <span className="r-row__end">
                <span className="r-row__amount">{rs(session.amount)}</span>
                <Status value={session.status} />
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="r-muted" style={{ marginTop: 12, lineHeight: 1.6 }}>
        Sessions marked unbilled are metered but not yet invoiced. They are added to your next
        EV charging invoice at {rs(bay.tariff_per_kwh)} per kWh.
      </p>
    </div>
  );
}
