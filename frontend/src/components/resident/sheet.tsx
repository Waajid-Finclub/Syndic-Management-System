"use client";

/**
 * Bottom sheet.
 *
 * Modal dialogs on a phone belong at the bottom, within thumb reach, not
 * centred where the content is furthest from the hand. Rendered inline rather
 * than through a portal because the resident shell is already the top-level
 * stacking context, and closes on Escape and on backdrop tap — the two
 * dismissals people try first.
 */

import { useEffect, useRef } from "react";

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    // Stop the page behind the sheet scrolling with it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    panel.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="r-sheet-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        aria-label={title}
        aria-modal="true"
        className="r-sheet"
        ref={panel}
        role="dialog"
        tabIndex={-1}
      >
        <div className="r-sheet__grip" />
        <div className="r-sheet__title">{title}</div>
        {subtitle ? <div className="r-sheet__sub">{subtitle}</div> : null}
        {children}
      </div>
    </div>
  );
}
