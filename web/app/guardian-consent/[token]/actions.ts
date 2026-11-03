"use server";

import { api } from "@/lib/api";

export type ConsentResult = { ok: true; status: "GRANTED" | "DECLINED"; child: string } | { ok: false; message: string };

// The guardian's answer. Public: the token in the link is the only key, and it works once.
export async function answerConsent(token: string, decision: "GRANT" | "DECLINE"): Promise<ConsentResult> {
  const result = await api<{ status: "GRANTED" | "DECLINED"; child_first_name: string }>(
    `/guardian-consent/${encodeURIComponent(token)}`,
    { method: "POST", body: { decision } },
  );
  if (result.ok) return { ok: true, status: result.data.status, child: result.data.child_first_name };
  return { ok: false, message: result.error.message };
}
