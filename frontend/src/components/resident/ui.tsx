"use client";

/**
 * Shared building blocks for the resident screens.
 *
 * These exist so a screen file reads as its own content rather than as a wall
 * of divs, and so the mobile treatment of a card, a money figure or an empty
 * state is defined once. Styling lives in resident.css against the console's
 * tokens; nothing here hardcodes a colour.
 */

import { useRouter } from "next/navigation";
import { ArrowLeft, WifiOff, type LucideIcon } from "lucide-react";

/* --- Screen scaffold ------------------------------------------------------ */

export function ScreenHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: string | null;
  /** A route to return to, or true to step back in history. */
  back?: string | true;
  action?: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="r-screen__head">
      {back ? (
        <button
          aria-label="Go back"
          className="r-iconbtn"
          onClick={() => (back === true ? router.back() : router.push(back))}
          type="button"
        >
          <ArrowLeft size={17} />
        </button>
      ) : null}
      <div className="r-screen__title">
        {title}
        {subtitle ? <div className="r-screen__subtitle">{subtitle}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  if (!action) return <div className="r-section">{children}</div>;
  return (
    <div className="r-section-row">
      <div className="r-section">{children}</div>
      {action}
    </div>
  );
}

/* --- Cards ---------------------------------------------------------------- */

type CardProps = {
  children: React.ReactNode;
  accent?: boolean;
  flush?: boolean;
  className?: string;
};

export function Card({ children, accent, flush, className }: CardProps) {
  return (
    <div
      className={[
        "r-card",
        accent ? "r-card--accent" : "",
        flush ? "r-card--flush" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

export function TapCard({
  children,
  onClick,
  accent,
  className,
}: CardProps & { onClick: () => void }) {
  return (
    <button
      className={[
        "r-card",
        "r-card--tap",
        accent ? "r-card--accent" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/* --- Money ---------------------------------------------------------------- */

const RUPEES = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const WHOLE = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

/** "Rs 8,500.00" — the standard inline amount. */
export function rs(amount: number | null | undefined, decimals = true) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return "—";
  const value = Math.abs(Number(amount));
  const sign = Number(amount) < 0 ? "−" : "";
  return `${sign}Rs ${decimals ? RUPEES.format(value) : WHOLE.format(value)}`;
}

/** "Rs 1.2M" — for tiles where the exact rupee is noise. */
export function rsCompact(amount: number | null | undefined) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return "—";
  const value = Math.abs(Number(amount));
  const sign = Number(amount) < 0 ? "−" : "";
  if (value >= 1_000_000) return `${sign}Rs ${trim(value / 1_000_000)}M`;
  if (value >= 1_000) return `${sign}Rs ${trim(value / 1_000)}K`;
  return `${sign}Rs ${WHOLE.format(value)}`;
}

function trim(value: number) {
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return String(rounded);
}

/**
 * The large balance figure, with the cents set smaller so the rupees read at a
 * glance without losing the precision an account statement needs.
 */
export function Balance({
  amount,
  tone = "neutral",
}: {
  amount: number;
  tone?: "neutral" | "due" | "clear";
}) {
  const value = Math.abs(amount);
  const whole = Math.floor(value);
  const cents = Math.round((value - whole) * 100);

  return (
    <div
      className={[
        "r-balance",
        tone === "due" ? "r-balance--due" : "",
        tone === "clear" ? "r-balance--clear" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="r-balance__currency">Rs</span>
      {WHOLE.format(whole)}
      <span className="r-balance__cents">.{String(cents).padStart(2, "0")}</span>
    </div>
  );
}

/* --- Status --------------------------------------------------------------- */

const STATUS_LABELS: Record<string, string> = {
  issued: "Issued",
  part_paid: "Part paid",
  paid: "Paid",
  overdue: "Overdue",
  disputed: "Disputed",
  cancelled: "Cancelled",
  confirmed: "Confirmed",
  pending: "Pending",
  complete: "Unbilled",
  billed: "Billed",
  active: "Active",
  expired: "Expired",
  used: "Used",
  open: "Open",
};

export function Status({ value, label }: { value: string; label?: string }) {
  return (
    <span className={`pill pill--${value}`}>
      {label ?? STATUS_LABELS[value] ?? titleCase(value)}
    </span>
  );
}

export function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

/* --- Marks ---------------------------------------------------------------- */

export function Mark({
  icon: Icon,
  tone = "tint-neutral",
  size = 34,
  iconSize = 16,
}: {
  icon: LucideIcon;
  tone?: string;
  size?: number;
  iconSize?: number;
}) {
  return (
    <span
      className={`r-row__mark ${tone}`}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.29) }}
    >
      <Icon size={iconSize} strokeWidth={2.1} />
    </span>
  );
}

/* --- Chips ---------------------------------------------------------------- */

export type ChipOption = { key: string; label: string; count?: number };

export function Chips({
  options,
  value,
  onChange,
}: {
  options: ChipOption[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="r-chips" role="tablist">
      {options.map((option) => (
        <button
          aria-selected={option.key === value}
          className={`r-chip ${option.key === value ? "is-active" : ""}`}
          key={option.key}
          onClick={() => onChange(option.key)}
          role="tab"
          type="button"
        >
          {option.label}
          {option.count === undefined ? null : (
            <span className="r-chip__count">{option.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* --- Feedback ------------------------------------------------------------- */

export function Notice({
  tone = "info",
  icon: Icon,
  children,
}: {
  tone?: "info" | "ok" | "warn" | "er" | "plain";
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className={`r-notice ${tone === "plain" ? "" : `r-notice--${tone}`}`}>
      {Icon ? <Icon size={15} /> : null}
      <div>{children}</div>
    </div>
  );
}

export function StaleDataNotice() {
  return (
    <Notice icon={WifiOff} tone="warn">
      Showing saved data from this device. Reconnect to refresh before making decisions.
    </Notice>
  );
}

export function Empty({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="r-empty">
      <div className="r-empty__mark">
        <Icon size={19} />
      </div>
      <div className="r-empty__title">{title}</div>
      {children ? <div className="r-empty__sub">{children}</div> : null}
      {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
    </div>
  );
}

export function Skeleton({ height = 80, radius }: { height?: number; radius?: number }) {
  return (
    <div
      className="r-skeleton"
      style={{ height, borderRadius: radius, marginBottom: 10 }}
    />
  );
}

export function ScreenSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton height={118} />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton height={64} key={index} />
      ))}
    </div>
  );
}

/* --- Definition rows ------------------------------------------------------ */

export function DefRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="r-def">
      <span className="r-def__key">{label}</span>
      <span className="r-def__value">{children}</span>
    </div>
  );
}

/* --- Dates ---------------------------------------------------------------- */

export function formatDay(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export function formatShortDay(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(parsed);
}

export function formatDayTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

export function relativeTime(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  const seconds = Math.round((Date.now() - parsed.getTime()) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  return formatShortDay(value);
}
