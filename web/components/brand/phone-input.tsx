"use client";

import { useId, useState, type ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { PHONE_ERROR, formatNgPhoneInput, nationalPart, normalizeNgPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

type Props = Omit<ComponentProps<"input">, "type" | "value" | "defaultValue" | "onChange"> & {
  /** Saved number (+234…) or whatever the user typed last time. */
  defaultValue?: string | null;
  /** Error from the server; shown instead of the browser's own check. */
  error?: string;
  /** Called with the normalised +234… number, or null while it isn't valid. */
  onValueChange?: (phone: string | null, typed: string) => void;
};

// Phone box with a fixed 🇳🇬 +234 in front, formatted as "801 234 5678" while typing. The form gets the number
// through a hidden input under `name`: "+2348012345678" when valid, else what was typed, so the API can say why.
export function PhoneInput({ name, defaultValue, error, onValueChange, className, onBlur, id, ...props }: Props) {
  const [typed, setTyped] = useState(() => nationalPart(defaultValue));
  const [touched, setTouched] = useState(false);
  const autoId = useId();
  const errorId = `${id ?? autoId}-error`;
  const normalized = normalizeNgPhone(typed);
  const shownError = error ?? (touched && typed && !normalized ? PHONE_ERROR : undefined);

  return (
    <>
      <div className="relative">
        <span className="tabular pointer-events-none absolute inset-y-0 left-3.5 flex items-center gap-2 border-r border-border pr-2.5 text-muted-foreground">
          <NigeriaFlag />
          +234
        </span>
        <Input
          {...props}
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="801 234 5678"
          value={typed}
          onChange={(event) => {
            const next = formatNgPhoneInput(event.target.value);
            setTyped(next);
            onValueChange?.(normalizeNgPhone(next), next);
          }}
          onBlur={(event) => {
            setTouched(true);
            onBlur?.(event);
          }}
          aria-invalid={!!shownError}
          aria-describedby={cn(props["aria-describedby"], shownError && errorId) || undefined}
          className={cn("tabular pl-[108px]", className)}
        />
        {name && <input type="hidden" name={name} value={normalized ?? typed} />}
      </div>
      {shownError && !error && (
        <p id={errorId} className="text-sm text-bad" aria-live="polite">
          {shownError}
        </p>
      )}
    </>
  );
}

function NigeriaFlag() {
  return (
    <svg viewBox="0 0 3 2" className="h-3.5 w-5 rounded-[2px] ring-1 ring-black/10" aria-hidden>
      <rect width="1" height="2" fill="#008751" />
      <rect x="1" width="1" height="2" fill="#fff" />
      <rect x="2" width="1" height="2" fill="#008751" />
    </svg>
  );
}
