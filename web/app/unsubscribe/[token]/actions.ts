"use server";

import { api } from "@/lib/api";

export type Subscription = { email: string; subscribed: boolean };

// Public: the token from the email is the only key. Both are idempotent.
export async function setSubscription(token: string, subscribed: boolean) {
  const path = `/unsubscribe/${encodeURIComponent(token)}${subscribed ? "/resubscribe" : ""}`;
  return api<Subscription>(path, { method: "POST" });
}
