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
import { Building2, Download, House, Share, Smartphone, User, Wallet, Wrench, WifiOff, X } from "lucide-react";
import { Sheet } from "@/components/resident/sheet";
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

const INSTALL_DISMISSED_KEY = "sms.resident.install-popup-dismissed.v1";

type BeforeInstallPromptEvent = Event & {
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
      <InstallPrompt enabled={!isFullScreen} />
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
 * Immediate mobile install popup.
 *
 * Android Chrome exposes the native installer through `beforeinstallprompt`,
 * which still requires a tap. iOS Safari has no native event, so the popup gives
 * the exact Share-sheet path instead.
 */
export function InstallPrompt({ enabled = true }: { enabled?: boolean }) {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const timer = window.setTimeout(() => {
      const mobilePlatform = detectMobilePlatform();
      setPlatform(mobilePlatform);

      if (mobilePlatform === "other") return;
      if (isInstalled()) return;
      if (window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "1") return;

      setOpen(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    function onPrompt(event: Event) {
      event.preventDefault();
      if (isInstalled()) return;
      if (window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "1") return;

      setPrompt(event as BeforeInstallPromptEvent);
      setPlatform("android");
      setOpen(true);
    }

    function onInstalled() {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
      setOpen(false);
      setPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [enabled]);

  function close() {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    setOpen(false);
  }

  async function install() {
    if (!prompt || installing) return;
    setInstalling(true);
    await prompt.prompt();
    await prompt.userChoice;
    setInstalling(false);
    setPrompt(null);
    close();
  }

  if (!enabled || platform === "other") return null;

  const isIos = platform === "ios";

  return (
    <Sheet
      open={open}
      onClose={close}
      subtitle="Add the co-owner portal to your home screen for faster access and offline support."
      title={isIos ? "Install on iPhone" : "Install the app"}
    >
      <div className="r-install-modal">
        <div className="r-install-modal__hero">
          <span className="r-install-modal__mark">
            <Download size={22} />
          </span>
          <div>
            <div className="r-install-modal__title">SyndicMS Co-Owner Portal</div>
            <div className="r-install-modal__sub">One tap from your home screen.</div>
          </div>
        </div>

        {isIos ? (
          <ol className="r-install-steps">
            <li>
              <span className="r-install-steps__mark">
                <Share size={14} />
              </span>
              Tap Share in Safari.
            </li>
            <li>
              <span className="r-install-steps__mark">+</span>
              Choose Add to Home Screen.
            </li>
            <li>
              <span className="r-install-steps__mark">
                <Smartphone size={14} />
              </span>
              Tap Add to install the app icon.
            </li>
          </ol>
        ) : (
          <div className="r-install-modal__copy">
            {prompt
              ? "Tap Install to open Android's app install prompt."
              : "Your browser is preparing the install option. If it does not appear, use Chrome's menu and choose Add to Home screen."}
          </div>
        )}

        <div className="r-btn-row">
          {isIos ? (
            <button className="r-btn r-btn--primary" onClick={close} type="button">
              Got it
            </button>
          ) : (
            <button className="r-btn r-btn--primary" disabled={!prompt || installing} onClick={install} type="button">
              {prompt ? "Install" : "Preparing..."}
            </button>
          )}
          <button className="r-btn r-btn--ghost" onClick={close} type="button">
            <X size={15} />
            Later
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function detectMobilePlatform(): "ios" | "android" | "other" {
  const userAgent = window.navigator.userAgent;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const isTouchMac = window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1;

  if (/Android/i.test(userAgent)) return "android";
  if (/iPad|iPhone|iPod/i.test(userAgent) || isTouchMac || nav.standalone === true) return "ios";
  return "other";
}

function isInstalled() {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}
