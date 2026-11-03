// Cookie consent (NDPA 2023). The choice lives in a first-party cookie, pc_consent, for 12 months:
// {"analytics":true|false,"replay":true|false,"v":1}. Essential cookies (login session, theme) need no consent.
// Session recordings have their own switch and are never turned on by accepting analytics.

export const CONSENT_COOKIE = "pc_consent";
export const CONSENT_VERSION = 1;
const MAX_AGE = 60 * 60 * 24 * 365; // 12 months
const OPEN_EVENT = "pc:open-cookie-settings";
const CHANGE_EVENT = "pc:consent-changed";

export type Consent = { analytics: boolean; replay: boolean; v: number };

export function parseConsent(raw: string | undefined | null): Consent | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(decodeURIComponent(raw));
    if (value?.v !== CONSENT_VERSION || typeof value.analytics !== "boolean") return null;
    // Recordings only ever with analytics.
    return { analytics: value.analytics, replay: value.analytics && value.replay === true, v: CONSENT_VERSION };
  } catch {
    return null;
  }
}

export function readConsent(): Consent | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${CONSENT_COOKIE}=`));
  return parseConsent(match?.slice(CONSENT_COOKIE.length + 1));
}

export function saveConsent(choice: { analytics: boolean; replay: boolean }) {
  const consent: Consent = { analytics: choice.analytics, replay: choice.analytics && choice.replay, v: CONSENT_VERSION };
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(consent))}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent<Consent>(CHANGE_EVENT, { detail: consent }));
  return consent;
}

/** "Cookie settings" links call this to reopen the banner's settings. */
export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onOpenCookieSettings(listener: () => void) {
  window.addEventListener(OPEN_EVENT, listener);
  return () => window.removeEventListener(OPEN_EVENT, listener);
}

export function onConsentChange(listener: (consent: Consent) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<Consent>).detail);
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}
