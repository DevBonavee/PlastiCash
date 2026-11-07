import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { CookieSettingsLink } from "@/components/consent/cookie-settings-link";
import { ThemeToggle } from "@/components/brand/theme";
import { PhotoCarousel, WELCOME_SLIDES } from "@/components/brand/photo-carousel";
import { getHeroSlides } from "@/lib/content";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description: string;
  children: ReactNode;
  // Under the form and its buttons on every screen, e.g. "New here? Create an account".
  footer: ReactNode;
  // "Step 1 of 2" with segments, for sign-up.
  step?: { current: number; total: number };
};

// Auth pages (docs/DESIGN_BRIEF.md §6.1, §9): split screen on a laptop (600 px photo carousel, form max 560 px);
// on a phone a forest header with the logo, then the form on a rounded sheet. The carousel shows the welcome lines
// over the same photos the admin uploads for the landing hero.
export function AuthCard({ title, description, children, footer, step }: Props) {
  return (
    <div className="flex flex-1 flex-col bg-canvas lg:grid lg:min-h-svh lg:grid-cols-[600px_1fr] lg:bg-card">
      <div className="hidden lg:block">
        <Suspense fallback={<PhotoCarousel slides={WELCOME_SLIDES} />}>
          <WelcomeCarousel />
        </Suspense>
      </div>

      {/* Phone header */}
      <div
        className="relative flex h-28 shrink-0 items-start px-4 pt-4 lg:hidden"
        style={{ background: "linear-gradient(160deg, #052E16 10%, #166534)" }}
      >
        <Link href="/" aria-label="PlastiCash home">
          <Logo variant="white" size={36} />
        </Link>
        <ThemeToggle dark className="ml-auto" />
      </div>

      <main className="relative -mt-9 flex flex-1 flex-col gap-5 rounded-t-[28px] bg-canvas px-4 pt-6 pb-6 lg:mt-0 lg:rounded-none lg:bg-card lg:px-[72px] lg:pt-6">
        <div className="hidden items-center justify-between lg:flex">
          <Link href="/" aria-label="PlastiCash home">
            <Logo size={38} />
          </Link>
          <ThemeToggle />
        </div>

        <div className="mx-auto flex w-full max-w-[440px] flex-col gap-4 lg:mt-4">
          {step && (
            <div className="flex items-center gap-3">
              <span className="eyebrow shrink-0 text-primary">
                Step {step.current} of {step.total}
              </span>
              <div className="flex flex-1 gap-1.5" aria-hidden>
                {Array.from({ length: step.total }, (_, i) => (
                  <i key={i} className={cn("h-[5px] flex-1 rounded-full", i < step.current ? "bg-primary" : "bg-border")} />
                ))}
              </div>
            </div>
          )}
          <div>
            <h1 className="text-[26px] leading-tight font-bold lg:text-[38px] lg:leading-none lg:font-extrabold lg:tracking-[-0.03em]">
              {title}
            </h1>
            <p className="mt-2 text-[15px] text-muted-foreground">{description}</p>
          </div>
          {children}
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t border-border pt-4 text-[11px] text-muted-foreground min-[360px]:text-xs lg:gap-x-4">
            <div className="whitespace-nowrap lg:text-sm">{footer}</div>
            <span className="whitespace-nowrap">
              <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
                Privacy
              </Link>{" "}
              and{" "}
              <CookieSettingsLink className="underline underline-offset-2 hover:text-foreground">
                Cookies<span className="sr-only"> settings</span>
              </CookieSettingsLink>
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}

async function WelcomeCarousel() {
  const photos = (await getHeroSlides()).map((s) => s.image_url);
  return <PhotoCarousel slides={WELCOME_SLIDES} photos={photos} />;
}
