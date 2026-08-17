"use client";

/**
 * Resident shell — the frame every signed-in screen sits inside.
 *
 * Holds four things the screens should not each reimplement: the bottom tab
 * bar, the offline banner, the service-worker registration, and the install
 * prompt. The tab bar is hidden on the auth screens and on any screen pushed
 * on top of a tab (an invoice, a request) so the back affordance in the header
 * is the single way out — two competing navigations on one screen is how
 * people get lost.
 *
 * The Finance tab is absent for tenants rather than disabled. A disabled tab
 * advertises something they will never be given; the API refuses those routes
 * regardless, so hiding it is honest, not merely cosmetic.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, House, User, Wallet, Wrench, WifiOff, Download, X } from "lucide-react";
import { useOnline } from "@/lib/resident/hooks";
import { useResidentSession } from "@/lib/resident/session";

type Tab = {
  href: string;
  label: string;
  icon: typeof House;
  /** Feature key that must be true for the tab to appear. */
  feature?: "finance" | "maintenance" | "community";
};

const TABS: Tab[] = [
  { href: "/app/home", label: "Home", icon: House },
  { href: "/app/finance", label: "Finance", icon: Wallet, feature: "finance" },
  { href: "/app/report", label: "Report", icon: Wrench, feature: "maintenance" },
  { href: "/app/coop", label: "My Co-Op", icon: Building2, feature: "community" },
  { href: "/app/account", label: "Account", icon: User },
];

/** Screens that own the whole viewport — no tab bar, no chrome. */
const FULL_SCREEN = ["/app/login", "/app/register"];

const INSTALL_DISMISSED_KEY = "sms.resident.install-dismissed";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function ResidentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const online = useOnline();
  const { session } = useResidentSession();

  const isFullScreen = FULL_SCREEN.some((route) => pathname.startsWith(route));
  const tabs = visibleTabs(session?.user.features);
  // Only the tab roots show the bar; anything pushed above one does not.
  const showTabs = !isFullScreen && tabs.some((tab) => tab.href === pathname);

  return (
    <div className="r-app">
      <ServiceWorker />
      {online ? null : (
        <div className="r-offline">
          <WifiOff size={14} />
          Offline — showing the last data received. Payments and submissions are paused.
        </div>
      )}
      {children}
      {showTabs ? <TabBar tabs={tabs} pathname={pathname} /> : null}
    </div>
  );
}

function visibleTabs(features?: { finance: boolean; maintenance: boolean; community: boolean }) {
  if (!features) return TABS.filter((tab) => !tab.feature);
  return TABS.filter((tab) => !tab.feature || features[tab.feature]);
}

function TabBar({ tabs, pathname }: { tabs: Tab[]; pathname: string }) {
  const { session } = useResidentSession();
  const unread = session?.unread_notifications ?? 0;

  return (
    <nav aria-label="Sections" className="r-tabbar">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const Icon = tab.icon;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`r-tab ${active ? "is-active" : ""}`}
            href={tab.href}
            key={tab.href}
          >
            <span className="r-tab__mark">
              <Icon size={19} strokeWidth={active ? 2.3 : 1.9} />
              {tab.href === "/app/account" && unread > 0 ? (
                <span className="r-tab__badge" />
              ) : null}
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Registers the service worker scoped to /app/ only.
 *
 * The console shares this origin and must not be intercepted by a cache
 * designed for a phone: an operator refreshing a dashboard needs the live
 * figure, never a stale one. A narrower scope than the script's own location is
 * always permitted, so /sw.js can safely claim /app/.
 */
function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker.register("/sw.js", { scope: "/app/" }).catch(() => {
      // An unavailable service worker costs offline support, nothing else.
    });
  }, []);

  return null;
}

/**
 * The install banner, shown only when the browser has actually offered one.
 *
 * `beforeinstallprompt` does not fire on iOS, so nothing is shown there rather
 * than instructions for a button that does not exist; iOS users install from
 * the Share sheet, which the account screen explains.
 */
export function InstallPrompt() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    function onPrompt(event: Event) {
      event.preventDefault();
      // Check the dismissal here rather than on mount: the answer only matters
      // once the browser has actually offered an install.
      if (window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "1") return;
      setPrompt(event as InstallPrompt);
    }

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function close() {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    setPrompt(null);
  }

  if (!prompt) return null;

  return (
    <div className="r-install">
      <span className="r-row__mark tint-neutral">
        <Download size={16} />
      </span>
      <div className="r-install__body">
        <div className="r-install__title">Install the app</div>
        <div className="r-install__sub">Add it to your home screen for offline access</div>
      </div>
      <button
        className="r-btn r-btn--sm r-btn--primary"
        onClick={async () => {
          await prompt.prompt();
          await prompt.userChoice;
          setPrompt(null);
        }}
        type="button"
      >
        Install
      </button>
      <button aria-label="Dismiss" className="r-btn r-btn--sm r-btn--ghost" onClick={close} type="button">
        <X size={15} />
      </button>
    </div>
  );
}
