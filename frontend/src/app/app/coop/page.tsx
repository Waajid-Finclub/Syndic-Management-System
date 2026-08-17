"use client";

/**
 * Co-ownership hub — the parts of living here that are not money or repairs.
 *
 * The meeting card leads because a vote has a deadline and everything else on
 * this screen does not. Facilities, notices and the document library follow in
 * the order they are actually used.
 */

import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Dumbbell,
  FileText,
  Landmark,
  MapPin,
  Megaphone,
  MessageSquare,
  SquareParking,
  UserCheck,
  Vote,
  Waves,
} from "lucide-react";
import {
  Card,
  Empty,
  ScreenHeader,
  ScreenSkeleton,
  StaleDataNotice,
  SectionTitle,
  TapCard,
  formatDayTime,
  relativeTime,
} from "@/components/resident/ui";
import { useCountdown, useResidentApi } from "@/lib/resident/hooks";
import { useResident } from "@/lib/resident/session";
import type { Announcement, Facility, Meeting } from "@/lib/resident/types";

export default function CoopScreen() {
  const router = useRouter();
  const { user } = useResident();

  const meetings = useResidentApi<{ upcoming: Meeting[]; can_vote: boolean }>(
    "/api/resident/governance/meetings",
  );
  const facilities = useResidentApi<{ facilities: Facility[] }>("/api/resident/facilities");
  const notices = useResidentApi<{ announcements: Announcement[] }>(
    "/api/resident/announcements",
  );

  const meeting = meetings.data?.upcoming[0] ?? null;
  const countdown = useCountdown(meeting?.voting_closes_at);

  return (
    <div className="r-screen">
      <ScreenHeader subtitle={user?.development_name} title="My co-ownership" />

      {meetings.loading && !meetings.data ? <ScreenSkeleton rows={3} /> : null}
      {meetings.stale || facilities.stale || notices.stale ? <StaleDataNotice /> : null}

      {meeting ? (
        <Card accent>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
            <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
              <span className="r-row__mark tint-vio">
                <Vote size={16} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{meeting.title}</div>
                <div className="r-muted" style={{ marginTop: 2 }}>
                  {formatDayTime(meeting.scheduled_for)}
                </div>
              </div>
            </div>
            {meeting.is_voting_open ? (
              <span className="pill pill--issued">Voting open</span>
            ) : (
              <span className="pill pill--pending">Scheduled</span>
            )}
          </div>

          <div
            className="r-muted"
            style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}
          >
            {meeting.location ? (
              <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                <MapPin size={12} />
                {meeting.location}
              </span>
            ) : null}
            <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
              <FileText size={12} />
              {meeting.resolution_count} resolution{meeting.resolution_count === 1 ? "" : "s"}
            </span>
            {meeting.whatsapp_sent ? (
              <span
                className="text-ok"
                style={{ display: "inline-flex", gap: 5, alignItems: "center" }}
              >
                <MessageSquare size={12} />
                Notice sent
              </span>
            ) : null}
          </div>

          {meeting.is_voting_open && countdown && !countdown.expired ? (
            <div className="r-notice r-notice--warn" style={{ marginTop: 11, marginBottom: 0 }}>
              <CalendarDays size={14} />
              Voting closes in {countdown.label}
            </div>
          ) : null}

          {meetings.data?.can_vote ? (
            <button
              className="r-btn r-btn--primary r-btn--block"
              onClick={() => router.push("/app/coop/voting")}
              style={{ marginTop: 12 }}
              type="button"
            >
              {meeting.is_voting_open ? "Vote now" : "View resolutions"}
              <ArrowRight size={15} />
            </button>
          ) : (
            <p className="r-muted" style={{ marginTop: 11, lineHeight: 1.55 }}>
              Voting is reserved to co-owners. You can still read the resolutions and the
              minutes in the document library.
            </p>
          )}
        </Card>
      ) : null}

      <SectionTitle>Facilities</SectionTitle>
      <div className="r-kpi-grid">
        {(facilities.data?.facilities ?? []).map((facility) => {
          const Icon = iconFor(facility.facility_type);
          return (
            <button
              className="r-kpi"
              key={facility.id}
              onClick={() => router.push("/app/coop/facilities")}
              type="button"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span className="r-kpi__mark tint-neutral">
                  <Icon size={15} />
                </span>
                {facility.is_open === null ? null : (
                  <span className={facility.is_open ? "pill pill--active" : "pill pill--off"}>
                    {facility.is_open ? "Open" : "Closed"}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 9 }}>{facility.name}</div>
              <div className="r-muted" style={{ fontSize: 10.5, marginTop: 1 }}>
                {facility.hours_label}
              </div>
              {facility.availability_note ? (
                <div className="text-accent" style={{ fontSize: 10.5, fontWeight: 600, marginTop: 3 }}>
                  {facility.availability_note}
                </div>
              ) : null}
            </button>
          );
        })}

        <button
          className="r-kpi"
          onClick={() => router.push("/app/coop/visitors")}
          type="button"
        >
          <span className="r-kpi__mark tint-blu">
            <SquareParking size={15} />
          </span>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 9 }}>Visitor parking</div>
          <div className="r-muted" style={{ fontSize: 10.5, marginTop: 1 }}>
            24/7 with a pass
          </div>
          <div className="text-accent" style={{ fontSize: 10.5, fontWeight: 600, marginTop: 3 }}>
            Pre-register a guest
          </div>
        </button>
      </div>

      <SectionTitle>Notices</SectionTitle>
      {notices.data && notices.data.announcements.length === 0 ? (
        <Empty icon={Megaphone} title="No notices">
          Announcements from your syndic office will appear here.
        </Empty>
      ) : null}

      {(notices.data?.announcements ?? []).slice(0, 6).map((announcement) => (
        <Card key={announcement.id}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
            <span
              className={announcement.priority === "urgent" ? "pill pill--overdue" : "pill pill--pending"}
            >
              {announcement.priority === "urgent" ? "Urgent" : "Notice"}
            </span>
            <span className="r-muted" style={{ fontSize: 10.5 }}>
              {relativeTime(announcement.published_at)} ago
            </span>
            {announcement.whatsapp_sent ? (
              <span className="text-ok" style={{ display: "inline-flex", gap: 4, fontSize: 10.5 }}>
                <MessageSquare size={11} />
                Sent
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{announcement.title}</div>
          <p className="r-muted" style={{ lineHeight: 1.55 }}>
            {announcement.body}
          </p>
        </Card>
      ))}

      <SectionTitle>More</SectionTitle>
      <TapCard onClick={() => router.push("/app/coop/documents")}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span className="r-row__mark tint-neutral">
            <Landmark size={16} />
          </span>
          <div style={{ flex: 1 }}>
            <div className="r-row__title">Document library</div>
            <div className="r-row__sub">Rules, accounts, minutes, contracts and your paperwork</div>
          </div>
          <ArrowRight className="text-mt" size={16} />
        </div>
      </TapCard>

      <TapCard onClick={() => router.push("/app/coop/visitors")}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span className="r-row__mark tint-neutral">
            <UserCheck size={16} />
          </span>
          <div style={{ flex: 1 }}>
            <div className="r-row__title">Visitors</div>
            <div className="r-row__sub">Pre-register a guest and reserve a visitor bay</div>
          </div>
          <ArrowRight className="text-mt" size={16} />
        </div>
      </TapCard>
    </div>
  );
}

function iconFor(type: Facility["facility_type"]) {
  switch (type) {
    case "pool":
      return Waves;
    case "gym":
      return Dumbbell;
    case "hall":
      return Landmark;
    default:
      return Building2;
  }
}
