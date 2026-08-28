import type { Metadata } from "next";
import { SyndicSessionProvider } from "@/lib/syndic/session";

export const metadata: Metadata = {
  title: "SyndicMS — Syndic Console",
  description:
    "Property registry, co-owner accounts, billing, maintenance and governance for one development.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * The session provider wraps the whole surface, including /syndic/login, so the
 * login screen can redirect an already-signed-in manager straight to their
 * dashboard rather than making them sign in twice.
 */
export default function SyndicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <SyndicSessionProvider>{children}</SyndicSessionProvider>;
}
