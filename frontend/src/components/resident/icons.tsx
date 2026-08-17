/**
 * Icon resolution for the resident app.
 *
 * The API returns icon *keys* — "wrench", "vote", "credit-card" — rather than
 * markup, so the backend never has to know which icon set the client uses. This
 * module is the single place those keys become components, and the only place
 * that changes if the icon set ever does.
 *
 * The design mockup used emoji. Emoji render differently on every platform,
 * cannot inherit colour, and read as decoration next to the console's line
 * icons — so they are mapped to the same lucide set the console uses.
 */

import { createElement } from "react";
import {
  ArrowUpDown,
  Banknote,
  BrickWall,
  Building,
  CalendarCheck,
  CarFront,
  ChartColumn,
  CircleAlert,
  CircleHelp,
  ClipboardList,
  CreditCard,
  Dumbbell,
  FileLock,
  FileText,
  Folder,
  Landmark,
  type LucideIcon,
  Megaphone,
  MessageSquare,
  Package,
  Phone,
  Receipt,
  Shield,
  Snowflake,
  Sparkles,
  SquareParking,
  Trees,
  TriangleAlert,
  UserCheck,
  Vote,
  Warehouse,
  Waves,
  Wrench,
  Zap,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  // Notification and activity keys
  "file-text": FileText,
  "message-square": MessageSquare,
  "credit-card": CreditCard,
  "calendar-check": CalendarCheck,
  "triangle-alert": TriangleAlert,
  "user-check": UserCheck,
  "circle-alert": CircleAlert,
  megaphone: Megaphone,
  vote: Vote,
  zap: Zap,
  receipt: Receipt,
  banknote: Banknote,

  // Maintenance categories
  wrench: Wrench,
  "brick-wall": BrickWall,
  sparkles: Sparkles,
  shield: Shield,
  "arrow-up-down": ArrowUpDown,
  "car-front": CarFront,
  waves: Waves,
  dumbbell: Dumbbell,
  snowflake: Snowflake,
  package: Package,
  "circle-help": CircleHelp,

  // Facilities and assets
  pool: Waves,
  gym: Dumbbell,
  hall: Landmark,
  visitor_parking: SquareParking,
  garden: Trees,
  roof: Building,
  parking: SquareParking,
  storage: Warehouse,

  // Document folders
  "clipboard-list": ClipboardList,
  "chart-column": ChartColumn,
  folder: Folder,
  landmark: Landmark,
  phone: Phone,
  "file-lock": FileLock,
};

const FALLBACK = CircleHelp;

export function iconFor(key: string | null | undefined): LucideIcon {
  if (!key) return FALLBACK;
  return ICONS[key] ?? FALLBACK;
}

export function ResolvedIcon({
  name,
  size = 16,
  strokeWidth = 2,
  className,
}: {
  name: string | null | undefined;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  // createElement rather than binding the lookup to a capitalised local: the
  // component identity comes from a fixed table, not from anything constructed
  // per render.
  return createElement(iconFor(name), { className, size, strokeWidth });
}

/** Tint class for a notification category — drawn from the shared status ramp. */
export function toneForCategory(category: string) {
  switch (category) {
    case "finance":
      return "tint-ok";
    case "maintenance":
      return "tint-wn";
    case "governance":
      return "tint-vio";
    case "whatsapp":
      return "tint-tl";
    default:
      return "tint-blu";
  }
}

/** Tint class for a maintenance priority. */
export function toneForPriority(priority: string) {
  switch (priority) {
    case "emergency":
    case "urgent":
      return "tint-er";
    case "normal":
      return "tint-wn";
    default:
      return "tint-neutral";
  }
}
