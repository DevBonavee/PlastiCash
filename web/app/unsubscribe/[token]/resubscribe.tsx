"use client";

import { useState } from "react";
import { toast } from "sonner";

import { setSubscription } from "./actions";

export function Resubscribe({ token }: { token: string }) {
  const [subscribed, setSubscribed] = useState(false);
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    const result = await setSubscription(token, !subscribed);
    setPending(false);
    if (!result.ok) return toast.error(result.error.message);
    setSubscribed(result.data.subscribed);
    toast.success(result.data.subscribed ? "You're subscribed again." : "Unsubscribed.");
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={toggle} disabled={pending} className="d-btn d-btn-outline">
        {pending ? "Saving…" : subscribed ? "Unsubscribe again" : "Resubscribe"}
      </button>
    </div>
  );
}
