import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { SiteFooter, SiteHeader } from "@/components/public/site-chrome";
import { Skeleton } from "@/components/ui/skeleton";

import { ConsentChoice } from "./consent-choice";

export const metadata: Metadata = {
  title: "Parent or guardian consent",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

type Request = { child_first_name: string; guardian_name: string | null; expires_at: string };

// Public page from the link we email (and text) to a minor's parent or guardian. Reading it changes nothing;
// only the buttons do, so link scanners in email apps can't answer for the guardian.
type Params = Promise<{ token: string }>;

export default function GuardianConsentPage({ params }: { params: Params }) {
  return (
    <div className="flex min-h-svh flex-col bg-canvas">
      <SiteHeader />
      <main className="container-site flex flex-1 flex-col py-10 lg:py-16">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-3xl" />}>
            <Consent params={params} />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

async function Consent({ params }: { params: Params }) {
  await connection();
  const { token } = await params;
  let request: Request | null = null;
  let problem = "This link has already been used or isn't valid.";
  try {
    const response = await fetch(`${API_URL}/guardian-consent/${encodeURIComponent(token)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) request = (await response.json()) as Request;
    else problem = ((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? problem;
  } catch {
    problem = "We couldn't load this page. Check your connection and open the link again.";
  }

  if (!request) {
    return (
      <section className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-6 lg:p-8">
        <h1 className="font-display text-2xl font-bold">This link doesn&apos;t work any more</h1>
        <p className="text-muted-foreground">{problem}</p>
      </section>
    );
  }

  const child = request.child_first_name;
  return (
    <section className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-6 lg:p-8">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">Parent or guardian consent</p>
        <h1 className="font-display text-[28px] leading-tight font-bold">
          {child} wants to sell plastic with PlastiCash
        </h1>
        <p className="text-muted-foreground">
          PlastiCash is run by EcoCyclers in Enugu. People bring us plastic bottles, sachets and cans, we weigh them, and
          we pay for them. {child} is under 18, so the Nigeria Data Protection Act 2023 says we need your consent before we
          use their details.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">What we collect and why</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px]">
          <li>Name, phone number and email, to run the account and text pickup codes.</li>
          <li>Date of birth, to check their age.</li>
          <li>Pickup address and an optional map pin, so a collector can find the plastic.</li>
          <li>Photos of the plastic and the weights, so everyone can check the payment.</li>
          <li>
            Payments in points (1 point = ₦1). Withdrawals go only to a bank account in your name, and we check the name
            with the bank.
          </li>
          <li>Your name, phone and email, to ask for and record this consent.</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          We don&apos;t sell this data or use it for advertising to {child}. You can withdraw consent at any time by
          messaging us, and the account will be locked again. Full details are in our{" "}
          <Link href="/privacy" className="font-semibold text-primary underline underline-offset-2">
            privacy notice
          </Link>
          .
        </p>
      </div>

      <ConsentChoice token={token} child={child} />
    </section>
  );
}
