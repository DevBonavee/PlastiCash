"use client";

import { SerwistProvider, useSerwist } from "@serwist/turbopack/react";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";

import { track } from "@/lib/analytics";
import { listenForInstall, SW_URL } from "@/lib/pwa";

// Registers the service worker (production only), offers updates, and listens for the install prompt.
// cacheOnNavigation is off: it would ask the worker to cache every page visited, including private ones.
// reloadOnOnline is off: the page must never reload by itself while someone is filling a form.
export function PwaProvider({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider
      swUrl={SW_URL}
      disable={process.env.NODE_ENV === "development"}
      cacheOnNavigation={false}
      reloadOnOnline={false}
      options={{ scope: "/" }}
    >
      <UpdatePrompt />
      <InstallListener />
      {children}
    </SerwistProvider>
  );
}

// A new version installed and waiting: ask, and only switch (and reload) when the user taps Refresh.
function UpdatePrompt() {
  const { serwist } = useSerwist();
  useEffect(() => {
    if (!serwist) return;
    const onWaiting = () => {
      toast("A new version of PlastiCash is ready", {
        id: "pwa-update",
        duration: Infinity,
        action: {
          label: "Refresh",
          onClick: () => {
            serwist.addEventListener("controlling", () => window.location.reload());
            serwist.messageSkipWaiting();
          },
        },
      });
    };
    serwist.addEventListener("waiting", onWaiting);
    return () => serwist.removeEventListener("waiting", onWaiting);
  }, [serwist]);
  return null;
}

function InstallListener() {
  // pwa_installed is only sent when the user accepted analytics (track() checks the consent).
  useEffect(() => listenForInstall(() => track("pwa_installed")), []);
  return null;
}
