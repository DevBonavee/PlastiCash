import assert from "node:assert/strict";
import { test } from "node:test";

import { NO_ANALYTICS, NO_RECORDING, under } from "./analytics.ts";
import { parseConsent } from "./consent.ts";

test("reads a saved choice and ignores anything else", () => {
  assert.deepEqual(parseConsent(encodeURIComponent('{"analytics":true,"replay":false,"v":1}')), {
    analytics: true,
    replay: false,
    v: 1,
  });
  assert.equal(parseConsent(undefined), null);
  assert.equal(parseConsent("not json"), null);
  assert.equal(parseConsent('{"analytics":true,"v":2}'), null, "old versions ask again");
});

test("recordings are never on without analytics", () => {
  assert.equal(parseConsent('{"analytics":false,"replay":true,"v":1}')?.replay, false);
  assert.equal(parseConsent('{"analytics":true,"v":1}')?.replay, false, "accepting analytics doesn't turn recordings on");
});

test("no analytics on the collector and ops portals; no recordings on wallet and settings either", () => {
  for (const path of ["/collector", "/collector/walk-in", "/ops-portal/users"]) assert.ok(under(path, NO_ANALYTICS), path);
  for (const path of ["/", "/app", "/app/wallet", "/collectors-guide"]) assert.ok(!under(path, NO_ANALYTICS), path);
  for (const path of ["/app/wallet", "/app/settings", "/ops-portal"]) assert.ok(under(path, NO_RECORDING), path);
  assert.ok(!under("/app/request", NO_RECORDING));
});
