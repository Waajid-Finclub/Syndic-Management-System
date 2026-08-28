"use client";

/**
 * One maintenance request, from the office side.
 *
 * The timeline here is the same seven steps the co-owner sees in the app, drawn
 * from the same events. That is deliberate: a manager on the phone should be
 * describing exactly what the person on the other end is looking at.
 *
 * Status only moves forward. A job that recurs is logged as a new request
 * rather than reopened, because the timeline the co-owner already read is a
 * record of what they were told.
 */

import Link from "next/link";
import { use, useState } from "react";
import {
  ArrowLeft,
  Check,
  Circle,
  Loader2,
  MessageSquare,
  Send,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SelectMenu } from "@/components/select-menu";
import { Section } from "@/components/section";
import { StatusPill } from "@/components/status-pill";
import { SyndicShell } from "@/components/syndic/shell";
import { api } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import { canEdit, useSyndicApi } from "@/lib/syndic/hooks";
import { useSyndic } from "@/lib/syndic/session";
import type { MaintenanceDetail, MaintenanceMeta } from "@/lib/syndic/types";

export default function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { permissions } = useSyndic();
  const detail = useSyndicApi<{ request: MaintenanceDetail }>(`/api/syndic/maintenance/${id}`);
  const meta = useSyndicApi<MaintenanceMeta>("/api/syndic/maintenance/meta");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = detail.data?.request;
  const mayEdit = canEdit(permissions, "maintenance");

  // The next step is whatever follows the furthest one already reached. Showing
  // the whole list would invite skipping steps the API then refuses.
  const statuses = meta.data?.statuses ?? [];
  const currentSequence = statuses.find((step) => step.key === request?.status)?.sequence ?? 0;
  const nextStep = statuses.find((step) => step.sequence === currentSequence + 1);

  async function advance(note?: string) {
    if (!nextStep) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/syndic/maintenance/${id}`, {
        method: "PATCH",
        body: { status: nextStep.key, note: note ?? null },
      });
      await detail.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not advance the request");
    } finally {
      setBusy(false);
    }
  }

  async function assign(vendorId: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/syndic/maintenance/${id}`, {
        method: "PATCH",
        body: { vendor_id: vendorId ? Number(vendorId) : null },
      });
      await detail.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign the vendor");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SyndicShell>
      <PageHeader
        title={request ? request.title : "Maintenance request"}
        subtitle={
          request
            ? `${request.reference} · ${request.category_label} · ${
                request.unit_label ?? "Common area"
              }`
            : "Loading..."
        }
        action={
          <Link className="btn btn-secondary" href="/syndic/maintenance">
            <ArrowLeft size={13} />
            Back to queue
          </Link>
        }
      />

      {detail.error ? <div className="notice notice--er">{detail.error}</div> : null}
      {error ? <div className="notice notice--er">{error}</div> : null}

      {request ? (
        <>
          <div className="section">
            <div className="section__body">
              <div className="detail-grid">
                <Field label="Status" value={<StatusPill value={request.status} />} />
                <Field label="Priority" value={<StatusPill value={request.priority} />} />
                <Field label="Reported by" value={request.reported_by_name ?? "-"} />
                <Field label="Raised" value={relativeTime(request.created_at)} />
                <Field label="Location" value={request.location_label ?? "-"} />
                <Field
                  label="Vendor"
                  value={
                    mayEdit && request.is_open ? (
                      <SelectMenu
                        ariaLabel="Assign vendor"
                        onChange={assign}
                        options={(meta.data?.vendors ?? [])
                          .filter((vendor) => vendor.status === "active")
                          .map((vendor) => ({
                            value: String(vendor.id),
                            label: `${vendor.name}${vendor.trade ? ` — ${vendor.trade}` : ""}`,
                          }))}
                        placeholder="Unassigned"
                        size="sm"
                        value={request.vendor_id ? String(request.vendor_id) : ""}
                      />
                    ) : (
                      request.vendor_name ?? "-"
                    )
                  }
                />
              </div>

              {request.description ? (
                <p className="mt-5 text-sm font-medium leading-relaxed text-[var(--ct)]">
                  {request.description}
                </p>
              ) : null}

              {request.photos.length ? (
                <div className="mt-5 flex flex-wrap gap-3">
                  {request.photos.map((photo) => (
                    // Photos are served through the authenticated syndic route,
                    // never from a static directory - one can show the inside of
                    // someone's flat.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt={photo.filename}
                      className="h-28 w-28 rounded-lg border border-[var(--cbr)] object-cover"
                      key={photo.id}
                      src={photo.url}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="split-grid">
            <Section
              action={
                mayEdit && nextStep ? (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    onClick={() => advance()}
                    type="button"
                  >
                    {busy ? <Loader2 className="animate-spin" size={12} /> : <Check size={12} />}
                    {nextStep.label}
                  </button>
                ) : null
              }
              subtitle="The same seven steps the co-owner sees in the app"
              title="Progress"
            >
              <div className="timeline">
                {request.timeline.map((step) => (
                  <div
                    className={`timeline__step ${step.done ? "is-done" : ""}`}
                    key={step.key}
                  >
                    <span className={`timeline__dot ${step.done ? "is-done" : ""}`}>
                      {step.done ? <Check size={10} /> : <Circle size={6} />}
                    </span>
                    <div className="timeline__copy">
                      <span className="timeline__label">{step.label}</span>
                      <span className="timeline__meta">
                        {step.occurred_at ? formatDateTime(step.occurred_at) : "Not yet"}
                        {step.detail ? ` · ${step.detail}` : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {!request.is_open ? (
                <div className="notice notice--info mt-4">
                  <Wrench size={15} />
                  <div>
                    <div className="notice__title">This job is finished</div>
                    <div className="notice__sub">
                      If the fault returns, log a new request rather than reopening this one —
                      the timeline the co-owner read is a record of what they were told.
                    </div>
                  </div>
                </div>
              ) : null}
            </Section>

            <Section subtitle="Office, co-owner and vendor" title="Messages">
              <Thread
                mayReply={mayEdit}
                messages={request.messages}
                onSent={() => detail.reload()}
                requestId={request.id}
              />
            </Section>
          </div>
        </>
      ) : (
        <div className="loading-line" />
      )}
    </SyndicShell>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="detail-field">
      <span className="detail-field__label">{label}</span>
      <span className="detail-field__value">{value}</span>
    </div>
  );
}

function Thread({
  mayReply,
  messages,
  onSent,
  requestId,
}: {
  mayReply: boolean;
  messages: MaintenanceDetail["messages"];
  onSent: () => void;
  requestId: number;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      await api(`/api/syndic/maintenance/${requestId}/messages`, {
        method: "POST",
        body: { body },
      });
      setBody("");
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the message");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {error ? <div className="notice notice--er">{error}</div> : null}

      {messages.length ? (
        <div className="thread">
          {messages.map((message) => (
            <div
              className={`thread__message ${
                message.author_role === "syndic" ? "thread__message--syndic" : ""
              }`}
              key={message.id}
            >
              <div className="thread__author">
                <span>{message.author_label}</span>
                <span>{relativeTime(message.created_at)}</span>
              </div>
              <div className="thread__body">{message.body}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid place-items-center gap-2 py-8 text-center text-[var(--cmt)]">
          <MessageSquare size={24} />
          <p className="text-sm font-semibold">No messages yet</p>
        </div>
      )}

      {mayReply ? (
        <form className="mt-4" onSubmit={send}>
          <label className="label" htmlFor="reply">
            Reply to the co-owner
          </label>
          <textarea
            className="field"
            id="reply"
            onChange={(event) => setBody(event.target.value)}
            placeholder="The plumber is booked for Thursday morning."
            rows={3}
            value={body}
          />
          <button
            className="btn btn-primary btn-sm mt-3"
            disabled={sending || !body.trim()}
            type="submit"
          >
            {sending ? <Loader2 className="animate-spin" size={12} /> : <Send size={12} />}
            Send
          </button>
        </form>
      ) : null}
    </>
  );
}
