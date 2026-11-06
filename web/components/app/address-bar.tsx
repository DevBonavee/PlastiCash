"use client";

import { ChevronRight, LocateFixed, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { PinPicker } from "@/components/app/maps";
import { Btn } from "@/components/brand/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile } from "@/lib/actions";
import { AREAS } from "@/lib/areas";
import { addressAt, currentLocation } from "@/lib/location";
import type { Me } from "@/lib/me";
import { LAPTOP, useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

type Saved = Pick<Me, "address" | "area" | "lat" | "lng">;

const selectClass =
  "h-13 w-full rounded-input border border-input bg-card px-3.5 text-base font-medium outline-none focus-visible:border-2 focus-visible:border-primary";

// "Delivering to"-style bar at the top of the dashboard: the saved pickup address, tap to change it.
export function AddressBar({ saved }: { saved: Saved }) {
  const [open, setOpen] = useState(false);
  const isLaptop = useMediaQuery(LAPTOP);
  const hasAddress = !!(saved.address && saved.area);

  const editor = <AddressEditor saved={saved} onSaved={() => setOpen(false)} />;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary",
          hasAddress ? "border-border" : "border-warn-line",
        )}
        aria-haspopup="dialog"
      >
        <MapPin className={cn("size-5 shrink-0", hasAddress ? "text-primary" : "text-warn")} aria-hidden />
        <span className="min-w-0 flex-1">
          {hasAddress ? (
            <>
              <span className="block text-xs font-semibold tracking-wide text-muted-foreground uppercase">Pickup address</span>
              <span className="block truncate font-semibold text-ink">
                {saved.address}, {saved.area}
              </span>
            </>
          ) : (
            <span className="block font-semibold text-warn">Add your pickup address</span>
          )}
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {isLaptop ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Pickup address</DialogTitle>
              <DialogDescription>Collectors come here. You can still change it for a single pickup.</DialogDescription>
            </DialogHeader>
            {editor}
          </DialogContent>
        </Dialog>
      ) : (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle className="text-lg font-bold">Pickup address</DrawerTitle>
              <p className="text-sm text-muted-foreground">Collectors come here. You can still change it for a single pickup.</p>
            </DrawerHeader>
            <div className="overflow-y-auto p-4">{editor}</div>
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
}

function AddressEditor({ saved, onSaved }: { saved: Saved; onSaved: () => void }) {
  const router = useRouter();
  const [address, setAddress] = useState(saved.address ?? "");
  const [area, setArea] = useState(saved.area ?? "");
  const [pin, setPin] = useState<[number, number] | null>(
    saved.lat !== null && saved.lng !== null ? [saved.lat, saved.lng] : null,
  );
  const [locating, setLocating] = useState(false);
  const [pending, setPending] = useState(false);

  async function useMyLocation() {
    setLocating(true);
    const result = await currentLocation();
    if (!result.ok) {
      setLocating(false);
      return toast.error(result.message);
    }
    setPin([result.lat, result.lng]);
    const place = await addressAt(result.lat, result.lng);
    setLocating(false);
    if (place.street) setAddress(place.street);
    if (place.area) setArea(place.area);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!address.trim() || !area) return toast.error("Add the street and choose your area.");
    setPending(true);
    const result = await updateProfile({
      address: address.trim(),
      area,
      lat: pin ? Number(pin[0].toFixed(6)) : null,
      lng: pin ? Number(pin[1].toFixed(6)) : null,
    });
    setPending(false);
    if (!result.ok) return toast.error(result.error.message);
    toast.success("Pickup address saved.");
    onSaved();
    router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="bar-address">Street address</Label>
        <Input
          id="bar-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          autoComplete="street-address"
          placeholder="e.g. 7 Ezillo Street"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="bar-area">Area</Label>
        <select id="bar-area" value={area} onChange={(e) => setArea(e.target.value)} className={selectClass}>
          <option value="" disabled>
            Choose your area
          </option>
          {AREAS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="flex min-h-11 items-center gap-1.5 self-start text-sm font-bold text-primary disabled:opacity-60"
        >
          <LocateFixed className="size-4" aria-hidden /> {locating ? "Finding you…" : "Use my current location"}
        </button>
        {pin && (
          <>
            <PinPicker value={pin} onChange={(lat, lng) => setPin([lat, lng])} />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" aria-hidden /> Drag the pin to your gate.
              </span>
              <button type="button" onClick={() => setPin(null)} className="min-h-9 font-semibold text-primary">
                Remove pin
              </button>
            </div>
          </>
        )}
      </div>
      <Btn type="submit" variant="primary" block disabled={pending}>
        {pending ? "Saving…" : "Save address"}
      </Btn>
    </form>
  );
}
