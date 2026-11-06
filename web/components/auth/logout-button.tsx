"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Btn } from "@/components/brand/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { identify } from "@/lib/analytics";
import { clearRuntimeCaches } from "@/lib/pwa";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Account = { email: string | null; withGoogle: boolean };

// compact: icon only (phone headers). dark: glass style for forest backgrounds.
// Asks first, naming the account, since signing back in takes the password again.
export function LogoutButton({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [pending, setPending] = useState(false);

  async function askFirst() {
    const { data } = await createClient().auth.getSession();
    const user = data.session?.user;
    setAccount({ email: user?.email ?? null, withGoogle: user?.app_metadata?.provider === "google" });
  }

  async function logOut() {
    setPending(true);
    const { error } = await createClient().auth.signOut();
    if (error) {
      setPending(false);
      toast.error("Couldn't log out. Please try again.");
      return;
    }
    identify(null);
    // Nothing from this session stays in the app's caches on a shared phone.
    await clearRuntimeCaches().catch(() => undefined);
    // The login page shows the "You're logged out" toast and notice (from ?loggedOut=1).
    // Full page load, not router navigation: Next keeps visited pages alive in the background, and nothing
    // from the logged-in session (pages, form state, cached data) should survive a log-out.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate full reload, see above
    window.location.assign("/login?loggedOut=1");
  }

  return (
    <>
      <button
        type="button"
        onClick={askFirst}
        aria-label={compact ? "Log out" : undefined}
        className={cn(
          "d-btn d-btn-sm",
          dark ? "d-btn-glass" : "d-btn-outline",
          compact ? "w-10 px-0" : "w-full",
        )}
      >
        <LogOut className="size-4" aria-hidden />
        {!compact && "Log out"}
      </button>

      <Dialog
        open={account !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setAccount(null);
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="break-words">
              {account?.email ? `Log out of ${account.email}?` : "Log out of your account?"}
            </DialogTitle>
            <DialogDescription>
              {account?.withGoogle
                ? "You'll need to continue with Google to sign in again."
                : "You'll need your email and password to sign in again."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Btn variant="outline" disabled={pending} onClick={() => setAccount(null)}>
              Cancel
            </Btn>
            <Btn variant="danger" disabled={pending} onClick={logOut}>
              {pending ? "Logging out…" : "Log out"}
            </Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
