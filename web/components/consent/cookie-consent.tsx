"use client";

import { Cookie } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";

import { identify, syncAnalytics, track } from "@/lib/analytics";
import {
  CONSENT_COOKIE,
  onConsentChange,
  onOpenCookieSettings,
  parseConsent,
  saveConsent,
  type Consent,
} from "@/lib/consent";
import { cn } from "@/lib/utils";

// Banner on the first visit (bottom sheet on phones, bottom-left card on laptops), and the analytics loader that
// follows the choice. Mounted once in the root layout.
export function CookieConsent() {
  // The saved choice, read from the cookie; null on the server (not known yet).
  const raw = useSyncExternalStore(subscribeConsent, consentSnapshot, () => null);
  const ready = raw !== null;
  const consent = ready ? parseConsent(raw) : null;
  const [reopened, setReopened] = useState(false);
  const [settings, setSettings] = useState(false);
  // Not on the offline page (served at whatever address failed to load): the banner would hide its only message.
  const offlinePage = ready && document.getElementById("pc-offline-page") !== null;
  const open = ready && !offlinePage && (consent === null || reopened);

  useEffect(
    () =>
      onOpenCookieSettings(() => {
        setSettings(true);
        setReopened(true);
      }),
    [],
  );

  function choose(choice: { analytics: boolean; replay: boolean }) {
    saveConsent(choice);
    setReopened(false);
    setSettings(false);
  }

  return (
    <>
      {ready && (
        <Suspense>
          <AnalyticsSync consent={consent} />
        </Suspense>
      )}
      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby="cookie-title"
          className={cn(
            "fixed inset-x-0 bottom-0 z-[60] flex max-h-[85dvh] flex-col gap-4 overflow-y-auto rounded-t-3xl border-t border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ink shadow-[0_-8px_30px_rgba(5,46,22,.18)]",
            "lg:inset-x-auto lg:bottom-6 lg:left-6 lg:w-[400px] lg:rounded-3xl lg:border",
          )}
        >
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-full bg-mint text-primary">
              <Cookie className="size-5" aria-hidden />
            </span>
            <h2 id="cookie-title" className="font-display text-lg font-bold">
              {settings ? "Cookie settings" : "Cookies on PlastiCash"}
            </h2>
          </div>
          {settings ? (
            <CookieSettings consent={consent} onSave={choose} />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                We use essential cookies to keep you logged in. With your OK we also count visits to improve the app.
                We never sell your data.{" "}
                <Link href="/privacy#cookies" className="font-semibold text-primary underline underline-offset-2">
                  Privacy notice
                </Link>
              </p>
              <div className="flex flex-col gap-2">
                <button type="button" className="d-btn d-btn-primary d-btn-block" onClick={() => choose({ analytics: true, replay: false })}>
                  Accept all
                </button>
                <div className="grid gap-2">
                  <button type="button" className="d-btn d-btn-outline" onClick={() => choose({ analytics: false, replay: false })}>
                    Reject non-essential
                  </button>
                  <button type="button" className="d-btn d-btn-ghost" onClick={() => setSettings(true)}>
                    Settings
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

function CookieSettings({ consent, onSave }: { consent: Consent | null; onSave: (c: { analytics: boolean; replay: boolean }) => void }) {
  const [analytics, setAnalytics] = useState(consent?.analytics ?? false);
  const [replay, setReplay] = useState(consent?.replay ?? false);

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
        <Toggle
          id="c-essential"
          title="Essential"
          body="Your login session and settings like dark mode. Always on: the app can't work without them."
          checked
          disabled
        />
        <Toggle
          id="c-analytics"
          title="Analytics"
          body="Counts page visits and a few steps, like finishing sign-up or requesting a pickup. Tied to your account ID only. We never send your name, phone, address or amounts."
          checked={analytics}
          onChange={(on) => {
            setAnalytics(on);
            if (!on) setReplay(false);
          }}
        />
        <Toggle
          id="c-replay"
          title="Session recordings"
          body="Records how pages are used so we can fix confusing screens. Everything you type and all text is hidden. Never on your wallet or settings."
          checked={replay}
          disabled={!analytics}
          onChange={setReplay}
        />
      </ul>
      <button type="button" className="d-btn d-btn-primary d-btn-block" onClick={() => onSave({ analytics, replay })}>
        Save choices
      </button>
    </div>
  );
}

function Toggle({
  id,
  title,
  body,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  title: string;
  body: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (on: boolean) => void;
}) {
  return (
    <li className="flex items-start gap-3 p-3.5">
      <div className="flex-1">
        <label htmlFor={id} className="font-semibold">
          {title}
        </label>
        <p id={`${id}-d`} className="text-xs text-muted-foreground">
          {body}
        </p>
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="d-toggle d-toggle-primary mt-0.5"
        checked={checked}
        disabled={disabled}
        aria-describedby={`${id}-d`}
        onChange={(e) => onChange?.(e.target.checked)}
      />
    </li>
  );
}

function subscribeConsent(onChange: () => void) {
  return onConsentChange(onChange);
}

// The raw cookie value ("" when there is none), so the snapshot is a stable string.
function consentSnapshot() {
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${CONSENT_COOKIE}=`));
  return match ? match.slice(CONSENT_COOKIE.length + 1) : "";
}

// Runs analytics on route and consent changes. `?signup=1` (set after sign-up step 2) becomes one signup_completed.
function AnalyticsSync({ consent }: { consent: Consent | null }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const signedUp = search.get("signup") === "1";

  useEffect(() => {
    void syncAnalytics(pathname, consent).then(() => {
      if (signedUp) track("signup_completed");
    });
    if (signedUp) router.replace(pathname, { scroll: false });
  }, [pathname, consent, signedUp, router]);

  return null;
}

/** Put in a layout that knows the user: identifies by Supabase user id only. */
export function AnalyticsUser({ id }: { id: string }) {
  useEffect(() => {
    identify(id);
  }, [id]);
  return null;
}
