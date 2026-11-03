"use client";

import type { PostHog } from "posthog-js";

import type { Consent } from "@/lib/consent";

// Product analytics (PostHog, EU). Loaded only after the user accepts analytics, never on the collector or ops
// portals, and a no-op without NEXT_PUBLIC_POSTHOG_KEY. We send page views, the six events below and the Supabase user
// id. Never email, phone, address, bank details or money amounts: no event takes properties, and autocapture is off
// so clicked text (balances, names) is never sent.

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

export type AnalyticsEvent =
  | "signup_completed"
  | "pickup_requested"
  | "pickup_confirmed"
  | "pickup_disputed"
  | "withdrawal_requested"
  | "pwa_installed";

/** No analytics at all on these. */
export const NO_ANALYTICS = ["/collector", "/ops-portal"];
/** Analytics may run, but never a session recording. */
export const NO_RECORDING = ["/app/wallet", "/app/settings", ...NO_ANALYTICS];

export const under = (pathname: string, prefixes: string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

let client: PostHog | null = null;
let loading: Promise<PostHog | null> | null = null;
let consent: Consent | null = null;
let userId: string | null = null;
let blocked = true; // true while on a page with no analytics

export const analyticsConfigured = () => !!KEY;

async function load(): Promise<PostHog | null> {
  if (!KEY) return null;
  loading ??= import("posthog-js").then(({ default: posthog }) => {
    posthog.init(KEY, {
      api_host: HOST,
      defaults: "2025-05-24",
      person_profiles: "identified_only",
      capture_pageview: false, // sent by hand on each route change, so blocked pages never send one
      capture_pageleave: false,
      autocapture: false,
      disable_session_recording: true, // started below only with the separate "Session recordings" consent
      disable_surveys: true,
      advanced_disable_feature_flags: true,
      session_recording: { maskAllInputs: true, maskTextSelector: "*" },
      mask_all_text: true,
      mask_all_element_attributes: true,
    });
    client = posthog;
    return posthog;
  });
  return loading;
}

function syncRecording(pathname: string) {
  if (!client) return;
  const record = !!consent?.replay && !under(pathname, NO_RECORDING);
  if (record && !client.sessionRecordingStarted()) client.startSessionRecording();
  if (!record && client.sessionRecordingStarted()) client.stopSessionRecording();
}

/** Called on every route change and consent change. */
export async function syncAnalytics(pathname: string, next: Consent | null) {
  consent = next;
  blocked = under(pathname, NO_ANALYTICS);
  if (!consent?.analytics) {
    if (client) {
      client.stopSessionRecording();
      client.opt_out_capturing();
      client.reset();
    }
    return;
  }
  if (blocked) {
    syncRecording(pathname);
    return;
  }
  const posthog = await load();
  if (!posthog) return;
  if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing();
  if (userId) posthog.identify(userId);
  posthog.capture("$pageview");
  syncRecording(pathname);
}

/** Supabase user id only; null on logout. */
export function identify(id: string | null) {
  if (id === userId) return;
  const previous = userId;
  userId = id;
  if (!client || !consent?.analytics) return;
  if (id) client.identify(id);
  else if (previous) client.reset();
}

export function track(event: AnalyticsEvent) {
  if (!client || blocked || !consent?.analytics) return;
  client.capture(event);
}
