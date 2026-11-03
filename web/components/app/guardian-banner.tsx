"use client";

import { Hourglass, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { resendGuardianLink } from "@/lib/actions";
import type { Me } from "@/lib/me";
import { WHATSAPP_URL } from "@/lib/site";

// Shown on every /app page to a minor (13-17) whose parent or guardian hasn't approved yet.
export function GuardianBanner({ guardian }: { guardian: NonNullable<Me["guardian"]> }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const who = guardian.name?.split(" ")[0] || "your parent or guardian";
  const declined = guardian.status === "DECLINED";

  async function resend() {
    setPending(true);
    const result = await resendGuardianLink();
    setPending(false);
    if (!result.ok) return toast.error(result.error.message);
    toast.success(`We sent ${who} a new link.`);
    router.refresh();
  }

  return (
    <div role="status" className="flex flex-col gap-2 rounded-2xl border border-warn-line bg-card p-4 sm:flex-row sm:items-center sm:gap-4">
      {declined ? (
        <ShieldAlert className="size-6 shrink-0 text-warn" aria-hidden />
      ) : (
        <Hourglass className="size-6 shrink-0 text-warn" aria-hidden />
      )}
      <div className="flex-1">
        <p className="font-bold text-ink">
          {declined ? "Your parent or guardian said no" : "Waiting for your parent or guardian to approve"}
        </p>
        <p className="text-sm text-muted-foreground">
          {declined ? (
            <>Your account stays locked. If this is a mistake, talk to them and then message us.</>
          ) : guardian.link_expired ? (
            <>The link we sent {who} has expired. Send a new one.</>
          ) : (
            <>
              We emailed {who} a link. Until they approve, you can look around and see prices, but you can&apos;t request a
              pickup, add a bank account or withdraw.
            </>
          )}
        </p>
      </div>
      {!declined && guardian.resends_left > 0 && (
        <button type="button" onClick={resend} disabled={pending} className="d-btn d-btn-outline d-btn-sm">
          {pending ? "Sending…" : "Send the link again"}
        </button>
      )}
      {declined && WHATSAPP_URL && (
        <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="d-btn d-btn-outline d-btn-sm">
          Message us
        </a>
      )}
    </div>
  );
}
