"use client";

/**
 * Visitor pre-registration.
 *
 * The access code and PIN are generated server-side and shown here once the
 * pass exists. They are credentials the gate accepts, so they are displayed
 * plainly for the resident to pass on — and the pass can be cancelled, which
 * releases its visitor bay immediately.
 */

import { useState } from "react";
import {
  Car,
  CircleCheck,
  Hash,
  SquareParking,
  TriangleAlert,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { Sheet } from "@/components/resident/sheet";
import {
  Card,
  Empty,
  Notice,
  ScreenHeader,
  ScreenSkeleton,
  StaleDataNotice,
  SectionTitle,
  formatDayTime,
  titleCase,
} from "@/components/resident/ui";
import { api } from "@/lib/api";
import { useAction, useOnline, useResidentApi } from "@/lib/resident/hooks";
import type { VisitorPass } from "@/lib/resident/types";

type VisitorPayload = {
  upcoming: VisitorPass[];
  past: VisitorPass[];
  purposes: { key: string }[];
  parking_options: number[];
};

const PURPOSE_LABELS: Record<string, string> = {
  personal: "Personal",
  delivery: "Delivery",
  service: "Service",
  other: "Other",
};

export default function VisitorsScreen() {
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [purpose, setPurpose] = useState("personal");
  const [when, setWhen] = useState("");
  const [parkingHours, setParkingHours] = useState(0);
  const [issued, setIssued] = useState<VisitorPass | null>(null);

  const { data, loading, reload, stale } = useResidentApi<VisitorPayload>("/api/resident/visitors");

  const register = useAction(async () => {
    const payload = await api<{ visitor: VisitorPass }>("/api/resident/visitors", {
      method: "POST",
      body: {
        visitor_name: name.trim(),
        vehicle_registration: vehicle.trim() || null,
        purpose,
        expected_at: when,
        parking_hours: parkingHours,
      },
    });
    setIssued(payload.visitor);
    setOpen(false);
    setName("");
    setVehicle("");
    setWhen("");
    setParkingHours(0);
    await reload();
  });

  const cancel = useAction(async (id: number) => {
    await api(`/api/resident/visitors/${id}`, { method: "DELETE" });
    await reload();
  });

  return (
    <div className="r-screen r-screen--plain">
      <ScreenHeader
        action={
          <button
            className="r-btn r-btn--sm r-btn--primary"
            onClick={() => setOpen(true)}
            type="button"
          >
            <UserPlus size={14} />
            Register
          </button>
        }
        back="/app/coop"
        title="Visitors"
      />

      {issued ? (
        <Card accent>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 11 }}>
            <span className="r-row__mark tint-ok">
              <CircleCheck size={16} />
            </span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Pass issued</div>
              <div className="r-muted">{issued.visitor_name}</div>
            </div>
          </div>
          <Credentials pass={issued} />
          <p className="r-muted" style={{ marginTop: 10, lineHeight: 1.55 }}>
            The code and PIN have also been sent to your WhatsApp so you can forward them.
          </p>
        </Card>
      ) : null}

      {cancel.error ? (
        <Notice icon={TriangleAlert} tone="er">
          {cancel.error}
        </Notice>
      ) : null}

      {loading && !data ? <ScreenSkeleton rows={3} /> : null}
      {stale ? <StaleDataNotice /> : null}

      <SectionTitle>Expected</SectionTitle>
      {data && data.upcoming.length === 0 ? (
        <Empty
          action={
            <button className="r-btn r-btn--sm r-btn--primary" onClick={() => setOpen(true)} type="button">
              <UserPlus size={14} />
              Register a visitor
            </button>
          }
          icon={UserCheck}
          title="No visitors expected"
        >
          Registering a guest ahead of time gets them through the gate without a phone call.
        </Empty>
      ) : null}

      {(data?.upcoming ?? []).map((pass) => (
        <Card key={pass.id}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{pass.visitor_name}</div>
              <div className="r-muted" style={{ marginTop: 2 }}>
                {formatDayTime(pass.expected_at)} · {PURPOSE_LABELS[pass.purpose] ?? titleCase(pass.purpose)}
              </div>
              <div
                className={pass.parking_hours ? "text-accent" : "text-mt"}
                style={{ fontSize: 11, marginTop: 3, display: "flex", gap: 5, alignItems: "center" }}
              >
                <SquareParking size={12} />
                {pass.parking_label}
              </div>
              {pass.vehicle_registration ? (
                <div className="r-muted" style={{ fontSize: 11, marginTop: 2, display: "flex", gap: 5 }}>
                  <Car size={12} />
                  {pass.vehicle_registration}
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <span className={`pill pill--${pass.status}`}>{titleCase(pass.status)}</span>
              <button
                className="r-btn r-btn--sm r-btn--ghost"
                disabled={cancel.pending || !online}
                onClick={() => void cancel.run(pass.id)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>

          {pass.access_code ? (
            <div style={{ marginTop: 11, paddingTop: 11, borderTop: "1px solid var(--clg)" }}>
              <Credentials pass={pass} />
            </div>
          ) : null}
        </Card>
      ))}

      {data && data.past.length > 0 ? (
        <>
          <SectionTitle>Past</SectionTitle>
          <div className="r-list">
            {data.past.map((pass) => (
              <div className="r-row" key={pass.id}>
                <span className="r-row__mark tint-neutral">
                  <UserCheck size={15} />
                </span>
                <span className="r-row__body">
                  <span className="r-row__title">{pass.visitor_name}</span>
                  <span className="r-row__sub">{formatDayTime(pass.expected_at)}</span>
                </span>
                <span className={`pill pill--${pass.status}`}>{titleCase(pass.status)}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <Sheet
        onClose={() => setOpen(false)}
        open={open}
        subtitle="An access code and PIN are generated for the gate."
        title="Register a visitor"
      >
        {register.error ? (
          <Notice icon={TriangleAlert} tone="er">
            {register.error}
          </Notice>
        ) : null}

        <div className="r-field">
          <label className="r-field__label">Visitor name</label>
          <div className="r-input">
            <input
              onChange={(event) => setName(event.target.value)}
              placeholder="Full name"
              value={name}
            />
          </div>
        </div>

        <div className="r-field">
          <label className="r-field__label">Expected date and time</label>
          <div className="r-input">
            <input
              onChange={(event) => setWhen(event.target.value)}
              type="datetime-local"
              value={when}
            />
          </div>
        </div>

        <div className="r-field">
          <label className="r-field__label">Vehicle registration (optional)</label>
          <div className="r-input">
            <input
              onChange={(event) => setVehicle(event.target.value.toUpperCase())}
              placeholder="MU 1234 AB"
              value={vehicle}
            />
          </div>
        </div>

        <div className="r-label" style={{ marginBottom: 6 }}>
          Purpose
        </div>
        <div className="r-option-grid r-option-grid--4">
          {(data?.purposes ?? []).map((entry) => (
            <button
              className={`r-option ${purpose === entry.key ? "is-selected" : ""}`}
              key={entry.key}
              onClick={() => setPurpose(entry.key)}
              style={{ minHeight: 42 }}
              type="button"
            >
              {PURPOSE_LABELS[entry.key] ?? titleCase(entry.key)}
            </button>
          ))}
        </div>

        <div className="r-label" style={{ marginBottom: 6 }}>
          Visitor parking
        </div>
        <div className="r-option-grid r-option-grid--4">
          {(data?.parking_options ?? []).map((hours) => (
            <button
              className={`r-option ${parkingHours === hours ? "is-selected" : ""}`}
              key={hours}
              onClick={() => setParkingHours(hours)}
              style={{ minHeight: 42 }}
              type="button"
            >
              {hours === 0 ? "None" : hours >= 24 ? "Full day" : `${hours}h`}
            </button>
          ))}
        </div>

        <button
          className="r-btn r-btn--primary r-btn--block"
          disabled={register.pending || !name.trim() || !when || !online}
          onClick={() => void register.run()}
          type="button"
        >
          {register.pending ? "Registering…" : "Register visitor"}
        </button>
      </Sheet>
    </div>
  );
}

function Credentials({ pass }: { pass: VisitorPass }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div
        style={{
          flex: 1,
          padding: "10px 12px",
          borderRadius: 10,
          background: "var(--cc)",
          border: "1px solid var(--clg)",
        }}
      >
        <div className="r-label" style={{ marginBottom: 3 }}>
          Access code
        </div>
        <div className="r-mono" style={{ fontSize: 17, fontWeight: 700, letterSpacing: "0.06em" }}>
          {pass.access_code}
        </div>
      </div>
      <div
        style={{
          flex: 1,
          padding: "10px 12px",
          borderRadius: 10,
          background: "var(--cc)",
          border: "1px solid var(--clg)",
        }}
      >
        <div className="r-label" style={{ marginBottom: 3, display: "flex", gap: 4, alignItems: "center" }}>
          <Hash size={10} />
          PIN
        </div>
        <div className="r-mono" style={{ fontSize: 17, fontWeight: 700, letterSpacing: "0.14em" }}>
          {pass.access_pin}
        </div>
      </div>
    </div>
  );
}
