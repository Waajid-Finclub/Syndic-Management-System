"use client";

/**
 * Notices, facility bookings and visitor passes.
 *
 * Publishing a notice notifies every active co-owner by default, and an urgent
 * one goes out on the emergency template. That default is on rather than off:
 * a notice nobody is told about is a notice nobody reads, and a manager who
 * wants a silent one can turn it off deliberately.
 *
 * The visitor list shows access codes in full — it is the screen the gate reads
 * from, and a pass whose code is hidden cannot be checked.
 */

import { useState } from "react";
import { Loader2, Megaphone, Send } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { PageHeader } from "@/components/page-header";
import { SelectMenu } from "@/components/select-menu";
import { Section } from "@/components/section";
import { StatusPill } from "@/components/status-pill";
import { SyndicShell } from "@/components/syndic/shell";
import { Tabs } from "@/components/tabs";
import { ToggleSwitch } from "@/components/toggle-switch";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, money, relativeTime } from "@/lib/format";
import { canCreate, canDelete, canEdit, useSyndicApi } from "@/lib/syndic/hooks";
import { useSyndic } from "@/lib/syndic/session";
import type { Announcement, BookingRow, FacilityRow, VisitorRow } from "@/lib/syndic/types";

type Tab = "notices" | "bookings" | "visitors";

export default function CommunityPage() {
  const { permissions } = useSyndic();
  const [tab, setTab] = useState<Tab>("notices");
  const [publishing, setPublishing] = useState(false);

  const notices = useSyndicApi<{ announcements: Announcement[]; priorities: string[] }>(
    tab === "notices" ? "/api/syndic/announcements" : null,
  );
  const bookings = useSyndicApi<{
    bookings: BookingRow[];
    facilities: FacilityRow[];
    statuses: string[];
  }>(tab === "bookings" ? "/api/syndic/bookings" : null);
  const visitors = useSyndicApi<{ visitors: VisitorRow[]; statuses: string[] }>(
    tab === "visitors" ? "/api/syndic/visitors" : null,
  );

  return (
    <SyndicShell>
      <PageHeader
        title="Notices & Community"
        subtitle="What co-owners see in the app: announcements, bookings and gate passes"
        action={
          canCreate(permissions, "community") ? (
            <button className="btn btn-primary" onClick={() => setPublishing(true)} type="button">
              <Megaphone size={13} />
              Publish notice
            </button>
          ) : null
        }
      />

      <Tabs
        active={tab}
        items={[
          { key: "notices", label: "Notices" },
          { key: "bookings", label: "Facility bookings" },
          { key: "visitors", label: "Visitor passes" },
        ]}
        onChange={(next) => setTab(next as Tab)}
      />

      {tab === "notices" ? (
        <Section subtitle="Newest first" title="Published notices">
          {notices.error ? <div className="notice notice--er">{notices.error}</div> : null}
          {notices.data?.announcements.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Published</th>
                    <th>Title</th>
                    <th>Priority</th>
                    <th>Author</th>
                    <th>Notified</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {notices.data.announcements.map((row) => (
                    <tr key={row.id}>
                      <td>{relativeTime(row.published_at)}</td>
                      <td className="wrap bold color-cr">
                        {row.title}
                        {row.body ? (
                          <div className="mt-1 text-xs font-medium text-[var(--cmt)]">
                            {row.body.slice(0, 140)}
                            {row.body.length > 140 ? "..." : ""}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <StatusPill value={row.priority} />
                      </td>
                      <td>{row.author_label ?? "-"}</td>
                      <td>{row.whatsapp_sent ? "Yes" : "No"}</td>
                      <td className="right">
                        {canDelete(permissions, "community") ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={async () => {
                              await api(`/api/syndic/announcements/${row.id}`, { method: "DELETE" });
                              await notices.reload();
                            }}
                            type="button"
                          >
                            Remove
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              message={notices.loading ? "Loading notices..." : "Nothing has been published yet"}
            />
          )}
        </Section>
      ) : null}

      {tab === "bookings" ? (
        <Section subtitle="Last 7 days onward" title="Facility bookings">
          {bookings.data?.bookings.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Facility</th>
                    <th>Slot</th>
                    <th>Unit</th>
                    <th>Booked by</th>
                    <th className="right">Fee</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.data.bookings.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDate(row.booking_date)}</td>
                      <td className="bold color-cr">{row.facility_name}</td>
                      <td>{row.slot_label}</td>
                      <td>{row.unit_label ?? "-"}</td>
                      <td className="wrap">{row.booked_by ?? "-"}</td>
                      <td className="right mono">{row.amount ? money(row.amount) : "Free"}</td>
                      <td>
                        {canEdit(permissions, "community") ? (
                          <SelectMenu
                            ariaLabel={`Status for booking ${row.id}`}
                            onChange={async (value) => {
                              await api(`/api/syndic/bookings/${row.id}`, {
                                method: "PATCH",
                                body: { status: value },
                              });
                              await bookings.reload();
                            }}
                            options={(bookings.data?.statuses ?? []).map((status) => ({
                              value: status,
                              label: status,
                            }))}
                            size="sm"
                            value={row.status}
                          />
                        ) : (
                          <StatusPill value={row.status} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              message={bookings.loading ? "Loading bookings..." : "No bookings in this period"}
            />
          )}
        </Section>
      ) : null}

      {tab === "visitors" ? (
        <Section
          subtitle="What the gate checks — code and PIN are shown in full"
          title="Visitor passes"
        >
          {visitors.data?.visitors.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Expected</th>
                    <th>Visitor</th>
                    <th>Host unit</th>
                    <th>Vehicle</th>
                    <th>Parking</th>
                    <th>Code</th>
                    <th>PIN</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visitors.data.visitors.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.expected_at)}</td>
                      <td className="bold color-cr">{row.visitor_name}</td>
                      <td>{row.unit_label ?? "-"}</td>
                      <td className="mono">{row.vehicle_registration ?? "-"}</td>
                      <td>{row.parking_label}</td>
                      <td>
                        <span className="code-badge">{row.access_code}</span>
                      </td>
                      <td className="mono bold">{row.access_pin}</td>
                      <td>
                        {canEdit(permissions, "community") ? (
                          <SelectMenu
                            ariaLabel={`Status for pass ${row.access_code}`}
                            onChange={async (value) => {
                              await api(`/api/syndic/visitors/${row.id}`, {
                                method: "PATCH",
                                body: { status: value },
                              });
                              await visitors.reload();
                            }}
                            options={(visitors.data?.statuses ?? []).map((status) => ({
                              value: status,
                              label: status,
                            }))}
                            size="sm"
                            value={row.status}
                          />
                        ) : (
                          <StatusPill value={row.status} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              message={visitors.loading ? "Loading passes..." : "No visitor passes expected"}
            />
          )}
        </Section>
      ) : null}

      {publishing ? (
        <NoticeModal
          onClose={() => setPublishing(false)}
          onSaved={async () => {
            setPublishing(false);
            setTab("notices");
            await notices.reload();
          }}
        />
      ) : null}
    </SyndicShell>
  );
}

function NoticeModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [priority, setPriority] = useState("info");
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api("/api/syndic/announcements", {
        method: "POST",
        body: {
          title: form.get("title"),
          body: form.get("body"),
          priority,
          notify,
        },
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish the notice");
      setSaving(false);
    }
  }

  return (
    <Modal
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving} form="notice-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <Send size={13} />}
            Publish
          </button>
        </>
      }
      icon={<Megaphone size={17} />}
      onClose={onClose}
      subtitle="Appears in every co-owner's app immediately"
      title="Publish a notice"
      wide
    >
      <form id="notice-form" onSubmit={submit}>
        {error ? <div className="notice notice--er">{error}</div> : null}

        <div>
          <label className="label" htmlFor="title">
            Title
          </label>
          <input
            className="field"
            id="title"
            name="title"
            placeholder="Water supply interruption, Thursday 9am-2pm"
            required
          />
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="body">
            Body
          </label>
          <textarea className="field" id="body" name="body" rows={5} />
        </div>

        <div className="form-grid mt-4">
          <div>
            <label className="label">Priority</label>
            <SelectMenu
              ariaLabel="Priority"
              fullWidth
              onChange={setPriority}
              options={[
                { value: "info", label: "Information" },
                { value: "urgent", label: "Urgent" },
              ]}
              shape="field"
              value={priority}
            />
          </div>
        </div>

        <div className="wa-toggle-row mt-4">
          <ToggleSwitch label="Notify co-owners" on={notify} onChange={setNotify} />
          <span className="text-sm font-semibold">
            Notify every co-owner
            {priority === "urgent" ? " on the emergency template" : ""}
          </span>
        </div>

        {!notify ? (
          <p className="mt-2 text-xs font-medium text-[var(--cmt)]">
            The notice will appear in the app but nobody will be told it is there.
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
