/// <reference lib="webworker" />
// PlastiCash service worker (Serwist). Built by app/serwist/[path]/route.ts and served at /serwist/sw.js with scope "/".
//
// CLAUDE.md rule 11: it never caches money or personal data. Only static assets (JS/CSS chunks, fonts, icons, the
// logo), the offline page and the public pages /, /guide and /privacy are cached. API calls, Supabase (auth and
// Realtime), Paystack, Cloudinary and every logged-in or token page always go to the network. A failed navigation
// shows /offline. Logging out deletes the runtime caches (components/auth/logout-button.tsx).
//
// It also shows the admins' push notifications for new pickup requests (moved here from public/sw.js).
import type { PrecacheEntry, RouteMatchCallbackOptions, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Inlined at build time (see the route's esbuild `define`).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const apiOrigin = API_URL ? new URL(API_URL).origin : "";

const PUBLIC_CACHE = "public-pages";
const IMAGE_CACHE = "static-images";

/** Pages anyone sees the same way: safe to keep for offline reading. */
const PUBLIC_PAGES = new Set(["/", "/guide", "/privacy"]);

/** Never cached, never served from a cache. */
const PRIVATE_PATHS = ["/app", "/collector", "/ops-portal", "/guardian-consent", "/unsubscribe", "/signup", "/login", "/auth"];

const under = (path: string, prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));

function isPrivateRequest({ url, sameOrigin }: RouteMatchCallbackOptions) {
  if (!sameOrigin) {
    return (
      url.origin === apiOrigin ||
      url.hostname.endsWith(".supabase.co") ||
      url.hostname.endsWith("paystack.co") ||
      url.hostname.endsWith("paystack.com") ||
      url.hostname.endsWith("cloudinary.com") ||
      url.hostname.endsWith("posthog.com")
    );
  }
  return under(url.pathname, PRIVATE_PATHS) || url.pathname.startsWith("/_next/image");
}

const runtimeCaching: RuntimeCaching[] = [
  // First, so nothing below can ever match these.
  { matcher: isPrivateRequest, handler: new NetworkOnly() },
  {
    // Public pages: the HTML and the RSC payloads Next fetches when navigating to them.
    matcher: ({ url, sameOrigin, request }) =>
      sameOrigin && request.method === "GET" && PUBLIC_PAGES.has(url.pathname),
    handler: new StaleWhileRevalidate({
      cacheName: PUBLIC_CACHE,
      plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 7 * 24 * 60 * 60 })],
    }),
  },
  {
    // Our own images in public/ (icons, logo). Cloudinary photos are other origins and never match.
    matcher: ({ url, sameOrigin, request }) =>
      sameOrigin && request.destination === "image" && !url.pathname.startsWith("/_next/"),
    handler: new StaleWhileRevalidate({
      cacheName: IMAGE_CACHE,
      plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 })],
    }),
  },
  // Every other page: network only, so a failed load falls back to /offline below.
  { matcher: ({ request }) => request.mode === "navigate", handler: new NetworkOnly() },
];

const serwist = new Serwist({
  // App shell: JS/CSS chunks, fonts, icons and the logo from the build, plus /offline (added in the route).
  precacheEntries: self.__SW_MANIFEST,
  // A new version waits until the user taps "Refresh" in the update toast (components/brand/pwa.tsx).
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  disableDevLogs: true,
  runtimeCaching,
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();

// ----- Admin push notifications (new pickup requests) -----

self.addEventListener("push", (event) => {
  let message: { title: string; body: string; url: string; tag?: string } = {
    title: "PlastiCash",
    body: "",
    url: "/ops-portal",
  };
  try {
    message = { ...message, ...event.data?.json() };
  } catch {
    if (event.data) message.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: message.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/ops-portal", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reuse an open PlastiCash window if there is one; otherwise open a new one.
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        return open.navigate(url);
      }
      return self.clients.openWindow(url);
    })(),
  );
});
