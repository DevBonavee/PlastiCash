// Nigerian mobile numbers. Same rule as api/app/phone.py, so the browser and the API accept the same numbers.
// No imports: this file is unit-tested directly with `node --test`.

export const PHONE_ERROR = "Enter a valid Nigerian phone number, e.g. 0801 234 5678";

// 10 digits after +234: first 7, 8 or 9, second 0 or 1.
const NATIONAL = /^[789][01]\d{8}$/;

/** "08012345678", "8012345678", "2348012345678", "+234 801-234-5678" -> "+2348012345678"; anything else -> null. */
export function normalizeNgPhone(raw: string): string | null {
  let value = raw.replace(/[\s-]/g, "");
  if (value.startsWith("+234")) value = value.slice(4);
  else if (value.startsWith("234") && value.length === 13) value = value.slice(3);
  else if (value.startsWith("0") && value.length === 11) value = value.slice(1);
  return NATIONAL.test(value) ? `+234${value}` : null;
}

export function isValidNgPhone(raw: string): boolean {
  return normalizeNgPhone(raw) !== null;
}

/** What goes in the box after the fixed "+234": up to 10 digits shown as "801 234 5678". A typed or pasted 0, 234 or
 * +234 at the front is dropped, so "08012345678" and "+2348012345678" both become "801 234 5678". */
export function formatNgPhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("234") && digits.length > 10) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)].filter(Boolean).join(" ");
}

/** "+2348012345678" -> "801 234 5678", for filling the box from a saved number. */
export function nationalPart(stored: string | null | undefined): string {
  return stored ? formatNgPhoneInput(stored) : "";
}
