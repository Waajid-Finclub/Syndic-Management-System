"use client";

/**
 * One meeting: its resolutions, the live tally, and who has not voted.
 *
 * Every resolution shows three things together — the tally in shares, the
 * threshold it must clear, and the basis that threshold is measured against.
 * Showing a percentage without its denominator is how a committee announces a
 * result that later turns out not to hold.
 *
 * The non-voter list exists because the useful action before closing a ballot
 * is chasing the units that have not voted, and a manager should not have to
 * derive that list by subtraction.
 */

import Link from "next/link";
import { use, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  Lock,
  Plus,
  Trash2,
  Unlock,
  Vote,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { PageHeader } from "@/components/page-header";
import { SelectMenu } from "@/components/select-menu";
import { Section } from "@/components/section";
import { MetricTile } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { SyndicShell } from "@/components/syndic/shell";
import { api, downloadFile } from "@/lib/api";
import { formatDate, number, percent } from "@/lib/format";
import { canCreate, canDelete, canEdit, canExport, useSyndicApi } from "@/lib/syndic/hooks";
import { useSyndic } from "@/lib/syndic/session";
import type { GovernanceMeta, Meeting, ResolutionRow } from "@/lib/syndic/types";

type DetailResponse = {
  meeting: Meeting;
  total_shares: number;
  resolutions: ResolutionRow[];
  non_voters: {
    unit_id: number;
    unit_label: string;
    share_value: number;
    owners: string[];
  }[];
};

export default function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { permissions } = useSyndic();
  const detail = useSyndicApi<DetailResponse>(`/api/syndic/governance/meetings/${id}`);
  const meta = useSyndicApi<GovernanceMeta>("/api/syndic/governance/meta");

  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<string | null>(null);

  const meeting = detail.data?.meeting;
  const resolutions = detail.data?.resolutions ?? [];
  const totalShares = detail.data?.total_shares ?? 0;
  const mayEdit = canEdit(permissions, "governance");

  async function act(path: string, label: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ results?: { outcome: string }[] }>(
        `/api/syndic/governance/meetings/${id}/${path}`,
        { method: "POST" },
      );
      if (response.results) {
        const passed = response.results.filter((row) => row.outcome === "passed").length;
        setResults(`${passed} of ${response.results.length} resolutions passed.`);
      }
      await detail.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not ${label}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SyndicShell>
      <PageHeader
        title={meeting?.title ?? "Meeting"}
        subtitle={
          meeting
            ? `${meeting.reference} · ${meeting.type_label} · ${formatDate(meeting.scheduled_for)}`
            : "Loading..."
        }
        action={
          <div className="page__actions">
            <Link className="btn btn-secondary" href="/syndic/governance">
              <ArrowLeft size={13} />
              Back
            </Link>
            {canExport(permissions, "governance") && meeting ? (
              <button
                className="btn btn-secondary"
                onClick={() =>
                  downloadFile(
                    `/api/syndic/governance/meetings/${id}/export`,
                    `${meeting.reference}-results.csv`,
                  )
                }
                type="button"
              >
                <Download size={13} />
                Result sheet
              </button>
            ) : null}
            {mayEdit && meeting?.status === "scheduled" ? (
              <button
                className="btn btn-primary"
                disabled={busy || !resolutions.length}
                onClick={() => act("open-voting", "open the ballot")}
                type="button"
              >
                {busy ? <Loader2 className="animate-spin" size={13} /> : <Unlock size={13} />}
                Open voting
              </button>
            ) : null}
            {mayEdit && meeting?.status === "voting_open" ? (
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => act("close-voting", "close the ballot")}
                type="button"
              >
                {busy ? <Loader2 className="animate-spin" size={13} /> : <Lock size={13} />}
                Close voting
              </button>
            ) : null}
          </div>
        }
      />

      {detail.error ? <div className="notice notice--er">{detail.error}</div> : null}
      {error ? <div className="notice notice--er">{error}</div> : null}
      {results ? (
        <div className="notice notice--ok">
          <CheckCircle2 size={15} />
          <div>
            <div className="notice__title">Ballot closed</div>
            <div className="notice__sub">
              {results} Every co-owner has been notified that the results are published.
            </div>
          </div>
        </div>
      ) : null}

      {meeting ? (
        <div className="metric-strip">
          <MetricTile center label="Status" value={meeting.status.replaceAll("_", " ")} />
          <MetricTile center label="Resolutions" value={number(resolutions.length)} />
          <MetricTile center label="Total shares" value={number(totalShares)} />
          <MetricTile
            center
            label="Turnout"
            sub="Shares represented"
            value={percent(meeting.participation?.percent ?? 0)}
          />
          <MetricTile
            center
            label="Location"
            value={meeting.location ?? "—"}
          />
        </div>
      ) : null}

      <Section
        action={
          canCreate(permissions, "governance") && meeting?.status === "scheduled" ? (
            <button className="btn btn-secondary btn-sm" onClick={() => setAdding(true)} type="button">
              <Plus size={12} />
              Add resolution
            </button>
          ) : null
        }
        subtitle="Weighted by shares, with the majority each one requires"
        title="Resolutions"
      >
        {resolutions.length ? (
          <div className="grid gap-4">
            {resolutions.map((resolution) => (
              <ResolutionCard
                key={resolution.id}
                mayDelete={canDelete(permissions, "governance") && meeting?.status === "scheduled"}
                onChanged={() => detail.reload()}
                resolution={resolution}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            message={
              detail.loading
                ? "Loading resolutions..."
                : "No resolutions yet — a ballot needs at least one"
            }
          />
        )}
      </Section>

      {meeting?.status === "voting_open" && detail.data?.non_voters.length ? (
        <Section
          subtitle="Chase these before closing the ballot"
          title={`${number(detail.data.non_voters.length)} units have not voted`}
        >
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th className="right">Shares</th>
                  <th>Co-owner</th>
                </tr>
              </thead>
              <tbody>
                {detail.data.non_voters.map((row) => (
                  <tr key={row.unit_id}>
                    <td className="bold color-cr">{row.unit_label}</td>
                    <td className="right mono">{number(row.share_value)}</td>
                    <td className="wrap">{row.owners.join(", ") || "Unallocated"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {adding ? (
        <ResolutionModal
          majorityTypes={meta.data?.majority_types ?? []}
          meetingId={id}
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await detail.reload();
          }}
        />
      ) : null}
    </SyndicShell>
  );
}

function ResolutionCard({
  mayDelete,
  onChanged,
  resolution,
}: {
  mayDelete: boolean;
  onChanged: () => void;
  resolution: ResolutionRow;
}) {
  const cast = resolution.shares_cast || 1;
  const widths = {
    for: (resolution.tally.for / cast) * 100,
    against: (resolution.tally.against / cast) * 100,
    abstain: (resolution.tally.abstain / cast) * 100,
  };

  return (
    <div className="section">
      <div className="section__header">
        <div>
          <h2 className="section__title">
            {resolution.sequence}. {resolution.title}
          </h2>
          <p className="section__sub">
            {resolution.article_ref} · needs more than {percent(resolution.threshold_percent, 0)} of{" "}
            {resolution.threshold_basis}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {resolution.outcome ? (
            <StatusPill value={resolution.outcome} />
          ) : (
            <StatusPill value={resolution.would_pass ? "passed" : "pending"} />
          )}
          {mayDelete ? (
            <button
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                await api(`/api/syndic/governance/resolutions/${resolution.id}`, {
                  method: "DELETE",
                });
                onChanged();
              }}
              type="button"
            >
              <Trash2 size={12} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="section__body">
        {resolution.description ? (
          <p className="mb-4 text-sm font-medium leading-relaxed text-[var(--ct)]">
            {resolution.description}
          </p>
        ) : null}

        <div className="tally">
          <div className="tally__for" style={{ width: `${widths.for}%` }} />
          <div className="tally__against" style={{ width: `${widths.against}%` }} />
          <div className="tally__abstain" style={{ width: `${widths.abstain}%` }} />
        </div>

        <div className="tally-legend">
          <span className="tally-legend__item">
            <span className="tally-legend__swatch" style={{ background: "var(--ok)" }} />
            For {number(resolution.tally.for)} shares
          </span>
          <span className="tally-legend__item">
            <span className="tally-legend__swatch" style={{ background: "var(--er)" }} />
            Against {number(resolution.tally.against)}
          </span>
          <span className="tally-legend__item">
            <span className="tally-legend__swatch" style={{ background: "var(--cmtl)" }} />
            Abstain {number(resolution.tally.abstain)}
          </span>
          <span className="tally-legend__item">
            <Vote size={11} />
            {number(resolution.shares_cast)} of {number(resolution.total_shares)} shares cast (
            {percent(resolution.turnout_percent)})
          </span>
        </div>

        <p className="mt-3 text-xs font-semibold text-[var(--cmt)]">
          Currently {percent(resolution.in_favour_percent)} in favour of{" "}
          {resolution.threshold_basis}
          {resolution.outcome
            ? ` — recorded as ${resolution.outcome}.`
            : resolution.would_pass
              ? " — would pass if the ballot closed now."
              : " — would not pass if the ballot closed now."}
        </p>
      </div>
    </div>
  );
}

function ResolutionModal({
  majorityTypes,
  meetingId,
  onClose,
  onSaved,
}: {
  majorityTypes: { key: string; label: string; article: string }[];
  meetingId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [majorityType, setMajorityType] = useState("simple");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = majorityTypes.find((entry) => entry.key === majorityType);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api(`/api/syndic/governance/meetings/${meetingId}/resolutions`, {
        method: "POST",
        body: {
          title: form.get("title"),
          description: form.get("description"),
          majority_type: majorityType,
        },
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the resolution");
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
          <button className="btn btn-primary" disabled={saving} form="resolution-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <Plus size={13} />}
            Add resolution
          </button>
        </>
      }
      icon={<Vote size={17} />}
      onClose={onClose}
      subtitle="Wording is locked once the first vote is cast"
      title="Add a resolution"
      wide
    >
      <form id="resolution-form" onSubmit={submit}>
        {error ? <div className="notice notice--er">{error}</div> : null}

        <div>
          <label className="label" htmlFor="title">
            Resolution
          </label>
          <input
            className="field"
            id="title"
            name="title"
            placeholder="Approve the 2026 service charge budget"
            required
          />
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="description">
            Detail
          </label>
          <textarea className="field" id="description" name="description" rows={4} />
        </div>

        <div className="mt-4">
          <label className="label">Majority required</label>
          <SelectMenu
            ariaLabel="Majority type"
            fullWidth
            onChange={setMajorityType}
            options={majorityTypes.map((entry) => ({
              value: entry.key,
              label: `${entry.label} (${entry.article})`,
            }))}
            shape="field"
            value={majorityType}
          />
        </div>

        <div className="notice notice--info mt-4">
          <Vote size={15} />
          <div>
            <div className="notice__title">{selected?.article} — {selected?.label}</div>
            <div className="notice__sub">
              {majorityType === "simple"
                ? "More than half of the shares actually cast. Abstentions reduce the base."
                : majorityType === "absolute"
                  ? "More than half of every share in the development, whether it voted or not."
                  : "Every share cast must be in favour, with no votes against and no abstentions."}
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
