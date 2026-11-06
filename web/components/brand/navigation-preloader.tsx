"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { opensNewPage } from "@/lib/page-navigation";

// Long enough that a fast navigation reads as a deliberate beat, not a flicker.
const MIN_VISIBLE_MS = 400;
// A link whose click gets cancelled never changes the pathname; don't leave the page covered.
const GIVE_UP_MS = 10_000;

// Brings the inline preloader (components/brand/preloader.tsx) back when a link to another page is clicked, by setting
// <html data-navigating>, and clears it once the pathname changes. router.push() after a form has no link click, so
// those screens keep their own busy buttons.
export function NavigationPreloader() {
  const pathname = usePathname();
  const shownAt = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const giveUpTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const root = document.documentElement;

    function hideNow() {
      clearTimeout(hideTimer.current);
      clearTimeout(giveUpTimer.current);
      shownAt.current = 0;
      delete root.dataset.navigating;
    }

    // Capture phase: next/link calls preventDefault on its own clicks, so that can't tell links apart afterwards.
    function onClick(event: MouseEvent) {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (!link) return;
      const newPage = opensNewPage(link.href, window.location.href, {
        button: event.button,
        modified: event.ctrlKey || event.metaKey || event.shiftKey || event.altKey,
        target: link.target,
        download: link.hasAttribute("download"),
      });
      if (!newPage) return;
      clearTimeout(hideTimer.current);
      clearTimeout(giveUpTimer.current);
      shownAt.current = performance.now();
      root.dataset.navigating = "1";
      giveUpTimer.current = setTimeout(hideNow, GIVE_UP_MS);
    }

    // Back to a page the browser kept frozen, with the cover still on from the click that left it.
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) hideNow();
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pageshow", onPageShow);
      hideNow();
    };
  }, []);

  useEffect(() => {
    if (!shownAt.current) return;
    const left = MIN_VISIBLE_MS - (performance.now() - shownAt.current);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      clearTimeout(giveUpTimer.current);
      shownAt.current = 0;
      delete document.documentElement.dataset.navigating;
    }, Math.max(left, 0));
  }, [pathname]);

  return null;
}
