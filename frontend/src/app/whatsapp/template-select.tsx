"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, MessageSquare } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import { money } from "@/lib/format";
import type { WhatsAppCenterTemplate } from "@/lib/types";

type Rect = { left: number; top: number; bottom: number; width: number };

// Position the portaled menu below the trigger, flipping above when the
// viewport lacks room. Called only while open, so `window` is always defined.
function menuStyle(rect: Rect): CSSProperties {
  const spaceBelow = window.innerHeight - rect.bottom - 12;
  const flipUp = spaceBelow < 240 && rect.top > spaceBelow;
  return {
    left: rect.left,
    width: rect.width,
    maxHeight: Math.max(180, (flipUp ? rect.top : spaceBelow) - 12),
    ...(flipUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
  };
}

/**
 * Template picker for the WhatsApp Centre.
 *
 * Follows the same mechanics as SelectMenu — portaled to document.body so the
 * menu is never clipped, closing on outside-click, Escape, scroll or resize.
 * Rows carry the template name and its per-message cost; the body itself is
 * read in the preview panel, not here. Templates Meta has not approved are
 * listed but not selectable, so their status pill stays to explain why.
 */
export function TemplateSelect({
  onChange,
  templates,
  value,
}: {
  onChange: (template: WhatsAppCenterTemplate) => void;
  templates: WhatsAppCenterTemplate[];
  value: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const selected = templates.find((template) => template.id === value) ?? null;
  const readyCount = templates.filter((template) => template.can_send).length;

  function openMenu() {
    const el = triggerRef.current;
    if (!el) return;
    const bounds = el.getBoundingClientRect();
    setRect({ left: bounds.left, top: bounds.top, bottom: bounds.bottom, width: bounds.width });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onReflow(event: Event) {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const target =
      menuRef.current?.querySelector<HTMLButtonElement>("[data-selected='true']") ??
      menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
    target?.focus();
  }, [open]);

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "ArrowDown" ? Math.min(index + 1, buttons.length - 1) : Math.max(index - 1, 0);
    buttons[next]?.focus();
  }

  function choose(template: WhatsAppCenterTemplate) {
    onChange(template);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="wa-select">
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Message template"
        className={`wa-select__trigger ${open ? "is-open" : ""}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        ref={triggerRef}
        type="button"
      >
        <span className="wa-select__icon">
          <MessageSquare size={15} />
        </span>
        <span className="wa-select__copy">
          <span className="wa-select__name">{selected ? selected.name : "Choose a template"}</span>
          {selected ? null : (
            <span className="wa-select__sub">
              {readyCount} approved template{readyCount === 1 ? "" : "s"} ready to trigger
            </span>
          )}
        </span>
        {selected ? (
          <span className="wa-select__cost">{money(selected.cost_per_message)} / msg</span>
        ) : null}
        <ChevronDown className={`wa-select__chevron ${open ? "is-open" : ""}`} size={15} />
      </button>

      {open && rect
        ? createPortal(
            <div
              className="wa-menu select-pop"
              onKeyDown={onMenuKeyDown}
              ref={menuRef}
              role="listbox"
              style={menuStyle(rect)}
            >
              {templates.map((template) => {
                const isSelected = template.id === value;
                return (
                  <button
                    aria-selected={isSelected}
                    className={`wa-option ${isSelected ? "is-selected" : ""}`}
                    data-selected={isSelected}
                    disabled={!template.can_send}
                    key={template.id}
                    onClick={() => choose(template)}
                    role="option"
                    title={template.can_send ? template.name : "Awaiting Meta approval"}
                    type="button"
                  >
                    <span className="wa-option__name">{template.name}</span>
                    {template.can_send ? null : <StatusPill value={template.status} />}
                    <span className="wa-option__cost">{money(template.cost_per_message)} / msg</span>
                    <Check className={`wa-option__check ${isSelected ? "is-on" : ""}`} size={14} />
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
