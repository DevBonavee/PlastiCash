// Run with `npm test` (Node's built-in test runner; Node 24 runs TypeScript directly).
import assert from "node:assert/strict";
import { test } from "node:test";

import { formatNgPhoneInput, isValidNgPhone, nationalPart, normalizeNgPhone } from "./phone.ts";

test("accepts the four ways people write a Nigerian number, with spaces or dashes", () => {
  for (const raw of [
    "08012345678",
    "8012345678",
    "+2348012345678",
    "2348012345678",
    "0801 234 5678",
    "0801-234-5678",
    "+234 801 234 5678",
  ]) {
    assert.equal(normalizeNgPhone(raw), "+2348012345678", raw);
  }
});

test("normalised numbers are +234 and 10 digits (13 digits after the plus)", () => {
  for (const raw of ["07012345678", "09112345678", "08112345678"]) {
    const phone = normalizeNgPhone(raw);
    assert.ok(phone?.startsWith("+234"));
    assert.equal(phone?.length, 14); // "+" and 13 digits
  }
});

test("rejects wrong prefixes, lengths and characters", () => {
  for (const raw of [
    "",
    "08212345678", // second digit must be 0 or 1
    "06012345678", // first digit must be 7, 8 or 9
    "0801234567", // too short
    "080123456789", // too long
    "+2338012345678", // not Nigeria
    "(0801) 234 5678", // brackets
    "0801.234.5678",
    "0801234567a",
    "008012345678",
  ]) {
    assert.equal(normalizeNgPhone(raw), null, raw);
    assert.equal(isValidNgPhone(raw), false, raw);
  }
});

test("formats the box as 801 234 5678 while typing", () => {
  assert.equal(formatNgPhoneInput("8"), "8");
  assert.equal(formatNgPhoneInput("8012"), "801 2");
  assert.equal(formatNgPhoneInput("801234"), "801 234");
  assert.equal(formatNgPhoneInput("8012345678"), "801 234 5678");
  assert.equal(formatNgPhoneInput("08012345678"), "801 234 5678");
  assert.equal(formatNgPhoneInput("+234 801-234-5678"), "801 234 5678");
  assert.equal(formatNgPhoneInput("80123456789999"), "801 234 5678");
  assert.equal(nationalPart("+2348012345678"), "801 234 5678");
  assert.equal(nationalPart(null), "");
});
