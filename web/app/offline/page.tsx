import type { Metadata } from "next";

import { LogoMark } from "@/components/brand/logo";

import { RetryButton } from "./retry";

export const metadata: Metadata = { title: "You're offline", robots: { index: false, follow: false } };

// Precached by the service worker and shown when a page can't load without a connection (app/sw.ts). Static: no
// data, nothing personal.
export default function OfflinePage() {
  return (
    <main id="pc-offline-page" className="flex flex-1 flex-col items-center justify-center gap-4 bg-canvas p-6 text-center">
      <LogoMark size={72} />
      <h1 className="font-display text-2xl font-bold">You&apos;re offline</h1>
      <p className="max-w-xs text-muted-foreground">We&apos;ll reload when you&apos;re back.</p>
      <RetryButton />
    </main>
  );
}
