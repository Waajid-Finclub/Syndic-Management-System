"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = { value: string; label: string };

type Rect = { left: number; top: number; bottom: number; width: number };

// Position the portaled menu below the trigger, flipping above when the
// viewport lacks room. Called only while open, so `window` is always defined.
function menuStyle(rect: Rect): CSSProperties {
  const spaceBelow = window.innerHeight - rect.bottom - 12;
  const flipUp = spaceBelow < 200 && rect.top > spaceBelow;
  return {
    left: rect.left,
    minWidth: rect.width,
    ...(flipUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
  };
}

// A fully custom (no native <select>) dropdown. The menu is portaled to
// document.body with fixed positioning so it is never clipped by a modal or
// scroll container, and closes on outside-click, Escape, scroll, or resize.
export function SelectMenu({
  ariaLabel,
  disabled = false,
  fullWidth = false,
  icon,
  onChange,
  options,
  placeholder,
  shape = "pill",
  size = "md",
  value,
}: {
  ariaLabel: string;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  shape?: "pill" | "field";
  size?: "sm" | "md";
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const items: SelectOption[] = placeholder ? [{ value: "", label: placeholder }, ...options] : options;
  const selected = items.find((option) => option.value === value);
  const triggerLabel = selected ? selected.label : placeholder ?? "Select";

  function openMenu() {
    const el = triggerRef.current;
    if (disabled || !el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.top, bottom: r.bottom, width: r.width });
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
      if (target instanceof Node && (triggerRef.current?.contains(target) || menuRef.current?.contains(target))) return;
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
      menuRef.current?.querySelector<HTMLButtonElement>("button");
    target?.focus();
  }, [open]);

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? Math.min(index + 1, buttons.length - 1) : Math.max(index - 1, 0);
    buttons[next]?.focus();
  }

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  const height = size === "sm" ? "h-9" : "h-10";
  const text = size === "sm" ? "text-xs" : "text-sm";
  const pad = size === "sm" ? "px-2.5" : "px-3.5";
  const radius = shape === "field" ? "rounded-lg" : "rounded-full";

  return (
    <div className={fullWidth ? "w-full" : "inline-flex"}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={`flex ${fullWidth ? "w-full" : ""} ${height} ${text} ${pad} ${radius} items-center gap-2 border bg-[var(--cwh)] font-medium shadow-[0_1px_2px_rgba(15,32,60,0.04)] transition-colors ${
          disabled
            ? "cursor-not-allowed border-[var(--clg)] text-[var(--cmtl)] opacity-70"
            : `${selected ? "text-[var(--ct)]" : "text-[var(--cmt)]"} border-[var(--cbr)] hover:border-[var(--cg)]`
        }`}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        ref={triggerRef}
        type="button"
      >
        {icon}
        <span className="min-w-0 flex-1 truncate text-left">{triggerLabel}</span>
        <ChevronDown className={`shrink-0 text-[var(--cmtl)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} size={14} />
      </button>
      {open && rect
        ? createPortal(
          <div
            className="select-pop fixed z-[10000] max-h-64 overflow-y-auto rounded-xl border border-[var(--cbr)] bg-[var(--cwh)] p-1.5 shadow-[0_18px_40px_rgba(15,32,60,0.16)]"
            onKeyDown={onMenuKeyDown}
            ref={menuRef}
            role="listbox"
            style={menuStyle(rect)}
          >
            {items.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  aria-selected={isSelected}
                  className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                    isSelected ? "bg-[var(--cc)] font-semibold text-[var(--cr)]" : "font-medium text-[var(--ct)] hover:bg-[var(--cc)]"
                  }`}
                  data-selected={isSelected}
                  key={option.value || "__blank"}
                  onClick={() => choose(option.value)}
                  role="option"
                  type="button"
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected ? <Check className="shrink-0" size={14} /> : null}
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

export function MultiSelectMenu({
  ariaLabel,
  disabled = false,
  fullWidth = false,
  icon,
  onChange,
  options,
  placeholder = "Select options",
  shape = "pill",
  size = "md",
  values,
}: {
  ariaLabel: string;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  onChange: (values: string[]) => void;
  options: SelectOption[];
  placeholder?: string;
  shape?: "pill" | "field";
  size?: "sm" | "md";
  values: string[];
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedValues = new Set(values);
  const selectedOptions = options.filter((option) => selectedValues.has(option.value));
  const triggerLabel = selectedOptions.length === 0
    ? placeholder
    : selectedOptions.length === 1
      ? selectedOptions[0].label
      : `${selectedOptions.length} tenants excluded`;

  function openMenu() {
    const el = triggerRef.current;
    if (disabled || !el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.top, bottom: r.bottom, width: r.width });
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
      if (target instanceof Node && (triggerRef.current?.contains(target) || menuRef.current?.contains(target))) return;
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
      menuRef.current?.querySelector<HTMLButtonElement>("[role='option']");
    target?.focus();
  }, [open]);

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='option']") ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? Math.min(index + 1, buttons.length - 1) : Math.max(index - 1, 0);
    buttons[next]?.focus();
  }

  function toggle(next: string) {
    onChange(selectedValues.has(next) ? values.filter((value) => value !== next) : [...values, next]);
  }

  const height = size === "sm" ? "h-9" : "h-10";
  const text = size === "sm" ? "text-xs" : "text-sm";
  const pad = size === "sm" ? "px-2.5" : "px-3.5";
  const radius = shape === "field" ? "rounded-lg" : "rounded-full";

  return (
    <div className={fullWidth ? "w-full" : "inline-flex"}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={`flex ${fullWidth ? "w-full" : ""} ${height} ${text} ${pad} ${radius} items-center gap-2 border bg-[var(--cwh)] font-medium shadow-[0_1px_2px_rgba(15,32,60,0.04)] transition-colors ${
          disabled
            ? "cursor-not-allowed border-[var(--clg)] text-[var(--cmtl)] opacity-70"
            : `${selectedOptions.length ? "text-[var(--ct)]" : "text-[var(--cmt)]"} border-[var(--cbr)] hover:border-[var(--cg)]`
        }`}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        ref={triggerRef}
        type="button"
      >
        {icon}
        <span className="min-w-0 flex-1 truncate text-left">{triggerLabel}</span>
        <ChevronDown className={`shrink-0 text-[var(--cmtl)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} size={14} />
      </button>
      {open && rect
        ? createPortal(
          <div
            aria-multiselectable="true"
            className="select-pop fixed z-[10000] max-h-72 overflow-y-auto rounded-xl border border-[var(--cbr)] bg-[var(--cwh)] p-1.5 shadow-[0_18px_40px_rgba(15,32,60,0.16)]"
            onKeyDown={onMenuKeyDown}
            ref={menuRef}
            role="listbox"
            style={menuStyle(rect)}
          >
            {options.map((option) => {
              const isSelected = selectedValues.has(option.value);
              return (
                <button
                  aria-selected={isSelected}
                  className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    isSelected ? "bg-[var(--cc)] font-semibold text-[var(--cr)]" : "font-medium text-[var(--ct)] hover:bg-[var(--cc)]"
                  }`}
                  data-selected={isSelected}
                  key={option.value}
                  onClick={() => toggle(option.value)}
                  role="option"
                  type="button"
                >
                  <span className="truncate">{option.label}</span>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${isSelected ? "border-[var(--cr)] bg-[var(--cr)] text-white" : "border-[var(--cbr)] bg-white"}`}>
                    {isSelected ? <Check size={13} /> : null}
                  </span>
                </button>
              );
            })}
            <div className="sticky bottom-0 mt-1 flex items-center justify-between gap-2 border-t border-[var(--cbr)] bg-[var(--cwh)] px-2 py-2">
              <button className="text-xs font-bold text-[var(--cmt)] hover:text-[var(--ct)]" disabled={!values.length} onClick={() => onChange([])} type="button">Clear</button>
              <button className="rounded-lg bg-[var(--cr)] px-3 py-1.5 text-xs font-bold text-white" onClick={() => { setOpen(false); triggerRef.current?.focus(); }} type="button">Done</button>
            </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}
