"use client";

import { useSyncExternalStore } from "react";

// Installable app (PWA) helpers: the service worker's address, online state, the install prompt and cache clearing.

/** Built from app/sw.ts by app/serwist/[path]/route.ts; scope "/". */
export const SW_URL = "/serwist/sw.js";

// ----- Online / offline -----

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** navigator.onLine, kept up to date. The server render assumes online. */
export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

export const OFFLINE_ACTION = "Connect to the internet to do this";

// ----- Install -----

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Called once from the root layout (components/brand/pwa.tsx), so the event isn't missed before /app renders. */
export function listenForInstall(onInstalled: () => void) {
  const onPrompt = (event: Event) => {
    event.preventDefault(); // we show our own card instead of Chrome's mini bar
    deferred = event as InstallPromptEvent;
    notify();
  };
  const onDone = () => {
    installed = true;
    deferred = null;
    notify();
    onInstalled();
  };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onDone);
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onDone);
  };
}

export type InstallState = "installed" | "prompt" | "ios" | "unavailable";

function installState(): InstallState {
  if (installed || window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone) {
    return "installed";
  }
  if (deferred) return "prompt";
  // iPhone and iPad Safari have no install prompt; Add to Home Screen is done by hand.
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "unavailable";
}

function subscribeInstall(onChange: () => void) {
  listeners.add(onChange);
  const standalone = window.matchMedia("(display-mode: standalone)");
  standalone.addEventListener("change", onChange);
  return () => {
    listeners.delete(onChange);
    standalone.removeEventListener("change", onChange);
  };
}

/** "unavailable" on the server and until the browser says otherwise. */
export function useInstallState() {
  return useSyncExternalStore(subscribeInstall, installState, () => "unavailable" as InstallState);
}

/** Shows the browser's install dialog (Chrome, Edge, Samsung Internet). */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  notify();
  await event.prompt();
  return (await event.userChoice).outcome === "accepted";
}

// The /app install card: hidden for 14 days after "Not now"; the iPhone tip shows once.
const DISMISSED_KEY = "pc_install_dismissed_at";
const IOS_TIP_KEY = "pc_ios_tip_seen";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

export function installCardSnoozed(now = Date.now()) {
  const at = Number(localStorage.getItem(DISMISSED_KEY) ?? 0);
  return at > 0 && now - at < SNOOZE_MS;
}

export function snoozeInstallCard() {
  localStorage.setItem(DISMISSED_KEY, String(Date.now()));
}

export const iosTipSeen = () => localStorage.getItem(IOS_TIP_KEY) === "1";
export const markIosTipSeen = () => localStorage.setItem(IOS_TIP_KEY, "1");

// ----- Caches -----

/** On logout: delete every runtime cache (public pages, images) so nothing from this session stays on a shared phone.
 * The precache only holds the build's static files and the offline page, which are the same for everyone. */
export async function clearRuntimeCaches() {
  if (!("caches" in window)) return;
  const names = await caches.keys();
  await Promise.all(names.filter((name) => !name.includes("precache")).map((name) => caches.delete(name)));
}
