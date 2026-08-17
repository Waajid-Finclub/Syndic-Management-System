"use client";

/**
 * Maintenance requests raised by this resident.
 *
 * The chips carry live counts so the shape of the queue is visible before
 * anything is tapped — "2 open, 1 in progress" is the answer most people came
 * for, and they never have to open a list to get it.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, CalendarClock, MapPin, MessageSquare, Plus, Wrench } from "lucide-react";
import { ResolvedIcon, toneForPriority } from "@/components/resident/icons";
import {
  Chips,
  Empty,
  ScreenHeader,
  ScreenSkeleton,
  StaleDataNotice,
  TapCard,
  formatShortDay,
  titleCase,
} from "@/components/resident/ui";
import { useResidentApi } from "@/lib/resident/hooks";
import type { MaintenanceFilter, MaintenanceMeta, MaintenanceRequest } from "@/lib/resident/types";

type ListPayload = {
  requests: MaintenanceRequest[];
  counts: Record<string, number>;
  filters: MaintenanceFilter[];
  status: string;
};

export default function ReportScreen() {
  const router = useRouter();
  const [status, setStatus] = useState("open");

  const { data, loading, stale } = useResidentApi<ListPayload>(
    `/api/resident/maintenance?status=${status}`,
  );
  const meta = useResidentApi<MaintenanceMeta>("/api/resident/maintenance/meta");

  const categoryIcons = new Map(
    (meta.data?.categories ?? []).map((category) => [category.key, category.icon]),
  );

  const chips = (data?.filters ?? []).map((filter) => ({
    key: filter.key,
    label: filter.label,
    count: data?.counts[filter.key] ?? 0,
  }));

  return (
    <div className="r-screen">
      <ScreenHeader
        action={
          <button
            className="r-btn r-btn--sm r-btn--primary"
            onClick={() => router.push("/app/report/new")}
            type="button"
          >
            <Plus size={14} />
            Report
          </button>
        }
        subtitle="Your unit, common areas, parking and facilities"
        title="Maintenance"
      />

      {chips.length > 0 ? (
        <Chips
          onChange={setStatus}
          options={[...chips, { key: "all", label: "All" }]}
          value={status}
        />
      ) : null}

      {loading && !data ? <ScreenSkeleton rows={4} /> : null}
      {stale ? <StaleDataNotice /> : null}

      {data && data.requests.length === 0 ? (
        <Empty
          action={
            <button
              className="r-btn r-btn--sm r-btn--primary"
              onClick={() => router.push("/app/report/new")}
              type="button"
            >
              <Plus size={14} />
              Report an issue
            </button>
          }
          icon={Wrench}
          title="Nothing here"
        >
          You have no requests with this status.
        </Empty>
      ) : null}

      {data?.requests.map((request) => (
        <TapCard key={request.id} onClick={() => router.push(`/app/report/${request.id}`)}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span className={`r-row__mark ${toneForPriority(request.priority)}`}>
              <ResolvedIcon name={categoryIcons.get(request.category)} size={16} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{request.title}</div>
              <div
                className="r-muted"
                style={{ display: "flex", gap: 10, marginTop: 3, flexWrap: "wrap", fontSize: 11 }}
              >
                <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                  <MapPin size={11} />
                  {request.location_label}
                </span>
                <span>{formatShortDay(request.created_at)}</span>
              </div>
            </div>
            <span className={`pill pill--${request.priority}`}>{titleCase(request.priority)}</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginTop: 11,
              paddingTop: 10,
              borderTop: "1px solid var(--clg)",
            }}
          >
            <span className={`pill pill--${request.status}`}>{request.status_label}</span>
            {request.vendor_name ? (
              <span className="r-muted" style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                <Building2 size={12} />
                {request.vendor_name}
              </span>
            ) : null}
          </div>

          {request.eta_label ? (
            <div
              className="r-notice r-notice--info"
              style={{ marginTop: 10, marginBottom: 0, padding: "8px 11px" }}
            >
              <CalendarClock size={14} />
              <div style={{ display: "flex", width: "100%", justifyContent: "space-between", gap: 8 }}>
                <span>Vendor scheduled</span>
                <strong>{request.eta_label}</strong>
              </div>
            </div>
          ) : null}
        </TapCard>
      ))}

      {data && data.requests.length > 0 ? (
        <div
          className="r-muted"
          style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center", marginTop: 12 }}
        >
          <MessageSquare size={13} className="text-ok" />
          Status changes are also sent by WhatsApp
        </div>
      ) : null}
    </div>
  );
}
