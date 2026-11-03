import assert from "node:assert/strict";
import { test } from "node:test";

import { ageOn, lagosToday } from "./age.ts";

test("age counts whole birthdays", () => {
  assert.equal(ageOn("2010-11-03", "2026-11-03"), 16);
  assert.equal(ageOn("2010-11-04", "2026-11-03"), 15);
  assert.equal(ageOn("2013-12-31", "2026-11-03"), 12);
  assert.equal(ageOn("nonsense", "2026-11-03"), null);
});

test("Lagos is an hour ahead of UTC", () => {
  assert.equal(lagosToday(new Date("2026-11-03T23:30:00Z")), "2026-11-04");
  assert.equal(lagosToday(new Date("2026-11-03T22:30:00Z")), "2026-11-03");
});
