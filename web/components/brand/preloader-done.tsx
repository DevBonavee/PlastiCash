"use client";

import { useEffect } from "react";

// Runs once after React's first render in the root layout: fades the inline preloader out.
export function PreloaderDone() {
  useEffect(() => {
    document.documentElement.dataset.loaded = "1";
  }, []);
  return null;
}
