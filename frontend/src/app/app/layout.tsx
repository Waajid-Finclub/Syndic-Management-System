import type { Metadata, Viewport } from "next";
import "./resident.css";
import { ResidentShell } from "@/components/resident/shell";
import { ResidentSessionProvider } from "@/lib/resident/session";

export const metadata: Metadata = {
  title: "SyndicMS — Co-Owner Portal",
  description:
    "Service charges, maintenance, co-ownership and facilities for your unit.",
  manifest: "/app.webmanifest",
  applicationName: "SyndicMS",
  appleWebApp: {
    capable: true,
    title: "SyndicMS",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Deliberately not locking maximumScale: pinch-zoom is an accessibility
  // affordance, and a statement of account is exactly the kind of thing
  // someone needs to zoom into.
  viewportFit: "cover",
  themeColor: "#f1f3f4",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ResidentLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ResidentSessionProvider>
      <ResidentShell>{children}</ResidentShell>
    </ResidentSessionProvider>
  );
}
