import type { MetadataRoute } from "next";

// Installable PWA (docs/specs/03-screens-and-routes.md, "PWA"). The launch screen Android shows when the installed app
// opens is built from background_color and the icon: the logo on forest green, no text (Kenzy, 3 Nov 2026).
// Icons come from design/logo/plasticash-mark.svg via scripts/make-icons.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "PlastiCash by EcoCyclers",
    short_name: "PlastiCash",
    description: "Sell your plastic waste by weight in Enugu. 1 point = ₦1.",
    start_url: "/app?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#052E16",
    theme_color: "#15803D",
    categories: ["finance", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Request pickup",
        url: "/app/request",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      { name: "Wallet", url: "/app/wallet", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
