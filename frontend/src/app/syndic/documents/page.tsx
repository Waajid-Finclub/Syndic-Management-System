"use client";

/**
 * Document library.
 *
 * Two kinds of folder: shared ones every co-owner in the development can read,
 * and private ones whose documents are scoped to a single unit — a title deed,
 * a settlement letter. The unit selector on upload is what enforces that split,
 * and the resident API filters on it, so a document put in the wrong folder is
 * visible to the wrong people. The form says so at the point of choosing.
 */

import { useState } from "react";
import { FileText, FolderPlus, Loader2, Lock, Trash2, Upload } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { PageHeader } from "@/components/page-header";
import { SelectMenu } from "@/components/select-menu";
import { Section } from "@/components/section";
import { SyndicShell } from "@/components/syndic/shell";
import { ToggleSwitch } from "@/components/toggle-switch";
import { api, downloadFile } from "@/lib/api";
import { formatDate, number } from "@/lib/format";
import { canCreate, canDelete, useSyndicApi } from "@/lib/syndic/hooks";
import { useSyndic } from "@/lib/syndic/session";
import type { DocumentFolderRow } from "@/lib/syndic/types";

type LibraryResponse = {
  folders: DocumentFolderRow[];
  categories: { key: string; label: string; icon: string }[];
  units: { id: number; label: string }[];
  max_bytes: number;
  allowed_types: string[];
};

export default function DocumentsPage() {
  const { permissions } = useSyndic();
  const [uploading, setUploading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const library = useSyndicApi<LibraryResponse>("/api/syndic/documents");
  const mayCreate = canCreate(permissions, "documents");
  const mayDelete = canDelete(permissions, "documents");

  const folders = library.data?.folders ?? [];

  return (
    <SyndicShell>
      <PageHeader
        title="Documents"
        subtitle="House rules, statements, minutes, contracts and per-unit paperwork"
        action={
          mayCreate ? (
            <div className="page__actions">
              <button
                className="btn btn-secondary"
                onClick={() => setCreatingFolder(true)}
                type="button"
              >
                <FolderPlus size={13} />
                New folder
              </button>
              <button
                className="btn btn-primary"
                disabled={!folders.length}
                onClick={() => setUploading(true)}
                type="button"
              >
                <Upload size={13} />
                Upload document
              </button>
            </div>
          ) : null
        }
      />

      {library.error ? <div className="notice notice--er">{library.error}</div> : null}
      {error ? <div className="notice notice--er">{error}</div> : null}

      {!library.loading && !folders.length ? (
        <EmptyState message="No folders yet — create one to start the library" />
      ) : null}

      {folders.map((folder) => (
        <Section
          key={folder.id}
          action={
            mayDelete && !folder.documents.length ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  await api(`/api/syndic/documents/folders/${folder.id}`, { method: "DELETE" });
                  await library.reload();
                }}
                type="button"
              >
                <Trash2 size={12} />
                Delete folder
              </button>
            ) : null
          }
          subtitle={
            folder.is_private
              ? "Private — each document is visible only to its own unit"
              : `Shared with every co-owner · ${number(folder.document_count)} document${
                  folder.document_count === 1 ? "" : "s"
                }`
          }
          title={folder.name}
        >
          {folder.documents.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>File</th>
                    <th>Scope</th>
                    <th>Version</th>
                    <th>Uploaded</th>
                    <th className="right">Size</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {folder.documents.map((document) => (
                    <tr key={document.id}>
                      <td className="bold color-cr">{document.title}</td>
                      <td className="mono">{document.filename}</td>
                      <td>
                        {document.unit_id ? (
                          <span className="chip">
                            <Lock size={10} />
                            Unit {document.unit_label ?? document.unit_id}
                          </span>
                        ) : (
                          "All co-owners"
                        )}
                      </td>
                      <td>{document.version_label ?? "-"}</td>
                      <td>{formatDate(document.uploaded_at)}</td>
                      <td className="right mono">
                        {Math.round(document.size_bytes / 1024)} KB
                      </td>
                      <td className="right">
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => downloadFile(document.url, document.filename)}
                          type="button"
                        >
                          Download
                        </button>
                        {mayDelete ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={async () => {
                              setError(null);
                              try {
                                await api(`/api/syndic/documents/${document.id}`, {
                                  method: "DELETE",
                                });
                                await library.reload();
                              } catch (err) {
                                setError(
                                  err instanceof Error ? err.message : "Could not delete",
                                );
                              }
                            }}
                            type="button"
                          >
                            <Trash2 size={12} />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="This folder is empty" />
          )}
        </Section>
      ))}

      {creatingFolder ? (
        <FolderModal
          categories={library.data?.categories ?? []}
          onClose={() => setCreatingFolder(false)}
          onSaved={async () => {
            setCreatingFolder(false);
            await library.reload();
          }}
        />
      ) : null}

      {uploading ? (
        <UploadModal
          folders={folders}
          maxBytes={library.data?.max_bytes ?? 0}
          onClose={() => setUploading(false)}
          onSaved={async () => {
            setUploading(false);
            await library.reload();
          }}
          units={library.data?.units ?? []}
        />
      ) : null}
    </SyndicShell>
  );
}

function FolderModal({
  categories,
  onClose,
  onSaved,
}: {
  categories: { key: string; label: string }[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [category, setCategory] = useState(categories[0]?.key ?? "rules");
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api("/api/syndic/documents/folders", {
        method: "POST",
        body: { name: form.get("name"), category, is_private: isPrivate },
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the folder");
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
          <button className="btn btn-primary" disabled={saving} form="folder-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <FolderPlus size={13} />}
            Create folder
          </button>
        </>
      }
      icon={<FolderPlus size={17} />}
      onClose={onClose}
      title="New folder"
    >
      <form id="folder-form" onSubmit={submit}>
        {error ? <div className="notice notice--er">{error}</div> : null}

        <div>
          <label className="label" htmlFor="name">
            Folder name
          </label>
          <input className="field" id="name" name="name" placeholder="Meeting Minutes" required />
        </div>

        <div className="mt-4">
          <label className="label">Category</label>
          <SelectMenu
            ariaLabel="Category"
            fullWidth
            onChange={setCategory}
            options={categories.map((entry) => ({ value: entry.key, label: entry.label }))}
            shape="field"
            value={category}
          />
        </div>

        <div className="wa-toggle-row mt-4">
          <ToggleSwitch label="Private folder" on={isPrivate} onChange={setIsPrivate} />
          <span className="text-sm font-semibold">Private — per-unit paperwork</span>
        </div>

        <p className="mt-2 text-xs font-medium text-[var(--cmt)]">
          {isPrivate
            ? "Documents here must name a unit, and only that unit's co-owners will see them."
            : "Every co-owner in the development will be able to read everything in this folder."}
        </p>
      </form>
    </Modal>
  );
}

function UploadModal({
  folders,
  maxBytes,
  onClose,
  onSaved,
  units,
}: {
  folders: DocumentFolderRow[];
  maxBytes: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
  units: { id: number; label: string }[];
}) {
  const [folderId, setFolderId] = useState(folders[0] ? String(folders[0].id) : "");
  const [unitId, setUnitId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const folder = folders.find((entry) => String(entry.id) === folderId);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a file to upload");
      return;
    }
    const form = new FormData(event.currentTarget);
    const payload = new FormData();
    payload.append("file", file);
    payload.append("folder_id", folderId);
    payload.append("title", String(form.get("title") ?? ""));
    payload.append("version_label", String(form.get("version_label") ?? ""));
    if (unitId) payload.append("unit_id", unitId);

    setSaving(true);
    setError(null);
    try {
      await api("/api/syndic/documents", { method: "POST", body: payload });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the document");
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
          <button className="btn btn-primary" disabled={saving} form="upload-form" type="submit">
            {saving ? <Loader2 className="animate-spin" size={13} /> : <Upload size={13} />}
            Upload
          </button>
        </>
      }
      icon={<FileText size={17} />}
      onClose={onClose}
      subtitle={`PDF, image, CSV, Word or Excel · up to ${Math.round(maxBytes / 1024 / 1024)} MB`}
      title="Upload a document"
      wide
    >
      <form id="upload-form" onSubmit={submit}>
        {error ? <div className="notice notice--er">{error}</div> : null}

        <div className="form-grid">
          <div>
            <label className="label">Folder</label>
            <SelectMenu
              ariaLabel="Folder"
              fullWidth
              onChange={(value) => {
                setFolderId(value);
                setUnitId("");
              }}
              options={folders.map((entry) => ({
                value: String(entry.id),
                label: entry.is_private ? `${entry.name} (private)` : entry.name,
              }))}
              shape="field"
              value={folderId}
            />
          </div>
          <div>
            <label className="label">Scope</label>
            <SelectMenu
              ariaLabel="Unit scope"
              fullWidth
              onChange={setUnitId}
              options={units.map((unit) => ({ value: String(unit.id), label: unit.label }))}
              placeholder="All co-owners"
              shape="field"
              value={unitId}
            />
          </div>
          <div>
            <label className="label" htmlFor="title">
              Title
            </label>
            <input className="field" id="title" name="title" placeholder="Defaults to the filename" />
          </div>
          <div>
            <label className="label" htmlFor="version_label">
              Version
            </label>
            <input className="field" id="version_label" name="version_label" placeholder="v2 — Jan 2026" />
          </div>
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="file">
            File
          </label>
          <input
            accept=".pdf,.jpg,.jpeg,.png,.csv,.xlsx,.docx"
            className="field"
            id="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </div>

        {folder?.is_private && !unitId ? (
          <div className="notice notice--warn mt-4">
            <Lock size={15} />
            <div>
              <div className="notice__title">This is a private folder</div>
              <div className="notice__sub">
                Without a unit, this document would be readable by every co-owner in the
                development. Choose the unit it belongs to.
              </div>
            </div>
          </div>
        ) : null}

        {!folder?.is_private && unitId ? (
          <div className="notice notice--info mt-4">
            <Lock size={15} />
            <div>
              <div className="notice__title">Scoped to one unit</div>
              <div className="notice__sub">
                Even though this folder is shared, this document will only be visible to the
                co-owners of the unit you chose.
              </div>
            </div>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
