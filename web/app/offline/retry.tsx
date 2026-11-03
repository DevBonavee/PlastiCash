"use client";

import { useEffect, useState } from "react";

const CHECK_EVERY_MS = 5000;

// Throws while offline. Any answer from our server counts, including a redirect to the login page.
const reachable = () => fetch(window.location.href, { method: "HEAD", cache: "no-store", redirect: "manual" });

// The offline page is served at the address the user wanted. Reload when that page answers again: on the "online"
// event, and by asking the network every few seconds, since navigator.onLine can say "online" on a dead connection.
export function RetryButton() {
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        await reachable();
        if (!stopped) window.location.reload();
      } catch {
        /* still offline */
      }
    };
    const timer = setInterval(check, CHECK_EVERY_MS);
    window.addEventListener("online", check);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("online", check);
    };
  }, []);

  async function retry() {
    setChecking(true);
    try {
      await reachable();
      return window.location.reload();
    } catch {
      /* still offline */
    }
    setChecking(false);
  }

  return (
    <button type="button" className="d-btn d-btn-primary" onClick={retry} disabled={checking}>
      {checking ? "Checking…" : "Retry"}
    </button>
  );
}
