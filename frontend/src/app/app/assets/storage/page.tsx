"use client";

/**
 * My storage.
 *
 * Read-only for the same reason as parking: a store is allocated with the unit.
 * The access method matters more than it looks — "fob access" tells a resident
 * which key they need before walking down to the basement.
 */

import { Warehouse, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Card,
  DefRow,
  Empty,
  ScreenHeader,
  ScreenSkeleton,
  StaleDataNotice,
  titleCase,
} from "@/components/resident/ui";
import { useResidentApi } from "@/lib/resident/hooks";
import type { ParkingBay, StorageUnit } from "@/lib/resident/types";

type AssetsPayload = {
  parking: ParkingBay[];
  ev_bays: ParkingBay[];
  storage: StorageUnit[];
};

export default function StorageScreen() {
  const router = useRouter();
  const { data, loading, stale } = useResidentApi<AssetsPayload>("/api/resident/assets");

  return (
    <div className="r-screen r-screen--plain">
      <ScreenHeader back="/app/home" title="My storage" />

      {loading && !data ? <ScreenSkeleton rows={2} /> : null}
      {stale ? <StaleDataNotice /> : null}

      {data && data.storage.length === 0 ? (
        <Empty icon={Warehouse} title="No store allocated">
          No storage unit is allocated to your unit. Your syndic manager can confirm whether one
          is available.
        </Empty>
      ) : null}

      {(data?.storage ?? []).map((store) => (
        <Card accent key={store.id}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <span className="r-row__mark tint-wn" style={{ width: 44, height: 44 }}>
              <Warehouse size={19} />
            </span>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>
                Store {store.code}
              </div>
              <div className="r-muted">
                {store.area_sqm} m² · level {store.level ?? "—"}
              </div>
            </div>
          </div>
          <DefRow label="Allocation">{titleCase(store.allocation)} allocated</DefRow>
          <DefRow label="Access">{store.access_method ?? "—"}</DefRow>
          <DefRow label="Status">{titleCase(store.status)}</DefRow>
          <DefRow label="Unit">{store.unit_label}</DefRow>
        </Card>
      ))}

      {data && data.storage.length > 0 ? (
        <button
          className="r-btn r-btn--block"
          onClick={() => router.push("/app/report/new")}
          style={{ marginTop: 6 }}
          type="button"
        >
          <Wrench size={15} />
          Report a problem with a store
        </button>
      ) : null}
    </div>
  );
}
