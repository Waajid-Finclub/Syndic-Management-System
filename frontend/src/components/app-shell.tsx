"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Building2,
  CreditCard,
  Flag,
  LayoutDashboard,
  Link2,
  Lock,
  LogOut,
  MessageSquare,
  MonitorCog,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
  ScrollText,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { canView } from "@/lib/permissions";
import type { User } from "@/lib/types";

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
    title: "Platform",
    sub: "Portfolio and clients",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard, module: "overview" },
      { href: "/properties", label: "Client Properties", icon: Building2, module: "properties" },
      { href: "/onboarding", label: "Onboarding", icon: Rocket, module: "onboarding" },
    ],
  },
  {
    title: "Administration",
    sub: "Access and commercials",
    items: [
      { href: "/users", label: "Users & Roles", icon: Users, module: "users" },
      { href: "/subscriptions", label: "Subscriptions", icon: CreditCard, module: "subscriptions" },
      { href: "/feature-flags", label: "Feature Flags", icon: Flag, module: "feature_flags" },
    ],
  },
  {
    title: "System",
    sub: "Health and integrations",
    items: [
      { href: "/monitoring", label: "System Monitoring", icon: MonitorCog, module: "monitoring" },
      { href: "/audit", label: "Audit Log", icon: ScrollText, module: "audit" },
      { href: "/whatsapp", label: "WhatsApp Status", icon: MessageSquare, module: "whatsapp" },
      { href: "/integrations", label: "API & Integrations", icon: Link2, module: "integrations" },
    ],
  },
];

const SIDEBAR_STORAGE_KEY = "sms.sidebar.collapsed";
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

export type AppShellProps = {
  children: React.ReactNode;
  /** Optional live status shown in the top bar. */
  operational?: boolean;
  whatsappOk?: boolean;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  searchValue?: string;
};

export function AppShell({
  children,
  operational = true,
  whatsappOk = true,
  onSearch,
  searchPlaceholder = "Search...",
  searchValue,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = useSidebarCollapsed();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;

    async function checkSession() {
      try {
        const session = await api<{ user: User | null }>("/api/auth/me");
        if (!alive) return;
        if (!session.user) {
          router.replace("/login");
          return;
        }
        setUser(session.user);
      } catch {
        if (alive) router.replace("/login");
      }
    }

    void checkSession();
    return () => {
      alive = false;
    };
  }, [router]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.push("/login");
  }

  const sections = user ? visibleNavSections(user) : [];

  return (
    <div className={`app-layout ${collapsed ? "app-layout--collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar__logo">
          <div className="sidebar__logo-icon">SM</div>
          <div className="sidebar__logo-copy">
            <div className="sidebar__logo-text">SyndicMS</div>
            <div className="sidebar__logo-sub">Admin Console</div>
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
            <Lock size={11} />
            Restricted access
          </div>
          <div className="sidebar__notice-sub">Every action on this console is written to the audit log.</div>
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
            aria-label="Sign out"
            className="sidebar__logout"
            onClick={logout}
            title="Sign out"
            type="button"
          >
            <LogOut size={15} />
          </button>
        </div>

        <div className="sidebar__footer">SyndicMS v1.0 &middot; Platform administration</div>
      </aside>

      <div className="main-content">
        <header className="topbar">
          <span className="topbar__role">
            <ShieldCheck size={12} />
            {user?.role_display ?? "Console"}
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

          <span className={`topbar__status ${operational ? "" : "topbar__status--warn"}`}>
            <span className="topbar__dot" />
            {operational ? "Operational" : "Degraded"}
          </span>
          <span className={`topbar__chip ${whatsappOk ? "" : "topbar__chip--off"}`}>
            <MessageSquare size={11} />
            {whatsappOk ? "WA OK" : "WA down"}
          </span>
          <span className="topbar__avatar">{user?.initials ?? "--"}</span>
        </header>

        <main className="page">{children}</main>
      </div>
    </div>
  );
}

function visibleNavSections(user: User): NavSection[] {
  return navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canView(user, item.module)),
    }))
    .filter((section) => section.items.length > 0);
}
