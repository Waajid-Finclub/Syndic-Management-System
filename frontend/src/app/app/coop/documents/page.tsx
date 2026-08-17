"use client";

/**
 * Document library.
 *
 * Folders are grouped as the syndic files them, with one exception: the
 * private folder holding this unit's own paperwork is marked so it is obvious
 * those documents are not shared with the building. Tenants never receive it.
 *
 * Files open through the authenticated API rather than a direct link — a title
 * deed served from a static path would be readable by anyone with the URL.
 */

import { useState } from "react";
import { FileText, Lock, Search, TriangleAlert } from "lucide-react";
import { ResolvedIcon } from "@/components/resident/icons";
import {
  Card,
  Empty,
  Notice,
  ScreenHeader,
  ScreenSkeleton,
  StaleDataNotice,
  formatDay,
} from "@/components/resident/ui";
import { downloadFile } from "@/lib/api";
import { useAction, useOnline, useResidentApi } from "@/lib/resident/hooks";
import type { DocumentEntry, DocumentFolder } from "@/lib/resident/types";

const FOLDER_ICONS: Record<string, string> = {
  rules: "clipboard-list",
  financial: "chart-column",
  minutes: "folder",
  contracts: "file-text",
  funds: "landmark",
  contacts: "phone",
  private: "file-lock",
};

export default function DocumentsScreen() {
  const online = useOnline();
  const [query, setQuery] = useState("");

  const { data, loading, error, stale } = useResidentApi<{ folders: DocumentFolder[] }>(
    `/api/resident/documents${query ? `?q=${encodeURIComponent(query)}` : ""}`,
  );

  const open = useAction(async (document: DocumentEntry) => {
    await downloadFile(document.url, document.filename);
  });

  const folders = data?.folders ?? [];
  const total = folders.reduce((sum, folder) => sum + folder.document_count, 0);

  return (
    <div className="r-screen r-screen--plain">
      <ScreenHeader
        back="/app/coop"
        subtitle={data ? `${total} document${total === 1 ? "" : "s"}` : null}
        title="Documents"
      />

      <div className="r-field">
        <div className="r-input">
          <span className="r-input__icon">
            <Search size={15} />
          </span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search documents…"
            value={query}
          />
        </div>
      </div>

      {loading && !data ? <ScreenSkeleton rows={3} /> : null}
      {stale ? <StaleDataNotice /> : null}

      {error && !data ? (
        <Empty icon={TriangleAlert} title="Could not load documents">
          {error}
        </Empty>
      ) : null}

      {open.error ? (
        <Notice icon={TriangleAlert} tone="er">
          {open.error}
        </Notice>
      ) : null}

      {data && folders.length === 0 ? (
        <Empty icon={FileText} title="Nothing found">
          {query ? `No document matches “${query}”.` : "No documents have been published yet."}
        </Empty>
      ) : null}

      {folders.map((folder) => (
        <Card key={folder.id}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
            <span className={`r-row__mark ${folder.is_private ? "tint-wn" : "tint-neutral"}`}>
              <ResolvedIcon name={FOLDER_ICONS[folder.category] ?? "folder"} size={15} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{folder.name}</div>
              {folder.is_private ? (
                <div
                  className="text-wn"
                  style={{ fontSize: 10.5, marginTop: 1, display: "flex", gap: 4, alignItems: "center" }}
                >
                  <Lock size={10} />
                  Visible to you only
                </div>
              ) : null}
            </div>
            <span className="pill pill--pending">{folder.document_count}</span>
          </div>

          {folder.documents.map((document) => (
            <button
              className="r-def"
              disabled={open.pending || !online}
              key={document.id}
              onClick={() => void open.run(document)}
              style={{
                width: "100%",
                border: "none",
                borderBottom: "1px solid var(--clg)",
                background: "none",
                font: "inherit",
                textAlign: "left",
                cursor: "pointer",
                alignItems: "center",
              }}
              type="button"
            >
              <FileText className="text-mt" size={14} style={{ flexShrink: 0 }} />
              <span className="r-def__value" style={{ marginLeft: 8 }}>
                {document.title}
                <span className="r-muted" style={{ display: "block", fontSize: 10.5 }}>
                  {formatDay(document.uploaded_at)} · {formatSize(document.size_bytes)}
                </span>
              </span>
              <span className="text-accent" style={{ fontSize: 11.5, fontWeight: 600, flexShrink: 0 }}>
                Open
              </span>
            </button>
          ))}
        </Card>
      ))}
    </div>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
