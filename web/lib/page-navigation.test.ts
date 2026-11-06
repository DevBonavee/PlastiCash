import assert from "node:assert/strict";
import { test } from "node:test";

import { opensNewPage } from "./page-navigation.ts";

const here = "http://localhost:3000/guide?tab=one";
const plainClick = { button: 0, modified: false, target: "", download: false };

test("a plain click on a link to another page opens a new page", () => {
  assert.equal(opensNewPage("http://localhost:3000/blog", here, plainClick), true);
  assert.equal(opensNewPage("http://localhost:3000/", here, plainClick), true);
  assert.equal(opensNewPage("http://localhost:3000/blog", here, { ...plainClick, target: "_self" }), true);
});

test("staying on the same page does not", () => {
  assert.equal(opensNewPage(here, here, plainClick), false);
  assert.equal(opensNewPage("http://localhost:3000/guide#steps", here, plainClick), false);
  assert.equal(opensNewPage("http://localhost:3000/guide?tab=two", here, plainClick), false);
});

test("other sites and other schemes do not", () => {
  assert.equal(opensNewPage("https://paystack.com/pay", here, plainClick), false);
  assert.equal(opensNewPage("mailto:hello@example.com", here, plainClick), false);
  assert.equal(opensNewPage("tel:+2348000000000", here, plainClick), false);
  assert.equal(opensNewPage("http://localhost:8000/api/v1/report.pdf", here, plainClick), false);
});

test("clicks that leave this tab alone do not", () => {
  const blog = "http://localhost:3000/blog";
  assert.equal(opensNewPage(blog, here, { ...plainClick, target: "_blank" }), false);
  assert.equal(opensNewPage(blog, here, { ...plainClick, modified: true }), false);
  assert.equal(opensNewPage(blog, here, { ...plainClick, button: 1 }), false);
  assert.equal(opensNewPage(blog, here, { ...plainClick, download: true }), false);
});

test("a broken href does not", () => {
  assert.equal(opensNewPage("http://", here, plainClick), false);
});
