"use client";

/**
 * My parking.
 *
 * Read-only: a bay is allocated by the syndic as a term of the co-ownership,
 * not claimed in an app. What the screen adds is the detail a resident
 * actually needs to give a guest or a contractor — which bay, which level, and
 * how visitor parking works.
 */

import { useRouter } from "next/navigation";
import { ArrowRight, SquareParking, UserPlus, Zap } from "lucide-react";
import {
  Card,
  DefRow,
  Empty,
  Notice,
  ScreenHeader,
  ScreenSkeleton,
  StaleDataNotice,
  SectionTitle,
  TapCard,
  titleCase,
} from "@/components/resident/ui";
import { useResidentApi } from "@/lib/resident/hooks";
import type { ParkingBay, StorageUnit } from "@/lib/resident/types";

type AssetsPayload = {
  parking: ParkingBay[];
  ev_bays: ParkingBay[];
  storage: StorageUnit[];
};

export default function ParkingScreen() {
  const router = useRouter();
  const { data, loading, stale } = useResidentApi<AssetsPayload>("/api/resident/assets");

  return (
    <div className="r-screen r-screen--plain">
      <ScreenHeader back="/app/home" title="My parking" />

      {loading && !data ? <ScreenSkeleton rows={2} /> : null}
      {stale ? <StaleDataNotice /> : null}

      {data && data.parking.length === 0 && data.ev_bays.length === 0 ? (
        <Empty icon={SquareParking} title="No bay allocated">
          No parking bay is allocated to your unit. Your syndic manager can confirm whether one
          is available to rent.
        </Empty>
      ) : null}

      {(data?.parking ?? []).map((bay) => (
        <Card accent key={bay.id}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <span className="r-row__mark tint-blu" style={{ width: 44, height: 44 }}>
              <SquareParking size={19} />
            </span>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>
                Bay {bay.code}
              </div>
              <div className="r-muted">Level {bay.level ?? "—"}</div>
            </div>
          </div>
          <DefRow label="Allocation">{titleCase(bay.allocation)} allocated</DefRow>
          <DefRow label="Status">{titleCase(bay.status)}</DefRow>
          <DefRow label="Unit">{bay.unit_label}</DefRow>
        </Card>
      ))}

      {data && data.ev_bays.length > 0 ? (
        <>
          <SectionTitle>Charging</SectionTitle>
          {data.ev_bays.map((bay) => (
            <TapCard key={bay.id} onClick={() => router.push("/app/assets/ev")}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <span className="r-row__mark tint-tl">
                  <Zap size={16} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="r-row__title">EV bay {bay.code}</div>
                  <div className="r-row__sub">
                    {bay.charger_kw} kW {bay.charger_type}
                    {bay.month_totals ? ` · ${bay.month_totals.kwh.toFixed(1)} kWh this month` : ""}
                  </div>
                </div>
                <ArrowRight className="text-mt" size={16} />
              </div>
            </TapCard>
          ))}
        </>
      ) : null}

      <SectionTitle>Visitors</SectionTitle>
      <Notice icon={UserPlus} tone="info">
        Visitor bays are shared. Pre-register a guest and one is reserved for the window you
        choose, with an access code for the gate.
      </Notice>
      <button
        className="r-btn r-btn--block"
        onClick={() => router.push("/app/coop/visitors")}
        type="button"
      >
        Register a visitor
        <ArrowRight size={15} />
      </button>
    </div>
  );
}
