"use client";

/**
 * Meetings, resolutions and share-weighted voting.
 *
 * The number that matters on every screen here is shares, not heads. A tally
 * bar is drawn against the development's share total and the threshold line is
 * shown against the basis that resolution actually uses — votes cast for a
 * simple majority, all shares in the development for an absolute one. Managers
 * get this wrong on paper constantly, and a wrong denominator is how an AGM
 * result gets challenged.
 */

import Link from "next/link";
import { useState } from "react";
import { CalendarPlus, Loader2, Plus, Vote } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { PageHeader } from "@/components/page-header";
import { SelectMenu } from "@/components/select-menu";
import { Section } from "@/components/section";
import { StatusPill } from "@/components/status-pill";
import { SyndicShell } from "@/components/syndic/shell";
import { api } from "@/lib/api";
import { formatDate, number, percent } from "@/lib/format";
import { canCreate, useSyndicApi } from "@/lib/syndic/hooks";
import { useSyndic } from "@/lib/syndic/session";
import type { GovernanceMeta, Meeting } from "@/lib/syndic/types";

export default function GovernancePage() {
  const { permissions } = useSyndic();
  const [creating, setCreating] = useState(false);

  const meta = useSyndicApi<GovernanceMeta>("/api/syndic/governance/meta");
  const meetings = useSyndicApi<{ meetings: Meeting[]; total_shares: number }>(
    "/api/syndic/governance/meetings",
  );

  const rows = meetings.data?.meetings ?? [];
  const totalShares = meetings.data?.total_shares ?? 0;

  return (
    <SyndicShell>
      <PageHeader
        title="Meetings & Voting"
        subtitle={`Share-weighted governance — ${number(totalShares)} shares across this development`}
        action={
          canCreate(permissions, "governance") ? (
            <button className="btn btn-primary" onClick={() => setCreating(true)} type="button">
              <CalendarPlus size={13} />
              Call a meeting
            </button>
          ) : null
        }
      />

      {meetings.error ? <div className="notice notice--er">{meetings.error}</div> : null}

      {totalShares === 0 ? (
        <div className="notice notice--warn">
          <Vote size={15} />
          <div>
            <div className="notice__title">No shares are allocated</div>
            <div className="notice__sub">
              A vote here is weighted by the shares attached to each unit. Until the Property
              Registry allocates them, every ballot would count for nothing.
            </div>
          </div>
        </div>
      ) : null}

      <Section subtitle="Newest first" title="Meetings">
        {rows.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Scheduled</th>
                  <th>Location</th>
                  <th className="right">Resolutions</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((meeting) => (
                  <tr key={meeting.id}>
                    <td className="mono">
                      <Link className="font-semibold" href={`/syndic/governance/${meeting.id}`}>
                        {meeting.reference}
                      </Link>
                    </td>
                    <td className="wrap bold color-cr">{meeting.title}</td>
                    <td>{meeting.type_label}</td>
                    <td>{formatDate(meeting.scheduled_for)}</td>
                    <td className="wrap">{meeting.location ?? "-"}</td>
                    <td className="right">{number(meeting.resolution_count)}</td>
                    <td>
                      <StatusPill value={meeting.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            message={meetings.loading ? "Loading meetings..." : "No meeting has been called yet"}
          />
        )}
      </Section>

      {creating ? (
        <MeetingModal
          meta={meta.data}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await meetings.reload();
          }}
        />
      ) : null}
    </SyndicShell>
  );
}

function MeetingModal({
  meta,
  onClose,
  onSaved,
}: {
  meta: GovernanceMeta | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [meetingType, setMeetingType] = useState("agm");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api("/api/syndic/governance/meetings", {
        method: "POST",
        body: {
          title: form.get("title"),
          reference: form.get("reference") || null,
          meeting_type: meetingType,
          scheduled_for: form.get("scheduled_for"),
          location: form.get("location"),
          quorum_note: form.get("quorum_note"),
        },
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the meeting");
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
          <button className="btn btn-primary" disabled={saving} form="meeting-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <Plus size={13} />}
            Create meeting
          </button>
        </>
      }
      icon={<CalendarPlus size={17} />}
      onClose={onClose}
      subtitle="Add resolutions next, then open the ballot"
      title="Call a meeting"
      wide
    >
      <form id="meeting-form" onSubmit={submit}>
        {error ? <div className="notice notice--er">{error}</div> : null}

        <div className="form-grid">
          <div>
            <label className="label" htmlFor="title">
              Title
            </label>
            <input
              className="field"
              id="title"
              name="title"
              placeholder="Annual General Meeting 2026"
              required
            />
          </div>
          <div>
            <label className="label">Type</label>
            <SelectMenu
              ariaLabel="Meeting type"
              fullWidth
              onChange={setMeetingType}
              options={(meta?.meeting_types ?? []).map((entry) => ({
                value: entry.key,
                label: entry.label,
              }))}
              shape="field"
              value={meetingType}
            />
          </div>
          <div>
            <label className="label" htmlFor="scheduled_for">
              Date and time
            </label>
            <input
              className="field"
              id="scheduled_for"
              name="scheduled_for"
              placeholder="2026-06-15T18:00"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="location">
              Location
            </label>
            <input className="field" id="location" name="location" placeholder="Community Hall" />
          </div>
          <div>
            <label className="label" htmlFor="reference">
              Reference
            </label>
            <input className="field" id="reference" name="reference" placeholder="AGM-2026" />
          </div>
          <div>
            <label className="label" htmlFor="quorum_note">
              Quorum note
            </label>
            <input
              className="field"
              id="quorum_note"
              name="quorum_note"
              placeholder="Quorum: 50% of shares represented"
            />
          </div>
        </div>

        {meta ? (
          <p className="mt-4 text-xs font-medium text-[var(--cmt)]">
            Votes will be weighted against {number(meta.total_shares)} shares —{" "}
            {percent(100)} of the development.
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
