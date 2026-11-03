"use client";

import { openCookieSettings } from "@/lib/consent";

export function CookieSettingsLink({ className, children = "Cookie settings" }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={openCookieSettings} className={className}>
      {children}
    </button>
  );
}
