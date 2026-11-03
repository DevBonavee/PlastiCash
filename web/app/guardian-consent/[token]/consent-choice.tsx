"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { answerConsent } from "./actions";

export function ConsentChoice({ token, child }: { token: string; child: string }) {
  const [pending, setPending] = useState<"GRANT" | "DECLINE" | null>(null);
  const [done, setDone] = useState<"GRANTED" | "DECLINED" | null>(null);

  async function answer(decision: "GRANT" | "DECLINE") {
    setPending(decision);
    const result = await answerConsent(token, decision);
    setPending(null);
    if (!result.ok) return toast.error(result.message);
    setDone(result.status);
  }

  if (done) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-2xl bg-mist p-4">
        {done === "GRANTED" ? (
          <CheckCircle2 className="size-6 shrink-0 text-primary" aria-hidden />
        ) : (
          <XCircle className="size-6 shrink-0 text-bad" aria-hidden />
        )}
        <p className="font-medium">
          {done === "GRANTED"
            ? `Thank you. ${child} can now request pickups and get paid.`
            : `Thank you. ${child}'s account stays locked, and we won't use their details for pickups or payments.`}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <button type="button" className="d-btn d-btn-primary sm:flex-1" disabled={pending !== null} onClick={() => answer("GRANT")}>
        {pending === "GRANT" ? "Saving…" : "I consent"}
      </button>
      <button type="button" className="d-btn d-btn-outline sm:flex-1" disabled={pending !== null} onClick={() => answer("DECLINE")}>
        {pending === "DECLINE" ? "Saving…" : "I don't consent"}
      </button>
    </div>
  );
}
