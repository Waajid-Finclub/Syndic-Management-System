"use client";

/**
 * Syndic Admin shell — the frame every layer 2 screen sits inside.
 *
 * Structurally the operator console's shell (same sidebar, same topbar, same
 * design tokens) with three differences that matter:
 *
 * 1. The sidebar names the development, because a syndic account is bound to
 *    one and confusing two buildings is the expensive mistake here.
 * 2. Navigation is filtered by the layer 2 matrix, not the layer 1 one.
 * 3. A support session — a platform super admin impersonating this client —
 *    paints a persistent banner. An operator who forgets they are inside a
 *    client's console is how a support visit becomes an incident.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import {
  Banknote,
  Building2,
  CalendarCheck,
  FileText,
  Gauge,
  LifeBuoy,
  LogOut,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShieldCheck,
  Truck,
  UserCog,
  Users,
  Vote,
  Wrench,
} from "lucide-react";
import { api } from "@/lib/api";
import { canView } from "@/lib/syndic/hooks";
import { useSyndicSession } from "@/lib/syndic/session";
import type { SyndicMatrix } from "@/lib/syndic/types";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Building2;
  module: string;
};

type NavSection = {
  title: string;
  sub: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    title: "Development",
    sub: "Property and people",
    items: [
      { href: "/syndic/dashboard", label: "Overview", icon: Gauge, module: "overview" },
      { href: "/syndic/registry", label: "Property Registry", icon: Building2, module: "registry" },
      { href: "/syndic/co-owners", label: "Co-Owners", icon: Users, module: "co_owners" },
    ],
  },
  {
    title: "Finance",
    sub: "Billing and collections",
    items: [
      { href: "/syndic/finance", label: "Billing & Payments", icon: Banknote, module: "finance" },
      { href: "/syndic/funds", label: "Funds", icon: FileText, module: "funds" },
    ],
  },
  {
    title: "Operations",
    sub: "Work and contractors",
    items: [
      { href: "/syndic/maintenance", label: "Maintenance", icon: Wrench, module: "maintenance" },
      { href: "/syndic/vendors", label: "Vendors", icon: Truck, module: "vendors" },
    ],
  },
  {
    title: "Governance",
    sub: "Meetings and community",
    items: [
      { href: "/syndic/governance", label: "Meetings & Voting", icon: Vote, module: "governance" },
      { href: "/syndic/community", label: "Notices & Community", icon: Megaphone, module: "community" },
      { href: "/syndic/documents", label: "Documents", icon: FileText, module: "documents" },
    ],
  },
  {
    title: "Administration",
    sub: "Access and configuration",
    items: [
      { href: "/syndic/team", label: "Team & Access", icon: UserCog, module: "team" },
      { href: "/syndic/settings", label: "Settings", icon: Settings, module: "settings" },
    ],
  },
];

const SIDEBAR_STORAGE_KEY = "sms.syndic.sidebar.collapsed";
const sidebarListeners = new Set<() => void>();
let sidebarCollapsed: boolean | null = null;

function readSidebarCollapsed() {
  if (sidebarCollapsed === null) {
    sidebarCollapsed =
      typeof window !== "undefined" && window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  }
  return sidebarCollapsed;
}

function setSidebarCollapsed(next: boolean) {
  sidebarCollapsed = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
  }
  sidebarListeners.forEach((listener) => listener());
}

function subscribeSidebar(listener: () => void) {
  sidebarListeners.add(listener);
  return () => {
    sidebarListeners.delete(listener);
  };
}

function useSidebarCollapsed() {
  return useSyncExternalStore(subscribeSidebar, readSidebarCollapsed, () => false);
}

export type SyndicShellProps = {
  children: React.ReactNode;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  searchValue?: string;
};

export function SyndicShell({
  children,
  onSearch,
  searchPlaceholder = "Search...",
  searchValue,
}: SyndicShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = useSidebarCollapsed();
  const { session, signOut } = useSyndicSession();

  const user = session?.user ?? null;
  const development = session?.development ?? null;
  const sections = visibleNavSections(session?.permissions ?? {});
  const isSupport = Boolean(user?.impersonating);

  async function endSupport() {
    await api<{ redirect?: string }>("/api/impersonate/stop", { method: "POST" }).catch(() => null);
    router.push("/properties");
  }

  return (
    <div className={`app-layout ${collapsed ? "app-layout--collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar__logo">
          <div className="sidebar__logo-icon">SY</div>
          <div className="sidebar__logo-copy">
            <div className="sidebar__logo-text">{development?.name ?? "SyndicMS"}</div>
            <div className="sidebar__logo-sub">Syndic Console</div>
          </div>
          <button
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="sidebar__collapse"
            onClick={() => setSidebarCollapsed(!collapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            type="button"
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <nav className="sidebar__nav">
          {sections.map((section) => {
            const active = section.items.some(
              (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
            );
            return (
              <div className={`sidebar__section ${active ? "active" : ""}`} key={section.title}>
                <div className="sidebar__section-title">{section.title}</div>
                <div className="sidebar__section-sub">{section.sub}</div>
                {section.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <Link
                      className={`sidebar__item ${isActive ? "active" : ""}`}
                      href={item.href}
                      key={item.href}
                      title={item.label}
                    >
                      <span className="sidebar__item-mark">
                        <Icon size={14} strokeWidth={2.2} />
                      </span>
                      <span className="sidebar__item-label">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="sidebar__notice">
          <div className="sidebar__notice-title">
            <Building2 size={11} />
            {development?.code ?? "—"}
          </div>
          <div className="sidebar__notice-sub">
            {development
              ? `${development.unit_count} unit${development.unit_count === 1 ? "" : "s"} · ${
                  development.plan_name ?? "No plan"
                }`
              : "Loading development..."}
          </div>
        </div>

        <div className="sidebar__account">
          {user ? (
            <>
              <div className="sidebar__account-avatar">{user.initials}</div>
              <div className="sidebar__account-copy">
                <div className="sidebar__account-name">{user.name}</div>
                <div className="sidebar__account-role">{user.role_display}</div>
              </div>
            </>
          ) : (
            <div className="sidebar__account-copy" />
          )}
          <button
            aria-label={isSupport ? "End support session" : "Sign out"}
            className="sidebar__logout"
            onClick={isSupport ? endSupport : signOut}
            title={isSupport ? "End support session" : "Sign out"}
            type="button"
          >
            <LogOut size={15} />
          </button>
        </div>

        <div className="sidebar__footer">SyndicMS v1.0 &middot; Syndic administration</div>
      </aside>

      <div className="main-content">
        <header className="topbar">
          <span className="topbar__role">
            <ShieldCheck size={12} />
            {user?.role_display ?? "Syndic"}
          </span>

          {onSearch ? (
            <div className="topbar__search">
              <Search className="topbar__search-icon" size={14} />
              <input
                aria-label={searchPlaceholder}
                onChange={(event) => onSearch(event.target.value)}
                placeholder={searchPlaceholder}
                value={searchValue ?? ""}
              />
            </div>
          ) : null}

          <div className="topbar__spacer" />

          <span className="topbar__chip">
            <CalendarCheck size={11} />
            {development?.status === "active" ? "Live" : development?.status ?? "—"}
          </span>
          <span className="topbar__avatar">{user?.initials ?? "--"}</span>
        </header>

        {isSupport ? (
          <div className="support-banner">
            <LifeBuoy size={14} />
            <div className="support-banner__copy">
              <strong>Platform support session</strong>
              <span>
                You are working inside {development?.name}. Every action is recorded in this
                client&apos;s audit log under your own name.
              </span>
            </div>
            <button className="support-banner__end" onClick={endSupport} type="button">
              End session
            </button>
          </div>
        ) : null}

        <main className="page">{children}</main>
      </div>
    </div>
  );
}

function visibleNavSections(permissions: SyndicMatrix): NavSection[] {
  return navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canView(permissions, item.module)),
    }))
    .filter((section) => section.items.length > 0);
}
