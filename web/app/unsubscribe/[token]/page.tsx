import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SiteFooter, SiteHeader } from "@/components/public/site-chrome";
import { Skeleton } from "@/components/ui/skeleton";

import { setSubscription } from "./actions";
import { Resubscribe } from "./resubscribe";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Params = Promise<{ token: string }>;

// The unsubscribe link in every marketing email: opening it unsubscribes at once, no login.
export default function UnsubscribePage({ params }: { params: Params }) {
  return (
    <div className="flex min-h-svh flex-col bg-canvas">
      <SiteHeader />
      <main className="container-site flex flex-1 flex-col py-10 lg:py-16">
        <div className="mx-auto w-full max-w-xl">
          <Suspense fallback={<Skeleton className="h-56 w-full rounded-3xl" />}>
            <Unsubscribed params={params} />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

async function Unsubscribed({ params }: { params: Params }) {
  const { token } = await params;
  const result = await setSubscription(token, false);
  if (!result.ok) {
    return (
      <section className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-6 lg:p-8">
        <h1 className="font-display text-2xl font-bold">This link doesn&apos;t work</h1>
        <p className="text-muted-foreground">
          {result.status === 404
            ? "We couldn't find this unsubscribe link. You can turn marketing emails off in Settings after logging in."
            : "Something went wrong on our side. Please open the link again in a minute."}
        </p>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 lg:p-8">
      <h1 className="font-display text-2xl font-bold">You&apos;re unsubscribed</h1>
      <p className="text-muted-foreground">
        We won&apos;t send tips, price updates or offers to {result.data.email} any more. Emails about your pickups,
        withdrawals and password still come.
      </p>
      <Resubscribe token={token} />
      <p className="text-sm text-muted-foreground">
        <Link href="/privacy" className="font-semibold text-primary underline underline-offset-2">
          Privacy notice
        </Link>
      </p>
    </section>
  );
}
