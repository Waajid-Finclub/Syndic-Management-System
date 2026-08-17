"use client";

/**
 * AGM voting.
 *
 * Two things are stated on every resolution and never left implicit: the share
 * weight the vote carries, and the majority the resolution needs. A co-owner
 * casting 152 of 10,000 shares against a resolution requiring an absolute
 * majority should be able to see both facts without leaving the screen.
 *
 * A cast vote is shown as final because it is — the API has no update route.
 */

import { useState } from "react";
import { Check, CircleCheck, Clock, Minus, TriangleAlert, Vote, X } from "lucide-react";
import {
  Card,
  Empty,
  Notice,
  ScreenHeader,
  ScreenSkeleton,
  StaleDataNotice,
  formatDayTime,
} from "@/components/resident/ui";
import { api } from "@/lib/api";
import { useAction, useCountdown, useOnline, useResidentApi } from "@/lib/resident/hooks";
import type { Meeting, Resolution } from "@/lib/resident/types";

type MeetingPayload = {
  meeting: Meeting;
  can_vote: boolean;
  my_share_weight: number | null;
  total_shares: number;
};

const CHOICES = [
  { key: "for", label: "For", icon: Check, tone: "var(--ok)" },
  { key: "against", label: "Against", icon: X, tone: "var(--er)" },
  { key: "abstain", label: "Abstain", icon: Minus, tone: "var(--cmt)" },
] as const;

export default function VotingScreen() {
  const meetings = useResidentApi<{ upcoming: Meeting[] }>("/api/resident/governance/meetings");
  const meetingId = meetings.data?.upcoming[0]?.id ?? null;

  const detail = useResidentApi<MeetingPayload>(
    meetingId ? `/api/resident/governance/meetings/${meetingId}` : null,
  );

  if (meetings.loading || (meetingId && detail.loading && !detail.data)) {
    return (
      <div className="r-screen r-screen--plain">
        <ScreenHeader back="/app/coop" title="Voting" />
        <ScreenSkeleton rows={3} />
      </div>
    );
  }

  if (!meetingId || !detail.data) {
    return (
      <div className="r-screen r-screen--plain">
        <ScreenHeader back="/app/coop" title="Voting" />
        <Empty icon={Vote} title="No meeting scheduled">
          When your syndic calls a general meeting, its resolutions appear here for voting.
        </Empty>
      </div>
    );
  }

  return <MeetingVoting payload={detail.data} onVoted={detail.reload} stale={meetings.stale || detail.stale} />;
}

function MeetingVoting({
  payload,
  onVoted,
  stale,
}: {
  payload: MeetingPayload;
  onVoted: () => Promise<void>;
  stale: boolean;
}) {
  const online = useOnline();
  const { meeting, can_vote: canVote, my_share_weight: weight, total_shares: totalShares } = payload;
  const countdown = useCountdown(meeting.voting_closes_at);
  const [failed, setFailed] = useState<number | null>(null);

  const cast = useAction(async (resolutionId: number, choice: string) => {
    setFailed(null);
    try {
      await api(`/api/resident/governance/resolutions/${resolutionId}/vote`, {
        method: "POST",
        body: { choice },
      });
    } catch (error) {
      setFailed(resolutionId);
      throw error;
    }
    await onVoted();
  });

  const participation = meeting.participation;

  return (
    <div className="r-screen r-screen--plain">
      <ScreenHeader back="/app/coop" subtitle={meeting.title} title="Voting" />

      {stale ? <StaleDataNotice /> : null}

      <div className="r-muted" style={{ marginBottom: 10 }}>
        {formatDayTime(meeting.scheduled_for)}
        {weight !== null
          ? ` · your weight ${weight.toLocaleString("en-GB")} / ${totalShares.toLocaleString("en-GB")} shares`
          : null}
      </div>

      {meeting.is_voting_open && countdown && !countdown.expired ? (
        <Notice icon={Clock} tone="warn">
          Voting closes in {countdown.label}
        </Notice>
      ) : (
        <Notice icon={Clock} tone="plain">
          Voting on this meeting is closed.
        </Notice>
      )}

      {cast.error ? (
        <Notice icon={TriangleAlert} tone="er">
          {cast.error}
        </Notice>
      ) : null}

      {(meeting.resolutions ?? []).map((resolution) => (
        <ResolutionCard
          canVote={canVote && meeting.is_voting_open && online}
          key={resolution.id}
          onVote={(choice) => void cast.run(resolution.id, choice)}
          pending={cast.pending}
          resolution={resolution}
          showError={failed === resolution.id}
          weight={weight}
        />
      ))}

      {participation ? (
        <Card>
          <div className="r-label" style={{ marginBottom: 8 }}>
            Participation
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
            <span className="r-muted">
              {participation.represented_shares.toLocaleString("en-GB")} /{" "}
              {participation.total_shares.toLocaleString("en-GB")} shares represented
            </span>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{participation.percent}%</span>
          </div>
          <div className="r-progress">
            <div className="r-progress__fill" style={{ width: `${Math.min(participation.percent, 100)}%` }} />
          </div>
          {meeting.quorum_note ? (
            <div className="r-muted" style={{ fontSize: 10.5, marginTop: 7 }}>
              {meeting.quorum_note}
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

function ResolutionCard({
  resolution,
  canVote,
  pending,
  weight,
  onVote,
  showError,
}: {
  resolution: Resolution;
  canVote: boolean;
  pending: boolean;
  weight: number | null;
  onVote: (choice: string) => void;
  showError: boolean;
}) {
  const voted = Boolean(resolution.my_vote);

  return (
    <Card accent={voted}>
      <div style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 8 }}>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            width: 30,
            height: 30,
            borderRadius: 9,
            background: "var(--tint)",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          R{resolution.sequence}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.4 }}>{resolution.title}</div>
          <div className="r-muted" style={{ fontSize: 10.5, marginTop: 2 }}>
            {majorityLabel(resolution.majority_type)}
            {resolution.article_ref ? ` · ${resolution.article_ref}` : ""}
          </div>
        </div>
        {voted ? <span className="pill pill--voted">Voted</span> : null}
      </div>

      <p className="r-muted" style={{ lineHeight: 1.6, marginBottom: 12 }}>
        {resolution.description}
      </p>

      {voted ? (
        <div className="r-notice r-notice--ok" style={{ marginBottom: 0 }}>
          <CircleCheck size={14} />
          <div style={{ display: "flex", width: "100%", justifyContent: "space-between", gap: 8 }}>
            <span>
              Your vote: <strong>{labelFor(resolution.my_vote)}</strong>
            </span>
            <span className="r-mono">
              {(resolution.my_vote_weight ?? 0).toLocaleString("en-GB")} shares
            </span>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 7 }}>
            {CHOICES.map((choice) => {
              const Icon = choice.icon;
              return (
                <button
                  className="r-btn"
                  disabled={!canVote || pending}
                  key={choice.key}
                  onClick={() => onVote(choice.key)}
                  style={{ flex: 1, color: choice.tone, borderColor: `color-mix(in srgb, ${choice.tone} 32%, transparent)` }}
                  type="button"
                >
                  <Icon size={15} />
                  {choice.label}
                </button>
              );
            })}
          </div>
          {weight !== null ? (
            <div className="r-muted" style={{ fontSize: 10.5, marginTop: 8, textAlign: "center" }}>
              Your vote carries {weight.toLocaleString("en-GB")} shares and cannot be changed once
              cast.
            </div>
          ) : null}
          {showError ? (
            <div className="r-field__error" style={{ textAlign: "center" }}>
              That vote was not recorded. Check your connection and try again.
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

function majorityLabel(type: string) {
  if (type === "absolute") return "Absolute majority";
  if (type === "unanimous") return "Unanimous";
  return "Simple majority";
}

function labelFor(choice: string | null) {
  if (choice === "for") return "For";
  if (choice === "against") return "Against";
  if (choice === "abstain") return "Abstain";
  return "—";
}
