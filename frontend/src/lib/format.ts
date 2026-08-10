const CURRENCY = "MUR";

export function number(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return Number(value).toLocaleString("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function money(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${CURRENCY} ${number(value, digits)}`;
}

/** Compact money for dense tables and KPI tiles: "Rs 45K", "Rs 2.1M". */
export function compactMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const amount = Number(value);
  const sign = amount < 0 ? "-" : "";
  const size = Math.abs(amount);

  if (size >= 1_000_000) return `${sign}Rs ${trim(size / 1_000_000)}M`;
  if (size >= 1_000) return `${sign}Rs ${trim(size / 1_000)}K`;
  return `${sign}Rs ${number(size, 0)}`;
}

export function compactNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const size = Math.abs(Number(value));
  if (size >= 1_000_000) return `${trim(size / 1_000_000)}M`;
  if (size >= 10_000) return `${trim(size / 1_000)}K`;
  return number(value, 0);
}

function trim(value: number) {
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return String(rounded);
}

export function percent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${number(value, digits)}%`;
}

export function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

/** Short month/year used in the property registry "Since" column. */
export function formatMonthYear(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" }).format(parsed);
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

/** "2h ago", "3d ago" — used by the alert feed and last-login column. */
export function relativeTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";

  const seconds = Math.round((Date.now() - parsed.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

export function monthLabel(periodMonth: string) {
  const [year, month] = periodMonth.split("-").map(Number);
  if (!year || !month) return periodMonth;
  return new Intl.DateTimeFormat("en-GB", { month: "short" }).format(new Date(year, month - 1, 1));
}

export function titleCase(value?: string | null) {
  if (!value) return "-";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
