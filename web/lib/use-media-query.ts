"use client";

import { useSyncExternalStore } from "react";

export const LAPTOP = "(min-width: 1024px)";

// True while the media query matches; false on the server and in the first render.
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
