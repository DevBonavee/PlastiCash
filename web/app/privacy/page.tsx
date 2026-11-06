import type { Metadata } from "next";

import { Card } from "@/components/brand/ui";
import { CookieSettingsLink } from "@/components/consent/cookie-settings-link";
import { SiteFooter, SiteHeader } from "@/components/public/site-chrome";
import { ACTIVITIES } from "@/lib/privacy-register";
import { HUB, WHATSAPP_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "What personal data PlastiCash collects, why, who we share it with, how long we keep it, and your rights under the Nigeria Data Protection Act 2023.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "3 November 2026";

// Built from docs/privacy/processing-register.md (data: lib/privacy-register.ts).
export default function PrivacyPage() {
  return (
    <div className="flex min-h-svh flex-col bg-canvas">
      <SiteHeader />
      <main className="container-site flex flex-1 flex-col gap-6 py-6 lg:py-10">
        <div className="max-w-3xl">
          <span className="eyebrow text-primary">Privacy</span>
          <h1 className="mt-1 text-[28px] leading-tight font-bold lg:text-4xl">Privacy notice</h1>
          <p className="mt-3 text-muted-foreground">
            PlastiCash is run by EcoCyclers, {HUB.address}, Enugu. This page explains what we collect when you use
            PlastiCash, why, who sees it and what you can do about it. It follows the Nigeria Data Protection Act 2023
            (NDPA). Last updated {UPDATED}.
          </p>
        </div>

        <nav aria-label="On this page" className="flex max-w-3xl flex-wrap gap-2 text-sm">
          {[
            ["#what", "What we collect"],
            ["#children", "Under 18"],
            ["#cookies", "Cookies"],
            ["#where", "Where it's kept"],
            ["#rights", "Your rights"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="rounded-full border border-border bg-card px-3 py-1.5 font-semibold hover:border-primary">
              {label}
            </a>
          ))}
        </nav>

        <section id="what" className="flex flex-col gap-3" aria-labelledby="what-h">
          <h2 id="what-h" className="text-2xl font-bold">
            What we collect and why
          </h2>
          <p className="max-w-3xl text-muted-foreground">
            The law lets us use personal data only for a reason it accepts. For each use we name ours: <b>contract</b>{" "}
            (we need it to pick up your plastic and pay you), <b>legal obligation</b> (the law makes us), <b>consent</b>{" "}
            (only if you say yes, and you can change your mind), or <b>legitimate interest</b> (a fair business need that
            doesn&apos;t override your rights). We don&apos;t sell your data.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {ACTIVITIES.map((a) => (
              <Card key={a.id} className="gap-2">
                <h3 id={a.id} className="text-[17px] font-bold">
                  {a.title}
                </h3>
                <dl className="grid gap-1.5 text-sm sm:grid-cols-[120px_1fr]">
                  <Row label="What">{a.what}</Row>
                  <Row label="Why">{a.why}</Row>
                  <Row label="Legal reason">{a.basis}</Row>
                  <Row label="Shared with">{a.shared}</Row>
                  <Row label="Kept for">{a.kept ?? "To be confirmed."}</Row>
                  <Row label="Your choice">{a.control}</Row>
                </dl>
              </Card>
            ))}
          </div>
        </section>

        <section id="children" className="flex max-w-3xl flex-col gap-2" aria-labelledby="children-h">
          <h2 id="children-h" className="text-2xl font-bold">
            Under 18
          </h2>
          <p>
            PlastiCash is for ages 13 and up. Under the NDPA anyone under 18 is a child, so if you are 13 to 17 we ask your
            parent or guardian to approve your account first. We email them a link (and text it when SMS is on) that
            explains what we collect. Until they say yes you can look around and see prices, but you can&apos;t request a
            pickup, add a bank account or withdraw. Money you earn can only be paid into a bank account in your parent or
            guardian&apos;s name.
          </p>
        </section>

        <section id="cookies" className="flex max-w-3xl flex-col gap-2" aria-labelledby="cookies-h">
          <h2 id="cookies-h" className="text-2xl font-bold">
            Cookies
          </h2>
          <p>
            <b>Essential cookies</b> keep you logged in (from Supabase, our login provider), remember dark mode, and
            remember your cookie choice (<code>pc_consent</code>, for 12 months). The app doesn&apos;t work without them,
            so they don&apos;t need your consent.
          </p>
          <p>
            <b>Analytics</b> (PostHog, hosted in the EU) is off until you accept it. It counts the pages you visit and a
            few steps, like finishing sign-up or requesting a pickup, linked to your account ID. It never receives your
            name, phone, address, bank details or amounts. It doesn&apos;t run at all on the collector and staff pages.
          </p>
          <p>
            <b>Session recordings</b> have their own switch and stay off unless you turn them on. Accepting analytics
            doesn&apos;t turn them on. Everything you type and all text on the page is hidden in a recording, and we never
            record your wallet or settings.
          </p>
          <p>
            You can change your choice at any time: <CookieSettingsLink className="font-semibold text-primary underline underline-offset-2" />.
          </p>
        </section>

        <section id="where" className="flex max-w-3xl flex-col gap-2" aria-labelledby="where-h">
          <h2 id="where-h" className="text-2xl font-bold">
            Where your data is kept
          </h2>
          <p>
            Our database and logins are with Supabase in the EU (Ireland), and our server runs on Render in Frankfurt.
            Photos are stored with Cloudinary. Paystack (Nigeria) checks bank accounts and sends payouts, Termii sends SMS,
            Resend sends email, OpenStreetMap provides the map and street lookup, NIPOST can also provide the street lookup, and Vercel hosts the website. These companies process data for us under their own
            security terms. Sending data outside Nigeria is allowed under the NDPA when the destination protects it
            adequately.
          </p>
        </section>

        <section id="rights" className="flex max-w-3xl flex-col gap-2" aria-labelledby="rights-h">
          <h2 id="rights-h" className="text-2xl font-bold">
            Your rights
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>See a copy of the data we hold about you.</li>
            <li>Correct anything that&apos;s wrong. Most of it you can change yourself in Settings.</li>
            <li>Ask us to delete your data, unless the law makes us keep it (for example, payment records).</li>
            <li>Object to a use based on legitimate interest, or withdraw consent you gave, at any time.</li>
            <li>Get your data in a format you can take elsewhere.</li>
            <li>
              Complain to the Nigeria Data Protection Commission (NDPC) if you think we&apos;ve handled your data badly.
            </li>
          </ul>
          <p>
            To ask for any of these, {WHATSAPP_URL ? (
              <>
                <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="font-semibold text-primary underline underline-offset-2">
                  message us on WhatsApp
                </a>{" "}
                or{" "}
              </>
            ) : null}
            visit the hub at {HUB.address}, {HUB.hours}.
            {/* TODO: confirm with Kenzy: a privacy contact email or named person */}
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="font-semibold text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}
