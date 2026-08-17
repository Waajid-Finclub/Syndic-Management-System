"use client";

/**
 * Request detail — the progress timeline, the vendor, and the conversation.
 *
 * The timeline is the point of this screen. A status word tells a resident
 * where their request is; the timeline tells them how it got there and what
 * happens next, which is the difference between "assigned" and knowing someone
 * is coming tomorrow morning.
 */

import { useParams } from "next/navigation";
import { useState } from "react";
import {
  CircleCheck,
  MessageSquare,
  Phone,
  Send,
  Star,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { ResolvedIcon, toneForPriority } from "@/components/resident/icons";
import {
  Card,
  DefRow,
  Empty,
  Notice,
  ScreenHeader,
  ScreenSkeleton,
  StaleDataNotice,
  formatDayTime,
  titleCase,
} from "@/components/resident/ui";
import { api } from "@/lib/api";
import { useAction, useOnline, useResidentApi } from "@/lib/resident/hooks";
import type { MaintenanceMeta, MaintenanceRequest } from "@/lib/resident/types";

export default function RequestDetailScreen() {
  const params = useParams<{ id: string }>();
  const online = useOnline();
  const [draft, setDraft] = useState("");
  const [rating, setRating] = useState(0);

  const { data, loading, error, reload, stale } = useResidentApi<{ request: MaintenanceRequest }>(
    `/api/resident/maintenance/${params.id}`,
  );
  const meta = useResidentApi<MaintenanceMeta>("/api/resident/maintenance/meta");
  const request = data?.request;

  const iconKey = meta.data?.categories.find((entry) => entry.key === request?.category)?.icon;

  const sendMessage = useAction(async () => {
    await api(`/api/resident/maintenance/${params.id}/messages`, {
      method: "POST",
      body: { body: draft.trim() },
    });
    setDraft("");
    await reload();
  });

  const rate = useAction(async (value: number) => {
    await api(`/api/resident/maintenance/${params.id}/rating`, {
      method: "POST",
      body: { rating: value },
    });
    await reload();
  });

  return (
    <div className="r-screen r-screen--plain">
      <ScreenHeader
        action={
          request ? (
            <span className={`pill pill--${request.priority}`}>{titleCase(request.priority)}</span>
          ) : undefined
        }
        back="/app/report"
        title="Request"
      />

      {loading && !request ? <ScreenSkeleton rows={4} /> : null}
      {stale ? <StaleDataNotice /> : null}

      {error && !request ? (
        <Empty icon={TriangleAlert} title="Request not available">
          {error}
        </Empty>
      ) : null}

      {request ? (
        <>
          <Card accent>
            <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
              <span className={`r-row__mark ${toneForPriority(request.priority)}`}>
                <ResolvedIcon name={iconKey} size={16} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.4 }}>
                  {request.title}
                </div>
                <div className="r-mono r-muted" style={{ fontSize: 10, marginTop: 2 }}>
                  {request.reference} · {request.category_label}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="r-label" style={{ marginBottom: 12 }}>
              Progress
            </div>
            {(request.timeline ?? []).map((step, index, all) => (
              <div className="r-timeline" key={step.key}>
                <div className="r-timeline__gutter">
                  <span className={`r-timeline__dot ${step.done ? "is-done" : ""}`}>
                    {step.done ? <CircleCheck size={12} /> : index + 1}
                  </span>
                  {index < all.length - 1 ? (
                    <span className={`r-timeline__rail ${all[index + 1].done ? "is-done" : ""}`} />
                  ) : null}
                </div>
                <div className="r-timeline__body">
                  <div className={`r-timeline__step ${step.done ? "is-done" : ""}`}>
                    {step.label}
                  </div>
                  {step.occurred_at ? (
                    <div className="r-timeline__when">{formatDayTime(step.occurred_at)}</div>
                  ) : null}
                </div>
              </div>
            ))}

            {request.scheduled_for ? (
              <Notice icon={Wrench} tone="info">
                Scheduled for {formatDayTime(request.scheduled_for)}
              </Notice>
            ) : null}
          </Card>

          <Card>
            <div className="r-label" style={{ marginBottom: 8 }}>
              Details
            </div>
            <DefRow label="Location">{request.location_label}</DefRow>
            <DefRow label="Reported">{formatDayTime(request.created_at)}</DefRow>
            <DefRow label="Description">{request.description}</DefRow>
          </Card>

          {request.photos && request.photos.length > 0 ? (
            <Card>
              <div className="r-label" style={{ marginBottom: 8 }}>
                Photos
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7 }}>
                {request.photos.map((photo) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={photo.filename}
                    key={photo.id}
                    src={photo.url}
                    style={{
                      width: "100%",
                      aspectRatio: "1",
                      objectFit: "cover",
                      borderRadius: 10,
                      border: "1px solid var(--clg)",
                    }}
                  />
                ))}
              </div>
            </Card>
          ) : null}

          {request.vendor ? (
            <Card>
              <div className="r-label" style={{ marginBottom: 10 }}>
                Assigned vendor
              </div>
              <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
                <span className="r-row__mark tint-blu" style={{ width: 40, height: 40 }}>
                  <Wrench size={17} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{request.vendor.name}</div>
                  <div className="r-muted">
                    {request.vendor.contact_name} · {request.vendor.trade}
                  </div>
                  {request.vendor.rating ? (
                    <div className="text-ok" style={{ fontSize: 11, fontWeight: 600, marginTop: 2 }}>
                      ★ {request.vendor.rating.toFixed(1)} · {request.vendor.completed_jobs} jobs
                      completed
                    </div>
                  ) : null}
                </div>
              </div>

              {request.vendor.contact_phone ? (
                <a
                  className="r-btn r-btn--block r-btn--sm"
                  href={`tel:${request.vendor.contact_phone.replace(/\s/g, "")}`}
                  style={{ marginTop: 12 }}
                >
                  <Phone size={14} />
                  Call {request.vendor.contact_phone}
                </a>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <div className="r-label" style={{ marginBottom: 10 }}>
              Messages
            </div>

            {(request.messages ?? []).length === 0 ? (
              <p className="r-muted" style={{ marginBottom: 10 }}>
                No messages yet. Anything you write here reaches the syndic office and the
                assigned vendor.
              </p>
            ) : (
              <div style={{ marginBottom: 12 }}>
                {(request.messages ?? []).map((message) => (
                  <div
                    key={message.id}
                    style={{
                      padding: "10px 12px",
                      marginBottom: 7,
                      borderRadius: 12,
                      background:
                        message.author_role === "resident" ? "var(--tint)" : "var(--cc)",
                      border: "1px solid var(--clg)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        marginBottom: 3,
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{message.author_label}</span>
                      <span className="r-muted" style={{ fontSize: 10 }}>
                        {formatDayTime(message.created_at)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.55 }}>{message.body}</div>
                  </div>
                ))}
              </div>
            )}

            {sendMessage.error ? (
              <Notice icon={TriangleAlert} tone="er">
                {sendMessage.error}
              </Notice>
            ) : null}

            <div style={{ display: "flex", gap: 7 }}>
              <div className="r-input" style={{ flex: 1 }}>
                <input
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Write a message…"
                  value={draft}
                />
              </div>
              <button
                aria-label="Send message"
                className="r-btn r-btn--primary"
                disabled={sendMessage.pending || draft.trim().length === 0 || !online}
                onClick={() => void sendMessage.run()}
                style={{ paddingInline: 16 }}
                type="button"
              >
                <Send size={15} />
              </button>
            </div>
          </Card>

          {request.status === "resolved" || request.status === "closed" ? (
            <Card>
              <div className="r-label" style={{ marginBottom: 8 }}>
                {request.rating ? "Your rating" : "Rate this repair"}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {[1, 2, 3, 4, 5].map((value) => {
                  const filled = (request.rating ?? rating) >= value;
                  return (
                    <button
                      aria-label={`${value} star${value === 1 ? "" : "s"}`}
                      className="r-iconbtn"
                      disabled={Boolean(request.rating) || rate.pending || !online}
                      key={value}
                      onClick={() => {
                        setRating(value);
                        void rate.run(value);
                      }}
                      style={{
                        color: filled ? "var(--wn)" : "var(--cmtl)",
                        borderColor: filled ? "var(--wn)" : "var(--cbr)",
                      }}
                      type="button"
                    >
                      <Star fill={filled ? "currentColor" : "none"} size={16} />
                    </button>
                  );
                })}
              </div>
            </Card>
          ) : null}

          <div
            className="r-muted"
            style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center", marginTop: 4 }}
          >
            <MessageSquare size={13} className="text-ok" />
            Updates are also sent by WhatsApp
          </div>
        </>
      ) : null}
    </div>
  );
}
