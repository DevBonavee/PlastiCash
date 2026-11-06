"use client";

import { toast } from "sonner";

import { reverseGeocode, type ReverseGeocode } from "@/lib/actions";

// "Use my current location" on the address bar and the request form.
//
// Laptops have no GPS: a high-accuracy request often runs out its time there. So we ask for a precise fix first
// and, if it times out or the device can't get one, ask again for the Wi-Fi/network position (accurate to a street
// or two, good enough to start the pin; the user drags it to the gate).

export type LocationResult = { ok: true; lat: number; lng: number } | { ok: false; message: string };

const ask = (options: PositionOptions) =>
  new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));

function explain(error: unknown): string {
  if (!window.isSecureContext) {
    // Browsers only share location on https:// pages (and http://localhost).
    return "Location only works on the secure (https) site. Drag the pin or type the street instead.";
  }
  const code = (error as GeolocationPositionError | undefined)?.code;
  if (code === 1) {
    return "Location is blocked for PlastiCash. Allow it in your browser's site settings (the icon left of the address), then try again.";
  }
  if (code === 3) return "Finding your location took too long. Try again outside or near a window, or drag the pin.";
  return "Your device couldn't find your location. Check that location is on, or drag the pin.";
}

export async function currentLocation(): Promise<LocationResult> {
  if (!("geolocation" in navigator)) {
    return { ok: false, message: "This browser can't share a location. Drag the pin or type the street instead." };
  }
  try {
    const pos = await ask({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 });
    return { ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch (first) {
    // Permission denied won't change on a second try; say so straight away.
    if ((first as GeolocationPositionError).code === 1 || !window.isSecureContext) return { ok: false, message: explain(first) };
    try {
      const pos = await ask({ enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 });
      return { ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch (second) {
      return { ok: false, message: explain(second) };
    }
  }
}

// The street and area at the pin, from OpenStreetMap through our API (app/services/geocoding.py), after a tap on the
// button only: Nominatim's usage policy rules out lookups on every pin drag. Its streets can be missing or a road off,
// so the form stays editable and it says so.
export async function addressAt(lat: number, lng: number): Promise<ReverseGeocode> {
  const result = await reverseGeocode(lat, lng);
  if (!result.ok) {
    toast("Your pin is on the map, but we couldn't look up the street just now. Please type it.");
    return { street: null, area: null };
  }
  const place = result.data;
  if (place.street) toast.success("Address filled in from OpenStreetMap. Check it and add your house number.");
  else if (place.area) toast(`We found ${place.area}, but this road has no name on the map. Please type your street.`);
  else toast("Your pin is on the map, but this spot has no street name on the map. Please type your street and area.");
  return place;
}
