"use client";

/**
 * Report an issue — four steps.
 *
 * Split into steps because the fields are answered from different places: the
 * category and location are chosen at a glance, the description is typed, and
 * the photos are taken. Asking for all of it on one screen means scrolling past
 * a keyboard to find the submit button.
 *
 * Photos post as multipart alongside the request rather than in a second call,
 * so a request never exists without the evidence that was meant to accompany it.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Camera, CircleCheck, MapPin, TriangleAlert, WifiOff, X } from "lucide-react";
import { ResolvedIcon } from "@/components/resident/icons";
import { Card, Notice, ScreenHeader, ScreenSkeleton, StaleDataNotice } from "@/components/resident/ui";
import { api } from "@/lib/api";
import { useAction, useOnline, useResidentApi } from "@/lib/resident/hooks";
import type { MaintenanceMeta, MaintenanceRequest } from "@/lib/resident/types";

const STEPS = ["Category", "Location", "Details", "Photos"];
const MAX_PHOTOS = 5;

type PhotoAttachment = {
  file: File;
  previewUrl: string;
};

export default function NewRequestScreen() {
  const router = useRouter();
  const online = useOnline();
  const { data: meta, loading, stale } = useResidentApi<MaintenanceMeta>("/api/resident/maintenance/meta");

  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [photos, setPhotos] = useState<PhotoAttachment[]>([]);
  const photosRef = useRef<PhotoAttachment[]>([]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  // Object URLs are a leak if they outlive the files they point at.
  useEffect(() => {
    return () => {
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    };
  }, []);

  function addPhotos(files: File[]) {
    if (files.length === 0) return;
    setPhotos((current) => {
      const slots = MAX_PHOTOS - current.length;
      if (slots <= 0) return current;
      const next = files.slice(0, slots).map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      return [...current, ...next];
    });
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      const photo = current[index];
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return current.filter((_, i) => i !== index);
    });
  }

  const submit = useAction(async () => {
    const form = new FormData();
    form.set("category", category ?? "");
    form.set("location_label", location ?? "");
    form.set("title", title.trim());
    form.set("description", description.trim());
    form.set("priority", priority);
    photos.forEach((photo) => form.append("photos", photo.file));

    const payload = await api<{ request: MaintenanceRequest }>("/api/resident/maintenance", {
      method: "POST",
      body: form,
    });
    router.replace(`/app/report/${payload.request.id}`);
  });

  if (loading && !meta) {
    return (
      <div className="r-screen r-screen--plain">
        <ScreenHeader back="/app/report" title="Report an issue" />
        <ScreenSkeleton rows={3} />
      </div>
    );
  }

  const canContinue =
    (step === 0 && Boolean(category)) ||
    (step === 1 && Boolean(location)) ||
    (step === 2 && title.trim().length > 2 && description.trim().length > 5) ||
    step === 3;

  return (
    <div className="r-screen r-screen--plain">
      <ScreenHeader back="/app/report" title="Report an issue" />

      {stale ? <StaleDataNotice /> : null}

      <div className="r-stepper">
        {STEPS.map((label, index) => (
          <div
            className={`r-stepper__step ${index === step ? "is-active" : ""} ${index < step ? "is-done" : ""}`}
            key={label}
          >
            <span className="r-stepper__dot">
              {index < step ? <CircleCheck size={13} /> : index + 1}
            </span>
            <span className="r-stepper__label">{label}</span>
            {index < STEPS.length - 1 ? <span className="r-stepper__line" /> : null}
          </div>
        ))}
      </div>

      {step === 0 ? (
        <>
          <div className="r-label" style={{ marginBottom: 8 }}>
            What kind of issue is it?
          </div>
          <div className="r-option-grid r-option-grid--3">
            {(meta?.categories ?? []).map((entry) => (
              <button
                className={`r-option ${category === entry.key ? "is-selected" : ""}`}
                key={entry.key}
                onClick={() => setCategory(entry.key)}
                type="button"
              >
                <ResolvedIcon name={entry.icon} size={18} />
                {entry.label}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <div className="r-label" style={{ marginBottom: 8 }}>
            Where is it?
          </div>
          <div className="r-option-grid">
            {(meta?.locations ?? []).map((entry) => (
              <button
                className={`r-option r-option--wide ${location === entry ? "is-selected" : ""}`}
                key={entry}
                onClick={() => setLocation(entry)}
                type="button"
              >
                <MapPin size={15} />
                {entry}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {step === 2 ? (
        <Card accent>
          <div className="r-field">
            <label className="r-field__label">Title</label>
            <div className="r-input">
              <input
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Brief description of the issue"
                value={title}
              />
            </div>
          </div>

          <div className="r-field">
            <label className="r-field__label">What have you observed?</label>
            <div className="r-input">
              <textarea
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe the problem, the exact location, and how long it has been happening."
                value={description}
              />
            </div>
          </div>

          <div className="r-label" style={{ marginBottom: 7 }}>
            How urgent is it?
          </div>
          <div className="r-option-grid r-option-grid--4">
            {(meta?.priorities ?? []).map((entry) => (
              <button
                className={`r-option ${priority === entry.key ? "is-selected" : ""}`}
                key={entry.key}
                onClick={() => setPriority(entry.key)}
                style={{ minHeight: 44 }}
                type="button"
              >
                {entry.label}
              </button>
            ))}
          </div>
          {priority === "emergency" ? (
            <Notice icon={TriangleAlert} tone="warn">
              For a fire, a gas leak or anything threatening safety, call emergency services
              first. This app does not reach them.
            </Notice>
          ) : null}
        </Card>
      ) : null}

      {step === 3 ? (
        <>
          <div className="r-label" style={{ marginBottom: 8 }}>
            Photos (optional, up to {MAX_PHOTOS})
          </div>

          {photos.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 7,
                marginBottom: 12,
              }}
            >
              {photos.map((photo, index) => (
                <div key={photo.previewUrl} style={{ position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={`Attachment ${index + 1}`}
                    src={photo.previewUrl}
                    style={{
                      width: "100%",
                      aspectRatio: "1",
                      objectFit: "cover",
                      borderRadius: 10,
                      border: "1px solid var(--clg)",
                    }}
                  />
                  <button
                    aria-label="Remove photo"
                    className="r-iconbtn"
                    onClick={() => removePhoto(index)}
                    style={{ position: "absolute", top: 4, right: 4, width: 26, height: 26, borderRadius: 8 }}
                    type="button"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {photos.length < MAX_PHOTOS ? (
            <label
              className="r-empty"
              style={{ display: "block", cursor: "pointer", marginBottom: 12 }}
            >
              <span className="r-empty__mark">
                <Camera size={19} />
              </span>
              <span className="r-empty__title" style={{ display: "block" }}>
                Add a photo
              </span>
              <span className="r-empty__sub" style={{ display: "block" }}>
                Take one now or choose from your gallery
              </span>
              <input
                accept="image/*"
                hidden
                multiple
                onChange={(event) => {
                  const chosen = Array.from(event.target.files ?? []);
                  addPhotos(chosen);
                  event.target.value = "";
                }}
                type="file"
              />
            </label>
          ) : null}

          <Card>
            <div className="r-label" style={{ marginBottom: 8 }}>
              Summary
            </div>
            <div className="r-def">
              <span className="r-def__key">Category</span>
              <span className="r-def__value">
                {meta?.categories.find((entry) => entry.key === category)?.label}
              </span>
            </div>
            <div className="r-def">
              <span className="r-def__key">Location</span>
              <span className="r-def__value">{location}</span>
            </div>
            <div className="r-def">
              <span className="r-def__key">Priority</span>
              <span className="r-def__value">
                {meta?.priorities.find((entry) => entry.key === priority)?.label}
              </span>
            </div>
            <div className="r-def">
              <span className="r-def__key">Title</span>
              <span className="r-def__value">{title}</span>
            </div>
          </Card>

          {submit.error ? (
            <Notice icon={TriangleAlert} tone="er">
              {submit.error}
            </Notice>
          ) : null}

          {online ? null : (
            <Notice icon={WifiOff} tone="warn">
              You are offline. Reconnect to submit this request — nothing is lost, the form
              stays as you left it.
            </Notice>
          )}
        </>
      ) : null}

      <div className="r-actionbar">
        <div style={{ display: "flex", gap: 8 }}>
          {step > 0 ? (
            <button
              className="r-btn"
              onClick={() => setStep((current) => current - 1)}
              style={{ flex: 1 }}
              type="button"
            >
              Back
            </button>
          ) : null}

          {step < STEPS.length - 1 ? (
            <button
              className="r-btn r-btn--primary"
              disabled={!canContinue}
              onClick={() => setStep((current) => current + 1)}
              style={{ flex: 2 }}
              type="button"
            >
              Continue
            </button>
          ) : (
            <button
              className="r-btn r-btn--accent"
              disabled={submit.pending || !online}
              onClick={() => void submit.run()}
              style={{ flex: 2 }}
              type="button"
            >
              {submit.pending ? "Submitting…" : "Submit request"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
