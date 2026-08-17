"use client";

/**
 * Notification feed.
 *
 * Tapping a notification goes where it points and marks it read; "Mark all
 * read" is offered because a feed nobody can clear stops being read at all.
 * The unread count in the shell is updated from the same response, so the tab
 * badge never disagrees with the list.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { ResolvedIcon, toneForCategory } from "@/components/resident/icons";
import {
  Chips,
  Empty,
  ScreenHeader,
  ScreenSkeleton,
  StaleDataNotice,
  relativeTime,
} from "@/components/resident/ui";
import { api } from "@/lib/api";
import { useAction, useOnline, useResidentApi } from "@/lib/resident/hooks";
import { useResidentSession } from "@/lib/resident/session";
import type { ResidentNotification } from "@/lib/resident/types";

type FeedPayload = {
  notifications: ResidentNotification[];
  categories: { key: string; label: string }[];
  counts: Record<string, number>;
  unread: number;
};

export default function NotificationsScreen() {
  const router = useRouter();
  const online = useOnline();
  const { setUnreadCount } = useResidentSession();
  const [category, setCategory] = useState("all");

  const { data, loading, reload, stale } = useResidentApi<FeedPayload>(
    `/api/resident/account/notifications${category === "all" ? "" : `?category=${category}`}`,
  );

  const markRead = useAction(async (ids?: number[]) => {
    const payload = await api<{ unread: number }>("/api/resident/account/notifications/read", {
      method: "POST",
      body: ids ? { ids } : {},
    });
    setUnreadCount(payload.unread);
    await reload();
  });

  const chips = [
    { key: "all", label: "All", count: data?.unread },
    ...(data?.categories ?? []).map((entry) => ({
      key: entry.key,
      label: entry.label,
      count: data?.counts[entry.key],
    })),
  ];

  return (
    <div className="r-screen r-screen--plain">
      <ScreenHeader
        action={
          data && data.unread > 0 ? (
            <button
              className="r-btn r-btn--sm r-btn--ghost"
              disabled={markRead.pending || !online}
              onClick={() => void markRead.run()}
              type="button"
            >
              <CheckCheck size={14} />
              Mark all read
            </button>
          ) : undefined
        }
        back="/app/home"
        title="Notifications"
      />

      {stale ? <StaleDataNotice /> : null}

      <Chips onChange={setCategory} options={chips} value={category} />

      {loading && !data ? <ScreenSkeleton rows={5} /> : null}

      {data && data.notifications.length === 0 ? (
        <Empty icon={Bell} title="Nothing here">
          {category === "all"
            ? "Invoices, maintenance updates and notices will appear here."
            : "No notifications in this category."}
        </Empty>
      ) : null}

      {data && data.notifications.length > 0 ? (
        <div className="r-list">
          {data.notifications.map((entry) => (
            <button
              className={`r-row ${entry.is_read ? "r-row--read" : "r-row--unread"}`}
              key={entry.id}
              onClick={() => {
                if (!entry.is_read) void markRead.run([entry.id]);
                if (entry.link_path) router.push(entry.link_path);
              }}
              type="button"
            >
              <span className={`r-row__mark ${toneForCategory(entry.category)}`}>
                <ResolvedIcon name={entry.icon_key} size={15} />
              </span>
              <span className="r-row__body">
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="r-row__title">{entry.title}</span>
                  {entry.is_read ? null : <span className="r-row__unread" />}
                </span>
                <span className="r-row__sub">{entry.body}</span>
              </span>
              <span className="r-row__time">{relativeTime(entry.created_at)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
