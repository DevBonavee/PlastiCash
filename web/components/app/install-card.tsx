"use client";

import { Download, Share, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { LogoMark } from "@/components/brand/logo";
import { Btn, Card } from "@/components/brand/ui";
import {
  installCardSnoozed,
  iosTipSeen,
  markIosTipSeen,
  promptInstall,
  snoozeInstallCard,
  useInstallState,
} from "@/lib/pwa";

const noop = () => () => {};

// /app: "Install PlastiCash" (Chrome and Android), or a one-time "Add to Home Screen" tip on iPhone. Hidden once
// installed, and for 14 days after "Not now".
export function InstallCard() {
  const state = useInstallState();
  // localStorage is only readable in the browser; the server render shows nothing.
  const hiddenAtLoad = useSyncExternalStore(
    noop,
    () => (state === "ios" ? iosTipSeen() : installCardSnoozed()),
    () => true,
  );
  const [closed, setClosed] = useState(false);
  if (closed || hiddenAtLoad || (state !== "prompt" && state !== "ios")) return null;

  function dismiss() {
    if (state === "ios") markIosTipSeen();
    else snoozeInstallCard();
    setClosed(true);
  }

  async function install() {
    if (await promptInstall()) toast.success("PlastiCash is on your home screen.");
  }

  return (
    // Wraps on phones: the Install button drops under the logo and text instead of squeezing them into a narrow column.
    <Card className="relative flex-row flex-wrap items-center gap-3 pr-14">
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
        <LogoMark size={44} />
        <div className="min-w-0 flex-1">
          <p className="font-bold">Install PlastiCash</p>
          {state === "ios" ? (
            <p className="text-sm text-muted-foreground">
              Tap <Share className="inline size-4 align-text-bottom" aria-label="Share" />, then Add to Home Screen.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Open it from your home screen, like any app.</p>
          )}
        </div>
      </div>
      {state === "prompt" && (
        <Btn size="sm" variant="primary" onClick={install}>
          <Download className="size-4" aria-hidden /> Install
        </Btn>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label={state === "ios" ? "Got it" : "Not now"}
        className="absolute top-2 right-2 grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <X className="size-5" aria-hidden />
      </button>
    </Card>
  );
}

// /app/settings: always there, says what to do on this browser.
export function InstallAppItem() {
  const state = useInstallState();
  return (
    <Card className="gap-2 lg:col-span-2">
      <h3 className="text-[17px] font-bold">Install app</h3>
      {state === "installed" ? (
        <p className="text-sm text-muted-foreground">PlastiCash is installed on this device.</p>
      ) : state === "prompt" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Add PlastiCash to your home screen and open it like any app.</p>
          <Btn size="sm" variant="outline" onClick={() => void promptInstall()}>
            <Download className="size-4" aria-hidden /> Install PlastiCash
          </Btn>
        </div>
      ) : state === "ios" ? (
        <p className="text-sm text-muted-foreground">
          In Safari, tap <Share className="inline size-4 align-text-bottom" aria-label="Share" />, then Add to Home Screen.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Open your browser&apos;s menu and choose &ldquo;Install app&rdquo; or &ldquo;Add to Home screen&rdquo;.
        </p>
      )}
    </Card>
  );
}
