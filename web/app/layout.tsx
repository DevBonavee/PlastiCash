import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { OfflineBanner } from "@/components/brand/offline-banner";
import { Preloader } from "@/components/brand/preloader";
import { PreloaderDone } from "@/components/brand/preloader-done";
import { PwaProvider } from "@/components/brand/pwa";
import { CookieConsent } from "@/components/consent/cookie-consent";
import { ThemeProvider } from "@/components/brand/theme";
import { Toaster } from "@/components/ui/sonner";

import { SITE_DESCRIPTION, SITE_URL } from "@/lib/site";

import "./globals.css";

// Fonts (docs/DESIGN_BRIEF.md §5.4): display and balances, UI and body, numbers and codes.
// Self-hosted variable fonts in app/fonts. next/font/google downloaded them while compiling, and when that download
// failed (offline, slow network) the dev server silently fell back to system fonts until the next clean restart.
// Bricolage and Jakarta are Google's latin subsets (OFL); Geist Mono is Vercel's full file (OFL), one download
// covering latin and latin-ext. None of them draws "₦" (U+20A6); the browser takes that glyph from a system font.
const bricolage = localFont({
  src: "./fonts/BricolageGrotesque-latin.woff2",
  variable: "--font-bricolage",
  weight: "200 800",
  display: "swap",
});

const jakarta = localFont({
  src: "./fonts/PlusJakartaSans-latin.woff2",
  variable: "--font-jakarta",
  weight: "200 800",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "PlastiCash by EcoCyclers", template: "%s · PlastiCash" },
  description: SITE_DESCRIPTION,
  applicationName: "PlastiCash",
  openGraph: {
    type: "website",
    siteName: "PlastiCash by EcoCyclers",
    locale: "en_NG",
    title: "PlastiCash: your plastic is money",
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: "PlastiCash: your plastic is money", description: SITE_DESCRIPTION },
  formatDetection: { telephone: false },
  // Installed on iPhone: full screen without Safari's bar, home-screen name and icon (iOS ignores the manifest icons).
  appleWebApp: { capable: true, title: "PlastiCash", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icons/favicon.ico", sizes: "48x48" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#15803D" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1410" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is set by next-themes before paint (light, dark or the device's), hence suppressHydrationWarning.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bricolage.variable} ${jakarta.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          {/* After next-themes' inline script, so data-theme is already set when this paints. */}
          <Preloader />
          <PreloaderDone />
          <PwaProvider>
            <OfflineBanner />
            {children}
            <Toaster />
            <CookieConsent />
          </PwaProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
